import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import { auditLog } from "../schema/misc";
import { parseStudentRoster } from "@/lib/csv";
import {
  importStudentRoster,
  issuePublicPage,
  revokePublicPage,
  reissuePublicPage,
  listPublicPages,
  writeAudit,
} from "./index";

/**
 * 실DB 통합 테스트 (계획 §9 검증). 기본 `npm test` 에선 skip 되고,
 * `RUN_DB_ITEST=1` + `DATABASE_URL` 이 있을 때만 실제 서울 Supabase 에 붙어 실행한다.
 * 테스트 소유자(uuid)로만 데이터를 만들고 afterAll 에서 전부 정리한다.
 * (직접연결=postgres 역할은 RLS 를 우회하므로 쓰기/정리가 정상 동작.)
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099; // 실데이터와 충돌 없는 테스트 연도

describe.skipIf(!RUN)("DB 통합 — 명단/토큰/감사", () => {
  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    // 자식→부모 순으로 정리(혹시 cascade 누락 대비)
    await db.delete(auditLog).where(eq(auditLog.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner)); // cascade: student_years → public_pages
    await sql.end();
  });

  it("CSV 파싱 → 명단 임포트(신규 생성)", async () => {
    const csv = "학번,이름,연락처\n10203,홍길동,010-1111-2222\n10204,김철수,";
    const parsed = parseStudentRoster(csv);
    expect(parsed.errors).toEqual([]);

    const res = await importStudentRoster(db, owner, YEAR, parsed.rows);
    expect(res.created).toBe(2);
    expect(res.updated).toBe(0);

    const saved = await db
      .select({ sid: studentYears.sid, name: studentYears.name, grade: studentYears.grade })
      .from(studentYears)
      .where(and(eq(studentYears.ownerId, owner), eq(studentYears.schoolYear, YEAR)));
    expect(saved).toHaveLength(2);
    expect(saved.find((s) => s.sid === "10203")).toMatchObject({ name: "홍길동", grade: 1 });
  });

  it("재임포트는 갱신(중복 person 미생성)", async () => {
    const parsed = parseStudentRoster("학번,이름\n10203,홍길동개명");
    const res = await importStudentRoster(db, owner, YEAR, parsed.rows);
    expect(res.created).toBe(0);
    expect(res.updated).toBe(1);

    const persenCount = await db
      .select({ id: persons.id })
      .from(persons)
      .where(eq(persons.ownerId, owner));
    expect(persenCount).toHaveLength(2); // 여전히 2명(중복 생성 없음)
  });

  it("토큰 발급 → get_public_page 가 본인 페이로드(성적 준비중) 반환", async () => {
    const [sy] = await db
      .select({ id: studentYears.id })
      .from(studentYears)
      .where(and(eq(studentYears.ownerId, owner), eq(studentYears.sid, "10203")))
      .limit(1);

    const issued = await issuePublicPage(db, owner, sy.id, { teacherMessage: "안녕" });
    expect(issued.token).toMatch(/^[0-9a-f]{32}$/); // 128bit hex

    const [{ r }] = await sql<{ r: { state: string; payload?: { grades?: { status: string } } } }[]>`
      select get_public_page(${issued.token}) as r`;
    expect(r.state).toBe("ok");
    expect(r.payload?.grades?.status).toBe("preparing"); // Phase1 목업 → 준비중

    await writeAudit(db, owner, "token_issue", issued.id, { sid: "10203" });
  });

  it("폐기 후에는 revoked 상태", async () => {
    const [sy] = await db
      .select({ id: studentYears.id })
      .from(studentYears)
      .where(and(eq(studentYears.ownerId, owner), eq(studentYears.sid, "10204")))
      .limit(1);
    const issued = await issuePublicPage(db, owner, sy.id);

    await revokePublicPage(db, owner, issued.id);
    const [{ r }] = await sql<{ r: { state: string } }[]>`
      select get_public_page(${issued.token}) as r`;
    expect(r.state).toBe("revoked");
  });

  it("재발급은 기존 토큰 폐기 + 새 토큰 발급", async () => {
    const [sy] = await db
      .select({ id: studentYears.id })
      .from(studentYears)
      .where(and(eq(studentYears.ownerId, owner), eq(studentYears.sid, "10203")))
      .limit(1);
    const fresh = await reissuePublicPage(db, owner, sy.id);

    const [{ r }] = await sql<{ r: { state: string } }[]>`
      select get_public_page(${fresh.token}) as r`;
    expect(r.state).toBe("ok");

    // 학생의 활성(미폐기) 토큰은 정확히 1개
    const all = await listPublicPages(db, owner, sy.id);
    const active = all.filter((p) => p.revokedAt === null);
    expect(active).toHaveLength(1);
    expect(active[0].token).toBe(fresh.token);
  });

  it("감사 로그가 기록됨", async () => {
    const logs = await db
      .select({ eventType: auditLog.eventType })
      .from(auditLog)
      .where(eq(auditLog.ownerId, owner));
    expect(logs.some((l) => l.eventType === "token_issue")).toBe(true);
  });
});
