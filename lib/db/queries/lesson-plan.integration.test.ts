import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { subjects, courseSections, timetableSlots } from "../schema/classes";
import { lessonPlans } from "../schema/records";
import { schoolDayCalendar } from "../schema/misc";
import {
  getPlanLength,
  listLessonPlan,
  upsertLessonPlanEntry,
  deleteLessonPlanEntry,
} from "./lesson-plan";

/**
 * 수업 계획실 실DB 통합 테스트 (교실 2-2 단계2).
 * upsert/list/delete · 동일 (subjectId,ordinal) 갱신(중복 아님) · 차시 N 산출 ·
 * 동명 학기별 과목 독립 계획.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;

let subj1: string; // 1학기 과목
let subj2: string; // 동명 2학기 과목

async function mkSubject(name: string, semester: number): Promise<string> {
  const [s] = await db
    .insert(subjects)
    .values({ ownerId: owner, name, schoolYear: YEAR, semester })
    .returning({ id: subjects.id });
  return s.id;
}

async function mkSection(subjectId: string, label: string): Promise<string> {
  const [c] = await db
    .insert(courseSections)
    .values({ ownerId: owner, subjectId, label })
    .returning({ id: courseSections.id });
  return c.id;
}

async function mkSlot(sectionId: string, weekday: number): Promise<void> {
  await db
    .insert(timetableSlots)
    .values({ ownerId: owner, sectionId, weekday, period: 1 });
}

async function mkSchoolDay(date: string): Promise<void> {
  await db
    .insert(schoolDayCalendar)
    .values({ ownerId: owner, date, isSchoolDay: true });
}

describe.skipIf(!RUN)("수업 계획실 쿼리", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });

    subj1 = await mkSubject("통합과학", 1);
    subj2 = await mkSubject("통합과학", 2); // 동명 2학기 — 독립 계획

    // subj1 분반: 월(1)·수(3) 슬롯.
    const sec1 = await mkSection(subj1, "2-1");
    await mkSlot(sec1, 1);
    await mkSlot(sec1, 3);

    // 1학기 범위(2099-03-01~08-14) 내 수업일: 월 3개 + 수 2개 + 무관 금 1개.
    await mkSchoolDay("2099-03-02"); // 월
    await mkSchoolDay("2099-03-04"); // 수
    await mkSchoolDay("2099-03-09"); // 월
    await mkSchoolDay("2099-03-11"); // 수
    await mkSchoolDay("2099-03-16"); // 월
    await mkSchoolDay("2099-03-06"); // 금(슬롯 없음 → 미카운트)
  });

  afterAll(async () => {
    await db.delete(lessonPlans).where(eq(lessonPlans.ownerId, owner));
    await db.delete(timetableSlots).where(eq(timetableSlots.ownerId, owner));
    await db.delete(schoolDayCalendar).where(eq(schoolDayCalendar.ownerId, owner));
    await db.delete(courseSections).where(eq(courseSections.ownerId, owner));
    await db.delete(subjects).where(eq(subjects.ownerId, owner));
    await sql.end();
  });

  it("차시 N 산출 — 월·수 슬롯 ∩ 1학기 수업일 = 5 (금 제외)", async () => {
    const n = await getPlanLength(db, owner, subj1, YEAR, 1);
    expect(n).toBe(5);
  });

  it("upsert 후 list — 항목 반환(키워드 보존)", async () => {
    await upsertLessonPlanEntry(db, owner, subj1, 1, {
      content: "1차시 오리엔테이션",
      keywords: ["탐구", "안전"],
    });
    const list = await listLessonPlan(db, owner, subj1);
    expect(list).toHaveLength(1);
    expect(list[0].ordinal).toBe(1);
    expect(list[0].content).toBe("1차시 오리엔테이션");
    expect(list[0].keywords).toEqual(["탐구", "안전"]);
  });

  it("동일 (subjectId,ordinal) upsert — 갱신, 중복 아님", async () => {
    await upsertLessonPlanEntry(db, owner, subj1, 1, {
      content: "1차시 수정본",
      keywords: ["측정"],
    });
    const list = await listLessonPlan(db, owner, subj1);
    expect(list).toHaveLength(1); // 여전히 1행
    expect(list[0].content).toBe("1차시 수정본");
    expect(list[0].keywords).toEqual(["측정"]);
  });

  it("delete — 해당 차시 제거", async () => {
    await upsertLessonPlanEntry(db, owner, subj1, 2, { content: "2차시" });
    expect(await listLessonPlan(db, owner, subj1)).toHaveLength(2);
    await deleteLessonPlanEntry(db, owner, subj1, 2);
    const list = await listLessonPlan(db, owner, subj1);
    expect(list).toHaveLength(1);
    expect(list[0].ordinal).toBe(1);
  });

  it("동명 학기별 과목 — 독립 계획", async () => {
    await upsertLessonPlanEntry(db, owner, subj2, 1, { content: "2학기 1차시" });
    const p1 = await listLessonPlan(db, owner, subj1);
    const p2 = await listLessonPlan(db, owner, subj2);
    expect(p1).toHaveLength(1);
    expect(p2).toHaveLength(1);
    expect(p1[0].content).toBe("1차시 수정본");
    expect(p2[0].content).toBe("2학기 1차시");
  });
});
