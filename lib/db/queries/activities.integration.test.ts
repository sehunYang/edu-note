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
  bulkCreateStudentActivityEntries,
  listHomeroomActivities,
  updateStudentActivityEntry,
  deleteStudentActivityEntry,
} from "./activities";

/**
 * 활동 기입 실DB 통합 테스트. tag=both → placement 1곳(자율) 확정 검증.
 * 일괄저장(bulkCreate), 담임반 목록(listHomeroomActivities), 수정·삭제 포함.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;
let studentYearId: string;
let studentYearId2: string;

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

    const [p2] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: "김철수" })
      .returning({ id: persons.id });
    [{ id: studentYearId2 }] = await db
      .insert(studentYears)
      .values({
        ownerId: owner,
        personId: p2.id,
        schoolYear: YEAR,
        sid: "20702",
        grade: 2,
        classNo: 7,
        number: 2,
        name: "김철수",
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

  it("일괄 저장 — 학생 2명 체크 → 각 1행씩 총 2행 삽입", async () => {
    const ids = await bulkCreateStudentActivityEntries(
      db,
      owner,
      [studentYearId, studentYearId2],
      "autonomy",
      "학급 자율활동 — 학급 규칙 제정 참여",
    );
    expect(ids).toHaveLength(2);

    // 각 학생에게 1행씩 삽입됐는지 확인
    const list1 = await listStudentActivities(db, owner, studentYearId);
    const list2 = await listStudentActivities(db, owner, studentYearId2);
    expect(list1.some((r) => ids.includes(r.id))).toBe(true);
    expect(list2.some((r) => ids.includes(r.id))).toBe(true);
  });

  it("자율/진로 분류 — tag autonomy→placement=autonomy, career→placement=career", async () => {
    const autoId = await bulkCreateStudentActivityEntries(
      db,
      owner,
      [studentYearId2],
      "autonomy",
      "자율활동 개별",
    );
    const carId = await bulkCreateStudentActivityEntries(
      db,
      owner,
      [studentYearId2],
      "career",
      "진로활동 개별",
    );

    const list = await listStudentActivities(db, owner, studentYearId2);
    const autoRow = list.find((r) => r.id === autoId[0]);
    const carRow = list.find((r) => r.id === carId[0]);
    expect(autoRow?.placement).toBe("autonomy");
    expect(carRow?.placement).toBe("career");
  });

  it("listHomeroomActivities — 담임반 2명의 전체 기입 반환", async () => {
    const list = await listHomeroomActivities(db, owner, [
      studentYearId,
      studentYearId2,
    ]);
    // 두 학생 모두 포함된 행들이 반환됨
    const ids = new Set(list.map((r) => r.studentYearId));
    expect(ids.has(studentYearId)).toBe(true);
    expect(ids.has(studentYearId2)).toBe(true);
  });

  it("수정 — body 변경 후 목록에서 확인", async () => {
    const [created] = await bulkCreateStudentActivityEntries(
      db,
      owner,
      [studentYearId],
      "autonomy",
      "수정 전 본문",
    );
    await updateStudentActivityEntry(db, owner, created, {
      body: "수정 후 본문",
      tag: "career",
    });
    const list = await listStudentActivities(db, owner, studentYearId);
    const updated = list.find((r) => r.id === created);
    expect(updated?.body).toBe("수정 후 본문");
    expect(updated?.tag).toBe("career");
    expect(updated?.placement).toBe("career");
  });

  it("삭제 — 해당 행이 목록에서 제거됨", async () => {
    const [toDelete] = await bulkCreateStudentActivityEntries(
      db,
      owner,
      [studentYearId],
      "autonomy",
      "삭제될 기입",
    );
    await deleteStudentActivityEntry(db, owner, toDelete);
    const list = await listStudentActivities(db, owner, studentYearId);
    expect(list.find((r) => r.id === toDelete)).toBeUndefined();
  });
});
