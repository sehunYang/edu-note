import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import {
  subjects,
  courseSections,
  classSessions,
  timetableSlots,
} from "../schema/classes";
import { schoolDayCalendar } from "../schema/misc";
import {
  setSubjectExamBoundary,
  generatePlannedSessions,
  setSessionStatus,
  listSectionsWithProgress,
  getSectionSessions,
} from "./sessions";

/**
 * 시수(차시) 실DB 통합 테스트. 동적 미래 날짜로 시간에 안정적.
 * 월/수 시간표 분반 + 수업일 캘린더 + 시험경계 → 차시 생성/완료/잔여 검증.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;

const base = new Date();
const addDays = (n: number) => {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const todayStr = addDays(0);
const boundary = addDays(20);

let subjectId: string;
let sectionId: string;
const expectedTargets = new Set<string>();

describe.skipIf(!RUN)("시수 — 차시 생성/완료/잔여", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });

    [{ id: subjectId }] = await db
      .insert(subjects)
      .values({ ownerId: owner, schoolYear: YEAR, name: "물리" })
      .returning({ id: subjects.id });
    [{ id: sectionId }] = await db
      .insert(courseSections)
      .values({ ownerId: owner, subjectId, label: "2-7" })
      .returning({ id: courseSections.id });
    // 월(1)·수(3) 시간표
    await db.insert(timetableSlots).values([
      { ownerId: owner, sectionId, weekday: 1, period: 3, source: "comcigan" },
      { ownerId: owner, sectionId, weekday: 3, period: 3, source: "comcigan" },
    ]);
    // 수업일 캘린더: 향후 21일, 평일=수업일. 목표 = [오늘,경계] 의 월/수 수업일.
    const cal: { ownerId: string; date: string; isSchoolDay: boolean }[] = [];
    for (let i = 0; i <= 20; i++) {
      const date = addDays(i);
      const wd = new Date(date + "T00:00:00Z").getUTCDay();
      const isSchoolDay = wd >= 1 && wd <= 5;
      cal.push({ ownerId: owner, date, isSchoolDay });
      if (isSchoolDay && (wd === 1 || wd === 3)) expectedTargets.add(date);
    }
    await db.insert(schoolDayCalendar).values(cal);
  });

  afterAll(async () => {
    await db.delete(classSessions).where(eq(classSessions.ownerId, owner));
    await db.delete(timetableSlots).where(eq(timetableSlots.ownerId, owner));
    await db.delete(courseSections).where(eq(courseSections.ownerId, owner));
    await db.delete(subjects).where(eq(subjects.ownerId, owner));
    await db.delete(schoolDayCalendar).where(eq(schoolDayCalendar.ownerId, owner));
    await sql.end();
  });

  it("경계 미설정이면 차시 생성 거부", async () => {
    await expect(generatePlannedSessions(db, owner, sectionId)).rejects.toThrow(
      /경계/,
    );
  });

  it("경계 설정 후 월/수 수업일에 planned 차시 생성", async () => {
    await setSubjectExamBoundary(db, owner, subjectId, boundary);
    const res = await generatePlannedSessions(db, owner, sectionId);
    expect(res.boundary).toBe(boundary);
    expect(res.generated).toBe(expectedTargets.size);
    expect(res.total).toBe(expectedTargets.size);

    const prog = (await listSectionsWithProgress(db, owner, YEAR)).find(
      (s) => s.sectionId === sectionId,
    )!;
    expect(prog.plannedUpToBoundary).toBe(expectedTargets.size); // 잔여 = 미진행 planned
    expect(prog.done).toBe(0);
  });

  it("차시 완료 표시하면 잔여(planned)가 줄어든다", async () => {
    const sessions = await getSectionSessions(db, owner, sectionId);
    await setSessionStatus(db, owner, sessions[0].id, "done");

    const prog = (await listSectionsWithProgress(db, owner, YEAR)).find(
      (s) => s.sectionId === sectionId,
    )!;
    expect(prog.done).toBe(1);
    expect(prog.plannedUpToBoundary).toBe(expectedTargets.size - 1);
  });

  it("재생성은 멱등 — done 차시 보존, 중복 생성 없음", async () => {
    const res = await generatePlannedSessions(db, owner, sectionId);
    expect(res.generated).toBe(0); // 이미 다 존재

    const sessions = await getSectionSessions(db, owner, sectionId);
    expect(sessions).toHaveLength(expectedTargets.size); // 중복 없음
    expect(sessions.filter((s) => s.status === "done")).toHaveLength(1); // 보존
  });
});
