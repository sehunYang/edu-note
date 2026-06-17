import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { persons, studentYears } from "../db/schema/identity";
import { publicPages, studentCalendarMemos } from "../db/schema/misc";
import { issuePublicPage } from "../db/queries";
import { saveStudentMemo, deleteStudentMemo } from "./student-write";

/**
 * 학생 개인 메모 토큰 스코프 횡적접근 차단 통합 테스트 (QC v6 ⑤, AC-5.4 / consensus
 * Pre-mortem #2). 공개 페이지 최초 mutation 이므로 "학생 A 토큰으로 학생 B 메모를
 * 수정/삭제할 수 없다"를 실 DB 에 대해 증명한다. 보호는 (id AND student_year_id) 2중 키
 * 스코프(student-write.ts) — 토큰에서 도출한 student_year_id 만 사용.
 *
 * 0042 적용 전제. RUN_DB_ITEST 게이트(미설정 시 skip — 기존 통합테스트 관례).
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2096;
const DATE = "2026-06-20";
let syA: string;
let syB: string;
let tokenA: string;
let tokenB: string;

describe.skipIf(!RUN)("student-write 메모 — 토큰 스코프 횡적접근 차단(QC v6 ⑤)", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });

    const [pA] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: "학생A" })
      .returning({ id: persons.id });
    const [pB] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: "학생B" })
      .returning({ id: persons.id });

    [{ id: syA }] = await db
      .insert(studentYears)
      .values({
        ownerId: owner,
        personId: pA.id,
        schoolYear: YEAR,
        sid: "10401",
        grade: 1,
        classNo: 4,
        number: 1,
        name: "학생A",
      })
      .returning({ id: studentYears.id });
    [{ id: syB }] = await db
      .insert(studentYears)
      .values({
        ownerId: owner,
        personId: pB.id,
        schoolYear: YEAR,
        sid: "10402",
        grade: 1,
        classNo: 4,
        number: 2,
        name: "학생B",
      })
      .returning({ id: studentYears.id });

    tokenA = (await issuePublicPage(db, owner, syA)).token;
    tokenB = (await issuePublicPage(db, owner, syB)).token;
  });

  afterAll(async () => {
    // student_calendar_memos 는 student_years FK on delete cascade 로 함께 삭제된다.
    await db.delete(publicPages).where(eq(publicPages.ownerId, owner));
    await db.delete(studentYears).where(eq(studentYears.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner));
    await sql.end();
  });

  it("타 토큰으로 타학생 메모를 수정/삭제할 수 없고, 본인 메모는 정상 CRUD", async () => {
    // 1) B 가 본인 메모 생성
    const created = await saveStudentMemo(tokenB, DATE, "B의 비밀 메모");
    expect(created.ok).toBe(true);
    const bMemos = await db
      .select()
      .from(studentCalendarMemos)
      .where(eq(studentCalendarMemos.studentYearId, syB));
    expect(bMemos).toHaveLength(1);
    const bId = bMemos[0].id;

    // 2) A 가 B 의 메모 id 로 수정 시도 → B 메모 불변(횡적 차단)
    await saveStudentMemo(tokenA, DATE, "A의 변조 시도", bId);
    const afterEdit = await db
      .select()
      .from(studentCalendarMemos)
      .where(eq(studentCalendarMemos.id, bId));
    expect(afterEdit).toHaveLength(1);
    expect(afterEdit[0].body).toBe("B의 비밀 메모"); // 변하지 않음

    // 3) A 가 B 의 메모 삭제 시도 → 미삭제
    await deleteStudentMemo(tokenA, bId);
    const afterDel = await db
      .select()
      .from(studentCalendarMemos)
      .where(eq(studentCalendarMemos.id, bId));
    expect(afterDel).toHaveLength(1); // 여전히 존재

    // 4) A 는 본인 메모는 정상 생성·삭제
    const own = await saveStudentMemo(tokenA, DATE, "A의 메모");
    expect(own.ok).toBe(true);
    const aMemos = await db
      .select()
      .from(studentCalendarMemos)
      .where(eq(studentCalendarMemos.studentYearId, syA));
    expect(aMemos).toHaveLength(1);
    expect(aMemos[0].body).toBe("A의 메모");

    const del = await deleteStudentMemo(tokenA, aMemos[0].id);
    expect(del.ok).toBe(true);
    const aAfter = await db
      .select()
      .from(studentCalendarMemos)
      .where(eq(studentCalendarMemos.studentYearId, syA));
    expect(aAfter).toHaveLength(0);

    // 5) 무효 토큰은 거부
    const bad = await saveStudentMemo("nonexistent-token", DATE, "x");
    expect(bad.ok).toBe(false);
  });
});
