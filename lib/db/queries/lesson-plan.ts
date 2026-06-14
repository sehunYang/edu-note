import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { courseSections, timetableSlots } from "../schema/classes";
import { lessonPlans } from "../schema/records";
import { schoolDayCalendar, calendarEvents } from "../schema/misc";
import {
  computePlanLength,
  pickRepresentativeSection,
  representativeDates,
  monthWeekLabel,
  type SectionSlots,
} from "@/lib/domain/lesson-plan";
import { resolveSemesterRange } from "./calendar";

/**
 * 수업 계획실 쿼리 계층 (교실 2-2 단계2, ownerId 인자 규약).
 * 과목단위 차시 계획(1..N) CRUD + 차시 N 산출(학기 수업일 ∩ 슬롯 요일).
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface LessonPlanRow {
  id: string;
  subjectId: string;
  ordinal: number;
  content: string | null;
  keywords: string[] | null;
}

/** 과목 분반들의 슬롯 요일(분반별, SectionSlots[]). 대표 분반 선정 입력. */
async function listSectionSlots(
  db: DB,
  ownerId: string,
  subjectId: string,
): Promise<SectionSlots[]> {
  const secs = await db
    .select({ id: courseSections.id })
    .from(courseSections)
    .where(
      and(
        eq(courseSections.ownerId, ownerId),
        eq(courseSections.subjectId, subjectId),
      ),
    );
  const sectionIds = secs.map((s) => s.id);
  if (sectionIds.length === 0) return [];

  const slots = await db
    .select({ sectionId: timetableSlots.sectionId, weekday: timetableSlots.weekday })
    .from(timetableSlots)
    .where(
      and(
        eq(timetableSlots.ownerId, ownerId),
        inArray(timetableSlots.sectionId, sectionIds),
      ),
    );
  const bySection = new Map<string, number[]>();
  for (const id of sectionIds) bySection.set(id, []);
  for (const s of slots) bySection.get(s.sectionId)?.push(s.weekday);
  return [...bySection.entries()].map(([sectionId, weekdays]) => ({
    sectionId,
    weekdays,
  }));
}

/** 학기 범위 수업일(오름차순). */
async function listSchoolDays(
  db: DB,
  ownerId: string,
  start: string,
  end: string,
): Promise<{ date: string }[]> {
  return db
    .select({ date: schoolDayCalendar.date })
    .from(schoolDayCalendar)
    .where(
      and(
        eq(schoolDayCalendar.ownerId, ownerId),
        eq(schoolDayCalendar.isSchoolDay, true),
        gte(schoolDayCalendar.date, start),
        lte(schoolDayCalendar.date, end),
      ),
    )
    .orderBy(asc(schoolDayCalendar.date));
}

export interface PlanOrdinalView {
  ordinal: number;
  month: number;
  weekOfMonth: number;
  /** 이 차시가 시험기간이면 '1차'|'2차', 아니면 null. */
  examLabel: string | null;
}

export interface PlanView {
  length: number;
  ordinals: PlanOrdinalView[];
}

/**
 * QC v3 AC-1.1~1.4 — 차시 N(분반 무관, **대표 분반** 기준) + 차시별 월/주차 + 시험마커.
 *
 * 대표 분반 = 주당 슬롯 수(=시수) 최대 분반 하나(pickRepresentativeSection). 기존
 * 분반 요일 UNION 버그(분반 많을수록 부풀림) 폐기. 학기 범위는 여름방학 경계(B) 기준.
 * 차시 k 의 월/주차 = 대표 분반 k번째 수업일. 시험은 calendarEvents(exam, examSemester=sem)
 * 의 examOrdinal 1/2 를, 시험일 이상인 첫 차시(없으면 마지막 차시)에 마커로 부여.
 */
export async function getPlanView(
  db: DB,
  ownerId: string,
  subjectId: string,
  year: number,
  sem: 1 | 2,
): Promise<PlanView> {
  const { start, end } = await resolveSemesterRange(db, ownerId, year, sem);
  const sections = await listSectionSlots(db, ownerId, subjectId);
  const repWeekdays = pickRepresentativeSection(sections);
  if (repWeekdays.size === 0) return { length: 0, ordinals: [] };

  const schoolDays = await listSchoolDays(db, ownerId, start, end);
  const dates = representativeDates(schoolDays, repWeekdays);
  const length = dates.length;

  // 시험 마커: 학기 범위의 exam 이벤트(examOrdinal 1/2)를 차시 ordinal 에 매핑.
  const exams = await db
    .select({ date: calendarEvents.date, examOrdinal: calendarEvents.examOrdinal })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.ownerId, ownerId),
        eq(calendarEvents.eventKind, "exam"),
        eq(calendarEvents.examSemester, sem),
        gte(calendarEvents.date, start),
        lte(calendarEvents.date, end),
      ),
    );
  const examByOrdinal = new Map<number, string>(); // ordinal(차시) → '1차'|'2차'
  for (const ex of exams) {
    if (ex.examOrdinal !== 1 && ex.examOrdinal !== 2) continue;
    // 시험일 이상인 첫 차시(없으면 마지막 차시).
    let idx = dates.findIndex((d) => d >= ex.date);
    if (idx < 0) idx = dates.length - 1;
    if (idx < 0) continue;
    examByOrdinal.set(idx + 1, `${ex.examOrdinal}차`);
  }

  const ordinals: PlanOrdinalView[] = dates.map((date, i) => {
    const { month, weekOfMonth } = monthWeekLabel(date);
    return {
      ordinal: i + 1,
      month,
      weekOfMonth,
      examLabel: examByOrdinal.get(i + 1) ?? null,
    };
  });
  return { length, ordinals };
}

/**
 * 차시 N(분반 무관, 대표 분반 기준). getPlanView().length 의 경량 래퍼.
 * 기존 호출처/통합테스트 호환용 — UNION 버그 폐기, 분반 수 무관.
 */
export async function getPlanLength(
  db: DB,
  ownerId: string,
  subjectId: string,
  year: number,
  sem: 1 | 2,
): Promise<number> {
  const { start, end } = await resolveSemesterRange(db, ownerId, year, sem);
  const sections = await listSectionSlots(db, ownerId, subjectId);
  const repWeekdays = pickRepresentativeSection(sections);
  if (repWeekdays.size === 0) return 0;
  const schoolDays = await listSchoolDays(db, ownerId, start, end);
  return computePlanLength(schoolDays, repWeekdays);
}

/** 과목의 차시 계획 목록(ordinal 오름차순). */
export async function listLessonPlan(
  db: DB,
  ownerId: string,
  subjectId: string,
): Promise<LessonPlanRow[]> {
  return db
    .select({
      id: lessonPlans.id,
      subjectId: lessonPlans.subjectId,
      ordinal: lessonPlans.ordinal,
      content: lessonPlans.content,
      keywords: lessonPlans.keywords,
    })
    .from(lessonPlans)
    .where(
      and(eq(lessonPlans.ownerId, ownerId), eq(lessonPlans.subjectId, subjectId)),
    )
    .orderBy(asc(lessonPlans.ordinal));
}

export interface LessonPlanEntryInput {
  content?: string | null;
  keywords?: string[];
}

/** 차시 1행 upsert. 충돌 키 (subjectId, ordinal). */
export async function upsertLessonPlanEntry(
  db: DB,
  ownerId: string,
  subjectId: string,
  ordinal: number,
  input: LessonPlanEntryInput,
): Promise<void> {
  const content = input.content?.trim() ? input.content.trim() : null;
  const keywords =
    input.keywords && input.keywords.length > 0 ? input.keywords : null;
  await db
    .insert(lessonPlans)
    .values({ ownerId, subjectId, ordinal, content, keywords })
    .onConflictDoUpdate({
      target: [lessonPlans.subjectId, lessonPlans.ordinal],
      set: { content, keywords, updatedAt: new Date() },
    });
}

/** 차시 1행 삭제. 소유자 본인 행만. */
export async function deleteLessonPlanEntry(
  db: DB,
  ownerId: string,
  subjectId: string,
  ordinal: number,
): Promise<void> {
  await db
    .delete(lessonPlans)
    .where(
      and(
        eq(lessonPlans.ownerId, ownerId),
        eq(lessonPlans.subjectId, subjectId),
        eq(lessonPlans.ordinal, ordinal),
      ),
    );
}
