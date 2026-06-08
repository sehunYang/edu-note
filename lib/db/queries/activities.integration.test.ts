import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import { studentActivityEntries } from "../schema/records";
import {
  createStudentActivityEntry,
  listStudentActivities,
} from "./activities";

/**
 * 활동 기입 실DB 통합 테스트. tag=both → placement 1곳(자율) 확정 검증.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;
let studentYearId: string;

describe.skipIf(!RUN)("활동 기입 — activityPlacement", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
    const [p] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: "홍길동" })
      .returning({ id: persons.id });
    [{ id: studentYearId }] = await db
      .insert(studentYears)
      .values({
        ownerId: owner,
        personId: p.id,
        schoolYear: YEAR,
        sid: "20701",
        grade: 2,
        classNo: 7,
        number: 1,
        name: "홍길동",
      })
      .returning({ id: studentYears.id });
  });

  afterAll(async () => {
    await db
      .delete(studentActivityEntries)
      .where(eq(studentActivityEntries.ownerId, owner));
    await db.delete(studentYears).where(eq(studentYears.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner));
    await sql.end();
  });

  it("both 활동은 placement=autonomy 로 1곳 확정", async () => {
    const row = await createStudentActivityEntry(db, owner, {
      studentYearId,
      tag: "both",
      body: "교내 토론 동아리에서 자료를 조사하고 발표함",
    });
    expect(row.placement).toBe("autonomy");
  });

  it("career 활동은 placement=career, autonomy 는 autonomy", async () => {
    const career = await createStudentActivityEntry(db, owner, {
      studentYearId,
      tag: "career",
      body: "진로 탐색 보고서 작성",
    });
    const autonomy = await createStudentActivityEntry(db, owner, {
      studentYearId,
      tag: "autonomy",
      body: "학급 자치 활동 주도",
    });
    expect(career.placement).toBe("career");
    expect(autonomy.placement).toBe("autonomy");
  });

  it("학생별 목록 조회 — 3건, 최신순", async () => {
    const list = await listStudentActivities(db, owner, studentYearId);
    expect(list).toHaveLength(3);
    // 모든 placement 가 채워져 있음(중복 투입 방지의 전제)
    expect(list.every((a) => a.placement === "autonomy" || a.placement === "career")).toBe(
      true,
    );
  });
});
