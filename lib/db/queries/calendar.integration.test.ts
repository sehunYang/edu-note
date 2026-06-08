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
} from "./calendar";

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
