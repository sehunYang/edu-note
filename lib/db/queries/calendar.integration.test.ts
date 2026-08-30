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
  bulkUpdateEventAttrs,
} from "./calendar";
import type { NeisScheduleEntry, NeisMealEntry } from "@/lib/integrations/neis";

// 실학교/실교사 이름은 공개 저장소에 남기지 않는다. 이 테스트는 RUN_DB_ITEST
// 게이트라 평소 스킵되며, 돌릴 때만 env 로 지정한다(배포판 S7).
const PROBE_SCHOOL = process.env.PROBE_SCHOOL ?? "";
const PROBE_TEACHER = process.env.PROBE_TEACHER ?? "";


/**
 * 캘린더 sync 실DB+라이브 NEIS 통합 테스트.
 * RUN_DB_ITEST=1 + DATABASE_URL + NEIS_API_KEY + 네트워크일 때만 실행.
 * 실학교 2026-06 → school_day_calendar/이벤트/급식 sync·검증·정리.
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
    const found = await searchSchoolInfo(PROBE_SCHOOL);
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
    const found = await searchSchoolInfo(PROBE_SCHOOL);
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

// ── QC v2 2-1 B: context-aware 분류(방학구간·휴업일·수능·미분류·일괄저장) ──
// (합성 schedule, NEIS 키 불필요)
const RUN_DB = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

function sched(
  date: string,
  title: string,
  isSchoolDay = true,
): NeisScheduleEntry {
  return { date, title, content: null, isSchoolDay, dayCategory: null };
}

describe.skipIf(!RUN_DB)("학사일정 context-aware 분류·보정 — 합성 schedule (AC-B)", () => {
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

  // 학년도 1회 동기화(양 학기 포함) 가정 — 7~9월 범위(방학식~개학식·광복절·수능 포함).
  const FROM = "20260701";
  const TO = "20260930";
  const meals: NeisMealEntry[] = [];

  function entries() {
    return [
      sched("2026-07-10", "1학기 기말고사"), // exam 학기1 회차2
      sched("2026-07-20", "여름방학식"), // vacation(구간 시작)
      sched("2026-07-26", "체험학습", false), // 방학 구간 내 비수업일 → vacation(방학 우선)
      sched("2026-08-15", "광복절", false), // 방학 구간 내 비수업일 → vacation(방학 우선, AC-B4)
      sched("2026-08-18", "2학기 개학식"), // 방학 구간 종료(당일은 vacation 아님)
      sched("2026-09-03", "전국연합학력평가"), // mock_exam(exam 아님)
      sched("2026-09-10", "동아리 한마당"), // club
      sched("2026-09-15", "학생자치회의"), // 미분류 → self_activity + needsReview
      sched("2026-09-25", "개교기념일", false), // 방학 밖 비수업일·키워드 없음 → holiday(AC-B5)
      sched("2026-09-20", "토요휴업일", false), // sync 가 제외(미생성)
    ];
  }

  it("sync 시 context-aware 자동 태깅(방학구간·휴업일·수능·미분류·토요휴업일 제외) (AC-B2~B8)", async () => {
    await syncSchoolCalendar(db2, owner2, FROM, TO, entries(), meals);
    const events = await getEventsWithAttrs(db2, owner2, "2026-07-01", "2026-09-30");
    const byTitle = Object.fromEntries(events.map((e) => [e.title, e]));

    // 지필: 학기2 자동 아님 — 7월은 1학기(제목 명시 없어도 8/15 이전)
    expect(byTitle["1학기 기말고사"]).toMatchObject({
      eventKind: "exam",
      examSemester: 1,
      examOrdinal: 2,
    });
    // 방학 구간
    expect(byTitle["여름방학식"].eventKind).toBe("vacation");
    expect(byTitle["체험학습"].eventKind).toBe("vacation"); // 방학 우선(비수업일이어도)
    expect(byTitle["2학기 개학식"].eventKind).not.toBe("vacation");
    // 방학 우선: 방학 구간 내 비수업일(광복절)은 holiday 아닌 vacation(AC-B4)
    expect(byTitle["광복절"].eventKind).toBe("vacation");
    // 휴업일 자동탐지: 방학 밖 비수업일 ∧ 키워드 없음 → holiday(AC-B5)
    expect(byTitle["개교기념일"].eventKind).toBe("holiday");
    expect(byTitle["개교기념일"].needsReview).toBe(false);
    // 수능·모의고사
    expect(byTitle["전국연합학력평가"].eventKind).toBe("mock_exam");
    expect(byTitle["동아리 한마당"].eventKind).toBe("club");
    // 미분류 fallback → self_activity + needsReview
    expect(byTitle["학생자치회의"]).toMatchObject({
      eventKind: "self_activity",
      needsReview: true,
    });
    // 토요휴업일은 생성하지 않음(AC-B7)
    expect(byTitle["토요휴업일"]).toBeUndefined();

    // 방학 구간 내 NEIS 행이 전혀 없는 평일(2026-07-21 화요일, 방학식~개학식 사이)도
    // isSchoolDay=false 여야 함 — school_day_calendar.isSchoolDay 판정에 방학 span 반영.
    const noRowWeekday = await db2
      .select({ isSchoolDay: schoolDayCalendar.isSchoolDay })
      .from(schoolDayCalendar)
      .where(
        and(
          eq(schoolDayCalendar.ownerId, owner2),
          eq(schoolDayCalendar.date, "2026-07-21"),
        ),
      );
    expect(noRowWeekday[0]?.isSchoolDay).toBe(false);
  });

  it("일괄 저장: 다건 보정 + needsReview 일괄 해제(AC-B9)", async () => {
    const before = await getEventsWithAttrs(db2, owner2, "2026-07-01", "2026-09-30");
    expect(before.some((e) => e.needsReview)).toBe(true);
    // 미분류 항목을 career_activity 로 보정 + exam 항목 학기/회차 유지
    const target = before.find((e) => e.title === "학생자치회의")!;
    const count = await bulkUpdateEventAttrs(db2, owner2, [
      { eventId: target.id, eventKind: "career_activity" },
    ]);
    expect(count).toBe(1);
    const after = await getEventsWithAttrs(db2, owner2, "2026-07-01", "2026-09-30");
    const fixed = after.find((e) => e.id === target.id)!;
    expect(fixed.eventKind).toBe("career_activity");
    expect(fixed.needsReview).toBe(false); // 일괄저장이 검토완료 처리
  });

  it("수동 재분류 라운드트립: 신규 EventKind(holiday) 저장·재조회 (EVENT_KINDS 회귀 가드)", async () => {
    // 광복절을 holiday→self_activity 로, 다시 holiday 로 — 신규 enum 값 저장 성공 단언.
    const events = await getEventsWithAttrs(db2, owner2, "2026-08-15", "2026-08-15");
    const target = events[0];
    await updateEventAttributes(db2, owner2, target.id, { eventKind: "self_activity" });
    let after = await getEventsWithAttrs(db2, owner2, "2026-08-15", "2026-08-15");
    expect(after[0].eventKind).toBe("self_activity");
    await updateEventAttributes(db2, owner2, target.id, { eventKind: "holiday" });
    after = await getEventsWithAttrs(db2, owner2, "2026-08-15", "2026-08-15");
    expect(after[0]).toMatchObject({
      eventKind: "holiday",
      examSemester: null,
      examOrdinal: null,
      needsReview: false,
    });
  });

  it("수동 재분류: 신규 etc(기타) 저장·재조회 지속 (0016 enum + EVENT_KINDS 가드)", async () => {
    // 광복절을 '기타'로 재분류 — 0016 마이그레이션 ADD VALUE 와 런타임 화이트리스트 검증.
    const events = await getEventsWithAttrs(db2, owner2, "2026-08-15", "2026-08-15");
    const target = events[0];
    await updateEventAttributes(db2, owner2, target.id, { eventKind: "etc" });
    const after = await getEventsWithAttrs(db2, owner2, "2026-08-15", "2026-08-15");
    expect(after[0].eventKind).toBe("etc");
  });

  it("교사 보정: self_activity→exam 교정 + exam 아님 시 학기/회차 null 강제(AC-3.3)", async () => {
    const before = await getEventsWithAttrs(db2, owner2, "2026-09-15", "2026-09-15");
    const target = before.find((e) => e.title === "학생자치회의")!;
    await updateEventAttributes(db2, owner2, target.id, {
      eventKind: "exam",
      examSemester: 2,
      examOrdinal: 1,
    });
    let after = await getEventsWithAttrs(db2, owner2, "2026-09-15", "2026-09-15");
    expect(after[0]).toMatchObject({
      eventKind: "exam",
      examSemester: 2,
      examOrdinal: 1,
    });
    await updateEventAttributes(db2, owner2, target.id, {
      eventKind: "club",
      examSemester: 2,
      examOrdinal: 1,
    });
    after = await getEventsWithAttrs(db2, owner2, "2026-09-15", "2026-09-15");
    expect(after[0]).toMatchObject({
      eventKind: "club",
      examSemester: null,
      examOrdinal: null,
    });
  });

  it("재sync 멱등: 범위 내 neis 이벤트 교체(중복 없음·태깅 유지·토요휴업일 제외) (AC-3.4)", async () => {
    await syncSchoolCalendar(db2, owner2, FROM, TO, entries(), meals);
    const events = await getEventsWithAttrs(db2, owner2, "2026-07-01", "2026-09-30");
    expect(events.length).toBe(9); // 10건 입력 − 토요휴업일 1 = 9(중복 없음·보정 초기화)
    const exam = events.find((e) => e.title === "1학기 기말고사")!;
    expect(exam).toMatchObject({ eventKind: "exam", examSemester: 1, examOrdinal: 2 });
  });
});
