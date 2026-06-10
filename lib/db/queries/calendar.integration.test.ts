import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "../schema";
import { schoolDayCalendar, calendarEvents, mealCache } from "../schema/misc";
import {
  searchSchoolInfo,
  fetchSchoolSchedule,
  fetchMealService,
} from "@/lib/integrations/neis-client";
import {
  syncSchoolCalendar,
  getUpcomingEvents,
  countSchoolDays,
  getEventsWithAttrs,
  updateEventAttributes,
} from "./calendar";
import type { NeisScheduleEntry, NeisMealEntry } from "@/lib/integrations/neis";

/**
 * 캘린더 sync 실DB+라이브 NEIS 통합 테스트.
 * RUN_DB_ITEST=1 + DATABASE_URL + NEIS_API_KEY + 네트워크일 때만 실행.
 * 인천해송고 2026-06 → school_day_calendar/이벤트/급식 sync·검증·정리.
 */
const RUN =
  process.env.RUN_DB_ITEST === "1" &&
  !!process.env.DATABASE_URL &&
  !!process.env.NEIS_API_KEY;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();

describe.skipIf(!RUN)("캘린더 sync — 라이브 NEIS → DB", () => {
  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await db.delete(schoolDayCalendar).where(eq(schoolDayCalendar.ownerId, owner));
    await db.delete(calendarEvents).where(eq(calendarEvents.ownerId, owner));
    await db.delete(mealCache).where(eq(mealCache.ownerId, owner));
    await sql.end();
  });

  it("학교검색 → 학사일정·급식 sync → 수업일/이벤트/급식 DB 반영", async () => {
    const found = await searchSchoolInfo("인천해송고등학교");
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    const school = found.data[0];
    expect(school.officeCode).toBe("E10");
    expect(school.schoolCode).toBe("7310349");

    const q = { officeCode: school.officeCode, schoolCode: school.schoolCode };
    const [sched, meal] = await Promise.all([
      fetchSchoolSchedule(q, "20260601", "20260630"),
      fetchMealService(q, "20260601", "20260630"),
    ]);
    expect(sched.ok).toBe(true);
    expect(meal.ok).toBe(true);
    if (!sched.ok || !meal.ok) return;

    const res = await syncSchoolCalendar(
      db,
      owner,
      "20260601",
      "20260630",
      sched.data,
      meal.data,
    );
    expect(res.schoolDays).toBe(30); // 6월 전체 일자
    expect(res.events).toBeGreaterThan(0);

    // 공휴일(지방선거일 2026-06-03)은 수업일 아님
    const holiday = await db
      .select({ isSchoolDay: schoolDayCalendar.isSchoolDay })
      .from(schoolDayCalendar)
      .where(
        and(
          eq(schoolDayCalendar.ownerId, owner),
          eq(schoolDayCalendar.date, "2026-06-03"),
        ),
      );
    expect(holiday[0]?.isSchoolDay).toBe(false);

    // 주말(2026-06-07 일요일)도 수업일 아님
    const sunday = await db
      .select({ isSchoolDay: schoolDayCalendar.isSchoolDay })
      .from(schoolDayCalendar)
      .where(
        and(
          eq(schoolDayCalendar.ownerId, owner),
          eq(schoolDayCalendar.date, "2026-06-07"),
        ),
      );
    expect(sunday[0]?.isSchoolDay).toBe(false);

    const schoolDays = await countSchoolDays(db, owner, "2026-06-01", "2026-06-30");
    expect(schoolDays).toBeGreaterThan(15);
    expect(schoolDays).toBeLessThan(23); // 평일 22 − 공휴일

    const events = await getUpcomingEvents(db, owner, "2026-06-01", 50);
    expect(events.length).toBe(res.events);
  });

  it("재sync 는 멱등(수업일 행 중복 없음)", async () => {
    const found = await searchSchoolInfo("인천해송고등학교");
    if (!found.ok) return;
    const q = {
      officeCode: found.data[0].officeCode,
      schoolCode: found.data[0].schoolCode,
    };
    const [sched, meal] = await Promise.all([
      fetchSchoolSchedule(q, "20260601", "20260630"),
      fetchMealService(q, "20260601", "20260630"),
    ]);
    if (!sched.ok || !meal.ok) return;
    await syncSchoolCalendar(db, owner, "20260601", "20260630", sched.data, meal.data);

    const rows = await db
      .select({ date: schoolDayCalendar.date })
      .from(schoolDayCalendar)
      .where(eq(schoolDayCalendar.ownerId, owner));
    expect(rows.length).toBe(30); // 두 번 sync 해도 30일 유지
  });
});

// ── C3: 키워드 자동 분류 + 보정 (합성 schedule, NEIS 키 불필요) ──
const RUN_DB = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

function sched(date: string, title: string): NeisScheduleEntry {
  return { date, title, content: null, isSchoolDay: true, dayCategory: null };
}

describe.skipIf(!RUN_DB)("학사일정 키워드 분류·보정 — 합성 schedule", () => {
  let sql2: ReturnType<typeof postgres>;
  let db2: PostgresJsDatabase<typeof schema>;
  const owner2 = randomUUID();

  beforeAll(() => {
    sql2 = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db2 = drizzle(sql2, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await db2.delete(schoolDayCalendar).where(eq(schoolDayCalendar.ownerId, owner2));
    await db2.delete(calendarEvents).where(eq(calendarEvents.ownerId, owner2));
    await sql2.end();
  });

  const FROM = "20260601";
  const TO = "20260630";
  const meals: NeisMealEntry[] = [];

  it("sync 시 exam/vacation/club 자동 태깅(AC-3.1)", async () => {
    await syncSchoolCalendar(db2, owner2, FROM, TO, [
      sched("2026-06-10", "1학기 중간고사"),
      sched("2026-06-20", "동아리 한마당"),
      sched("2026-06-25", "여름방학식"),
      sched("2026-06-05", "졸업앨범 촬영"),
    ], meals);

    const events = await getEventsWithAttrs(db2, owner2, "2026-06-01", "2026-06-30");
    const byTitle = Object.fromEntries(events.map((e) => [e.title, e]));
    expect(byTitle["1학기 중간고사"]).toMatchObject({
      eventKind: "exam",
      examSemester: 1,
      examOrdinal: 1,
    });
    expect(byTitle["동아리 한마당"].eventKind).toBe("club");
    expect(byTitle["여름방학식"].eventKind).toBe("vacation_start");
    expect(byTitle["졸업앨범 촬영"]).toMatchObject({
      eventKind: "none",
      examSemester: null,
      examOrdinal: null,
    });
  });

  it("교사 보정: none→exam 으로 교정 + exam 아님 시 학기/회차 null 강제(AC-3.3)", async () => {
    const before = await getEventsWithAttrs(db2, owner2, "2026-06-05", "2026-06-05");
    const target = before.find((e) => e.title === "졸업앨범 촬영")!;
    // none → exam 으로 교정
    await updateEventAttributes(db2, owner2, target.id, {
      eventKind: "exam",
      examSemester: 2,
      examOrdinal: 1,
    });
    let after = await getEventsWithAttrs(db2, owner2, "2026-06-05", "2026-06-05");
    expect(after[0]).toMatchObject({
      eventKind: "exam",
      examSemester: 2,
      examOrdinal: 1,
    });

    // exam → club 으로 재교정 시 학기/회차 null 강제
    await updateEventAttributes(db2, owner2, target.id, {
      eventKind: "club",
      examSemester: 2,
      examOrdinal: 1,
    });
    after = await getEventsWithAttrs(db2, owner2, "2026-06-05", "2026-06-05");
    expect(after[0]).toMatchObject({
      eventKind: "club",
      examSemester: null,
      examOrdinal: null,
    });
  });

  it("재sync 멱등: 범위 내 neis 이벤트 교체(중복 없음·태깅 유지) (AC-3.4)", async () => {
    await syncSchoolCalendar(db2, owner2, FROM, TO, [
      sched("2026-06-10", "1학기 중간고사"),
      sched("2026-06-20", "동아리 한마당"),
      sched("2026-06-25", "여름방학식"),
      sched("2026-06-05", "졸업앨범 촬영"),
    ], meals);
    const events = await getEventsWithAttrs(db2, owner2, "2026-06-01", "2026-06-30");
    expect(events.length).toBe(4); // 교체 → 중복 없음(보정값은 재sync 로 초기화됨)
    const exam = events.find((e) => e.title === "1학기 중간고사")!;
    expect(exam).toMatchObject({ eventKind: "exam", examSemester: 1, examOrdinal: 1 });
  });
});
