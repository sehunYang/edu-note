import { and, asc, eq, gte, lte, sql as dsql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  schoolDayCalendar,
  calendarEvents,
  academicVacations,
  mealCache,
  teacherProfile,
} from "../schema/misc";
import type { NeisScheduleEntry, NeisMealEntry } from "@/lib/integrations/neis";
import {
  classifySchedule,
  deriveVacationSpans,
  isDateInVacationSpans,
  type EventKind,
  type VacationSpan,
} from "@/lib/domain/calendar-keywords";
import {
  schoolYearRange,
  resolveSemesterBoundary,
  semesterRangeWithBoundary,
  type SchoolYearRange,
} from "@/lib/domain/school-year";

/**
 * 캘린더 sync 쿼리 계층 (계획 §3.3 E, §4 E). NEIS 학사일정·급식을
 * school_day_calendar(수업일 단일 진실원)·calendar_events·meal_cache 로 멱등 upsert.
 *
 * 수업일 판정: 평일(월~금) ∧ NEIS 비수업일(공휴일/휴업일 등) 아님 ∧ 방학 구간(deriveVacationSpans)
 * 아님. 주말·휴업일·방학=비수업일(방학식~개학식 사이 NEIS 행 없는 평일도 비수업일로 취급).
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface CalendarSyncResult {
  schoolDays: number; // school_day_calendar upsert 행수
  events: number; // calendar_events insert 행수
  meals: number; // meal_cache upsert 행수
}

/** "YYYYMMDD" → UTC 자정 Date. */
function ymdToDate(ymd: string): Date {
  const y = +ymd.slice(0, 4);
  const m = +ymd.slice(4, 6);
  const d = +ymd.slice(6, 8);
  return new Date(Date.UTC(y, m - 1, d));
}
function fmt(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function syncSchoolCalendar(
  db: DB,
  ownerId: string,
  fromYmd: string,
  toYmd: string,
  schedule: NeisScheduleEntry[],
  meals: NeisMealEntry[],
): Promise<CalendarSyncResult> {
  const nonSchoolDates = new Set(
    schedule.filter((e) => !e.isSchoolDay).map((e) => e.date),
  );
  const spans = deriveVacationSpans(
    schedule.map((e) => ({
      date: e.date,
      title: e.title,
      isSchoolDay: e.isSchoolDay,
      dayCategory: e.dayCategory,
    })),
  );

  // 1) school_day_calendar — 범위 전체 일자 생성(평일∧비휴일∧비방학=수업일)
  const dayRows: { ownerId: string; date: string; isSchoolDay: boolean }[] = [];
  const from = ymdToDate(fromYmd);
  const to = ymdToDate(toYmd);
  for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = fmt(d);
    const weekday = d.getUTCDay(); // 0=일 .. 6=토
    const isSchoolDay =
      weekday >= 1 &&
      weekday <= 5 &&
      !nonSchoolDates.has(date) &&
      !isDateInVacationSpans(date, spans);
    dayRows.push({ ownerId, date, isSchoolDay });
  }
  if (dayRows.length > 0) {
    await db
      .insert(schoolDayCalendar)
      .values(dayRows)
      .onConflictDoUpdate({
        target: [schoolDayCalendar.ownerId, schoolDayCalendar.date],
        set: { isSchoolDay: dsql`excluded.is_school_day`, updatedAt: new Date() },
      });
  }

  // 2) calendar_events(source=neis) — 범위 내 기존 neis 이벤트 교체
  await db
    .delete(calendarEvents)
    .where(
      and(
        eq(calendarEvents.ownerId, ownerId),
        eq(calendarEvents.source, "neis"),
        gte(calendarEvents.date, fmt(from)),
        lte(calendarEvents.date, fmt(to)),
      ),
    );
  // 토요휴업일은 누락(QC v2 B). context-aware 분류(방학구간·휴업일·지필학기·미분류 경고).
  const filtered = schedule.filter(
    (e) => e.title.length > 0 && !/토요휴업일/.test(e.title.replace(/\s+/g, "")),
  );
  const classified = classifySchedule(
    filtered.map((e) => ({
      date: e.date,
      title: e.title,
      isSchoolDay: e.isSchoolDay,
      dayCategory: e.dayCategory,
    })),
  );
  const eventRows = classified.map((c) => ({
    ownerId,
    date: c.date,
    source: "neis" as const,
    title: c.title,
    eventKind: c.eventKind,
    examSemester: c.examSemester,
    examOrdinal: c.examOrdinal,
    needsReview: c.needsReview,
  }));
  if (eventRows.length > 0) {
    await db.insert(calendarEvents).values(eventRows);
  }

  // 2b) academic_vacations — 방학 구간을 [start,end] 연속 범위로 재생성(주말 포함 밴드용).
  // spans 는 위에서 이미 전체 schedule 기준으로 계산됨(1번 isSchoolDay 판정과 공유,
  // dayCategory='방학'/빈 제목 행까지 신호로 반영 — 방학식/개학식 제목 누락에도 견고).
  await db
    .delete(academicVacations)
    .where(
      and(
        eq(academicVacations.ownerId, ownerId),
        gte(academicVacations.startDate, fmt(from)),
        lte(academicVacations.startDate, fmt(to)),
      ),
    );
  if (spans.length > 0) {
    await db.insert(academicVacations).values(
      spans.map((s) => ({ ownerId, startDate: s.start, endDate: s.end })),
    );
  }

  // 3) meal_cache — 날짜별로 묶어 payload upsert
  const byDate = new Map<string, NeisMealEntry[]>();
  for (const m of meals) {
    const arr = byDate.get(m.date) ?? [];
    arr.push(m);
    byDate.set(m.date, arr);
  }
  const mealRows = [...byDate.entries()].map(([date, items]) => ({
    ownerId,
    date,
    payload: {
      meals: items.map((i) => ({
        mealType: i.mealType,
        menu: i.menu,
        calInfo: i.calInfo,
        ntrInfo: i.ntrInfo, // 영양정보(NTR_INFO) — payload 에 함께 저장(별도 컬럼 없음). 0035.
      })),
    },
  }));
  if (mealRows.length > 0) {
    await db
      .insert(mealCache)
      .values(mealRows)
      .onConflictDoUpdate({
        target: [mealCache.ownerId, mealCache.date],
        set: { payload: dsql`excluded.payload`, updatedAt: new Date() },
      });
  }

  return {
    schoolDays: dayRows.length,
    events: eventRows.length,
    meals: mealRows.length,
  };
}

// ── 조회 ──

export interface CalendarEventView {
  date: string;
  title: string;
}

/** from 이후 다가오는 학사일정 N건. */
export async function getUpcomingEvents(
  db: DB,
  ownerId: string,
  fromDate: string,
  limit = 20,
): Promise<CalendarEventView[]> {
  return db
    .select({ date: calendarEvents.date, title: calendarEvents.title })
    .from(calendarEvents)
    .where(
      and(eq(calendarEvents.ownerId, ownerId), gte(calendarEvents.date, fromDate)),
    )
    .orderBy(asc(calendarEvents.date))
    .limit(limit);
}

/** 캘린더 표시용 이벤트(event_kind 포함 — 종류별 색상 구분). */
export interface CalendarEventKindView extends CalendarEventView {
  eventKind: EventKind;
}

/**
 * 특정 기간([fromDate, toDate])의 학사일정 전체(제목+종류). 오늘의 학교 캘린더 월
 * 네비게이션 재조회용(QC v5 c7 B.3) — today+30 고정 대신 조회 중인 월 범위.
 * event_kind 를 함께 반환해 캘린더에서 종류별 고유 색상으로 표시한다.
 */
export async function getEventsInRange(
  db: DB,
  ownerId: string,
  fromDate: string,
  toDate: string,
): Promise<CalendarEventKindView[]> {
  return db
    .select({
      date: calendarEvents.date,
      title: calendarEvents.title,
      eventKind: calendarEvents.eventKind,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.ownerId, ownerId),
        gte(calendarEvents.date, fromDate),
        lte(calendarEvents.date, toDate),
      ),
    )
    .orderBy(asc(calendarEvents.date));
}

/**
 * [fromDate, toDate] 와 겹치는 방학 구간(달력 배경 밴드용). 겨울방학처럼 월/연을
 * 넘나드는 구간도 잡히도록 겹침 조건(start ≤ to ∧ end ≥ from)으로 조회한다.
 */
export async function getVacationSpansInRange(
  db: DB,
  ownerId: string,
  fromDate: string,
  toDate: string,
): Promise<VacationSpan[]> {
  const rows = await db
    .select({
      start: academicVacations.startDate,
      end: academicVacations.endDate,
    })
    .from(academicVacations)
    .where(
      and(
        eq(academicVacations.ownerId, ownerId),
        lte(academicVacations.startDate, toDate),
        gte(academicVacations.endDate, fromDate),
      ),
    )
    .orderBy(asc(academicVacations.startDate));
  return rows;
}

// ── 학사일정 속성(키워드 분류) 조회·보정 (QC v1 C3) ──

export interface CalendarEventAttrView {
  id: string;
  date: string;
  title: string;
  eventKind: EventKind;
  examSemester: number | null;
  examOrdinal: number | null;
  needsReview: boolean;
}

/** 범위 내 이벤트 + 분류 속성(보정 UI 용). */
export async function getEventsWithAttrs(
  db: DB,
  ownerId: string,
  fromDate: string,
  toDate: string,
): Promise<CalendarEventAttrView[]> {
  return db
    .select({
      id: calendarEvents.id,
      date: calendarEvents.date,
      title: calendarEvents.title,
      eventKind: calendarEvents.eventKind,
      examSemester: calendarEvents.examSemester,
      examOrdinal: calendarEvents.examOrdinal,
      needsReview: calendarEvents.needsReview,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.ownerId, ownerId),
        gte(calendarEvents.date, fromDate),
        lte(calendarEvents.date, toDate),
      ),
    )
    .orderBy(asc(calendarEvents.date));
}

export interface UpdateEventAttrsInput {
  eventKind: EventKind;
  examSemester?: number | null;
  examOrdinal?: number | null;
}

/**
 * 자동 분류 보정(AC-3.3). 교사가 event_kind/시험 학기·회차를 교정한다. exam 이 아니면
 * 학기/회차를 null 로 강제(모순 방지). owner 가드로 타 소유 이벤트는 수정 불가.
 */
export async function updateEventAttributes(
  db: DB,
  ownerId: string,
  eventId: string,
  input: UpdateEventAttrsInput,
): Promise<void> {
  const isExam = input.eventKind === "exam";
  await db
    .update(calendarEvents)
    .set({
      eventKind: input.eventKind,
      examSemester: isExam ? (input.examSemester ?? null) : null,
      examOrdinal: isExam ? (input.examOrdinal ?? null) : null,
      needsReview: false, // 교사가 분류를 확정 → 경고 해제 (QC v2 B)
      updatedAt: new Date(),
    })
    .where(
      and(eq(calendarEvents.id, eventId), eq(calendarEvents.ownerId, ownerId)),
    );
}

export interface BulkEventAttrUpdate extends UpdateEventAttrsInput {
  eventId: string;
}

/**
 * 일괄 저장(QC v2 B, AC-B9). 보정 화면의 변경을 한 트랜잭션으로 반영하고 needs_review 를
 * 모두 해제한다(검토 완료 처리). exam 이 아니면 학기/회차 null 강제(모순 방지).
 */
export async function bulkUpdateEventAttrs(
  db: DB,
  ownerId: string,
  updates: BulkEventAttrUpdate[],
): Promise<number> {
  if (updates.length === 0) return 0;
  await db.transaction(async (tx) => {
    for (const u of updates) {
      const isExam = u.eventKind === "exam";
      await tx
        .update(calendarEvents)
        .set({
          eventKind: u.eventKind,
          examSemester: isExam ? (u.examSemester ?? null) : null,
          examOrdinal: isExam ? (u.examOrdinal ?? null) : null,
          needsReview: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(calendarEvents.id, u.eventId),
            eq(calendarEvents.ownerId, ownerId),
          ),
        );
    }
  });
  return updates.length;
}

export interface MealView {
  date: string;
  payload: unknown;
}

export async function getMealsInRange(
  db: DB,
  ownerId: string,
  fromDate: string,
  toDate: string,
): Promise<MealView[]> {
  return db
    .select({ date: mealCache.date, payload: mealCache.payload })
    .from(mealCache)
    .where(
      and(
        eq(mealCache.ownerId, ownerId),
        gte(mealCache.date, fromDate),
        lte(mealCache.date, toDate),
      ),
    )
    .orderBy(asc(mealCache.date));
}

/**
 * QC v3 AC-2.1/2.2 — 학년도·학기 범위를 **여름방학 경계** 기준으로 도출.
 * 학년도 전체의 calendarEvents 를 읽어 resolveSemesterBoundary(여름 vacation 시작,
 * 미설정 8/15)로 경계 B 산정 후 semesterRangeWithBoundary 적용. 수업계획실·진척도
 * 공용(8/14 하드코딩 폐기). vacation 미설정시 기존 8/14 경계와 동치(무중단).
 */
export async function resolveSemesterRange(
  db: DB,
  ownerId: string,
  year: number,
  sem: 1 | 2,
): Promise<SchoolYearRange> {
  const yr = schoolYearRange(year);
  const events = await db
    .select({ date: calendarEvents.date, eventKind: calendarEvents.eventKind })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.ownerId, ownerId),
        gte(calendarEvents.date, yr.start),
        lte(calendarEvents.date, yr.end),
      ),
    );
  const boundary = resolveSemesterBoundary(events, year);
  return semesterRangeWithBoundary(year, sem, boundary);
}

/** 범위 내 수업일 수(잔여차시·신고서 기한 계산 보조). */
export async function countSchoolDays(
  db: DB,
  ownerId: string,
  fromDate: string,
  toDate: string,
): Promise<number> {
  const rows = await db
    .select({ n: dsql<number>`count(*)::int` })
    .from(schoolDayCalendar)
    .where(
      and(
        eq(schoolDayCalendar.ownerId, ownerId),
        eq(schoolDayCalendar.isSchoolDay, true),
        gte(schoolDayCalendar.date, fromDate),
        lte(schoolDayCalendar.date, toDate),
      ),
    );
  return rows[0]?.n ?? 0;
}

// ── 교사 프로필(NEIS 설정) ──

export interface TeacherNeisConfig {
  neisOfficeCode: string | null;
  neisSchoolCode: string | null;
  neisSchoolName: string | null;
  lastCalendarSyncAt: Date | null;
}

export async function getTeacherNeisConfig(
  db: DB,
  ownerId: string,
): Promise<TeacherNeisConfig | null> {
  const rows = await db
    .select({
      neisOfficeCode: teacherProfile.neisOfficeCode,
      neisSchoolCode: teacherProfile.neisSchoolCode,
      neisSchoolName: teacherProfile.neisSchoolName,
      lastCalendarSyncAt: teacherProfile.lastCalendarSyncAt,
    })
    .from(teacherProfile)
    .where(eq(teacherProfile.ownerId, ownerId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertTeacherNeisConfig(
  db: DB,
  ownerId: string,
  office: string,
  school: string,
  schoolName: string,
  syncedAt: Date,
): Promise<void> {
  const existing = await db
    .select({ id: teacherProfile.id })
    .from(teacherProfile)
    .where(eq(teacherProfile.ownerId, ownerId))
    .limit(1);
  const values = {
    neisOfficeCode: office,
    neisSchoolCode: school,
    neisSchoolName: schoolName,
    lastCalendarSyncAt: syncedAt,
  };
  if (existing.length) {
    await db
      .update(teacherProfile)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(teacherProfile.ownerId, ownerId));
  } else {
    await db.insert(teacherProfile).values({ ownerId, ...values });
  }
}
