import { and, asc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { courseSections, timetableSlots } from "../schema/classes";
import { lessonPlans, lessonUnits, examTargets } from "../schema/records";
import { schoolDayCalendar, calendarEvents } from "../schema/misc";
import { sixDigitCode } from "@/lib/domain/lesson-unit";
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
  unitId: string | null;
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
      unitId: lessonPlans.unitId,
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
  /** 차시→소단원 연결(nullable). undefined 면 기존 연결 유지하지 않고 갱신 대상에 포함. */
  unitId?: string | null;
}

/** 차시 1행 upsert. 충돌 키 (subjectId, ordinal). QC v4: unitId 연결 동반. */
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
  const unitId = input.unitId ?? null;
  await db
    .insert(lessonPlans)
    .values({ ownerId, subjectId, ordinal, content, keywords, unitId })
    .onConflictDoUpdate({
      target: [lessonPlans.subjectId, lessonPlans.ordinal],
      set: { content, keywords, unitId, updatedAt: new Date() },
    });
}

/** 차시→소단원 연결만 갱신(내용 변경 없이 unit 만 붙이기). */
export async function assignLessonPlanUnit(
  db: DB,
  ownerId: string,
  subjectId: string,
  ordinal: number,
  unitId: string | null,
): Promise<void> {
  await db
    .update(lessonPlans)
    .set({ unitId, updatedAt: new Date() })
    .where(
      and(
        eq(lessonPlans.ownerId, ownerId),
        eq(lessonPlans.subjectId, subjectId),
        eq(lessonPlans.ordinal, ordinal),
      ),
    );
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

/* ──────────────────────────────────────────────────────────────────────────
 * 학기계획 — 세부단원(lesson_units) + 시험별 목표진도(exam_targets) (QC v4 US-2)
 * 단원은 과목 단위 1세트(분반 공유). 6자리코드=major*10000+mid*100+minor.
 * ──────────────────────────────────────────────────────────────────────── */

export interface LessonUnitRow {
  id: string;
  subjectId: string;
  majorNo: number;
  midNo: number;
  minorNo: number;
  majorName: string;
  midName: string;
  minorName: string;
  keywords: string[] | null;
  minOrdinals: number;
}

/** 과목 세부단원 목록(6자리 코드 오름차순). */
export async function listLessonUnits(
  db: DB,
  ownerId: string,
  subjectId: string,
): Promise<LessonUnitRow[]> {
  return db
    .select({
      id: lessonUnits.id,
      subjectId: lessonUnits.subjectId,
      majorNo: lessonUnits.majorNo,
      midNo: lessonUnits.midNo,
      minorNo: lessonUnits.minorNo,
      majorName: lessonUnits.majorName,
      midName: lessonUnits.midName,
      minorName: lessonUnits.minorName,
      keywords: lessonUnits.keywords,
      minOrdinals: lessonUnits.minOrdinals,
    })
    .from(lessonUnits)
    .where(
      and(eq(lessonUnits.ownerId, ownerId), eq(lessonUnits.subjectId, subjectId)),
    )
    .orderBy(
      asc(lessonUnits.majorNo),
      asc(lessonUnits.midNo),
      asc(lessonUnits.minorNo),
    );
}

export interface LessonUnitInput {
  majorNo: number;
  midNo: number;
  minorNo: number;
  majorName: string;
  midName: string;
  minorName: string;
  keywords?: string[];
  minOrdinals?: number;
}

/** 세부단원 upsert. 충돌 키 (subjectId, majorNo, midNo, minorNo) → 이름·키워드·최소차시 갱신. */
export async function upsertLessonUnit(
  db: DB,
  ownerId: string,
  subjectId: string,
  input: LessonUnitInput,
): Promise<LessonUnitRow> {
  const keywords =
    input.keywords && input.keywords.length > 0 ? input.keywords : null;
  const minOrdinals =
    input.minOrdinals && input.minOrdinals > 0 ? input.minOrdinals : 1;
  const [row] = await db
    .insert(lessonUnits)
    .values({
      ownerId,
      subjectId,
      majorNo: input.majorNo,
      midNo: input.midNo,
      minorNo: input.minorNo,
      majorName: input.majorName,
      midName: input.midName,
      minorName: input.minorName,
      keywords,
      minOrdinals,
    })
    .onConflictDoUpdate({
      target: [
        lessonUnits.subjectId,
        lessonUnits.majorNo,
        lessonUnits.midNo,
        lessonUnits.minorNo,
      ],
      set: {
        majorName: input.majorName,
        midName: input.midName,
        minorName: input.minorName,
        keywords,
        minOrdinals,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: lessonUnits.id,
      subjectId: lessonUnits.subjectId,
      majorNo: lessonUnits.majorNo,
      midNo: lessonUnits.midNo,
      minorNo: lessonUnits.minorNo,
      majorName: lessonUnits.majorName,
      midName: lessonUnits.midName,
      minorName: lessonUnits.minorName,
      keywords: lessonUnits.keywords,
      minOrdinals: lessonUnits.minOrdinals,
    });
  return row;
}

/** 세부단원 삭제(소유자 본인). 차시 연결은 FK set null 로 보존(스키마). */
export async function deleteLessonUnit(
  db: DB,
  ownerId: string,
  unitId: string,
): Promise<void> {
  await db
    .delete(lessonUnits)
    .where(and(eq(lessonUnits.ownerId, ownerId), eq(lessonUnits.id, unitId)));
}

/**
 * 6자리 코드(대2+중2+소2)로 단원 조회(AC-1.6). 존재하지 않으면 null →
 * 차시계획 자동채움 실패(저장 차단). 코드 형식검증은 도메인 parseSixDigit 책임.
 */
export async function lookupUnitByCode(
  db: DB,
  ownerId: string,
  subjectId: string,
  code: number,
): Promise<LessonUnitRow | null> {
  const majorNo = Math.floor(code / 10000);
  const midNo = Math.floor((code % 10000) / 100);
  const minorNo = code % 100;
  const [row] = await db
    .select({
      id: lessonUnits.id,
      subjectId: lessonUnits.subjectId,
      majorNo: lessonUnits.majorNo,
      midNo: lessonUnits.midNo,
      minorNo: lessonUnits.minorNo,
      majorName: lessonUnits.majorName,
      midName: lessonUnits.midName,
      minorName: lessonUnits.minorName,
      keywords: lessonUnits.keywords,
      minOrdinals: lessonUnits.minOrdinals,
    })
    .from(lessonUnits)
    .where(
      and(
        eq(lessonUnits.ownerId, ownerId),
        eq(lessonUnits.subjectId, subjectId),
        eq(lessonUnits.majorNo, majorNo),
        eq(lessonUnits.midNo, midNo),
        eq(lessonUnits.minorNo, minorNo),
      ),
    )
    .limit(1);
  return row ?? null;
}

export interface ExamTargetRow {
  id: string;
  subjectId: string;
  examOrdinal: number;
  unitFromCode: number | null;
  unitToCode: number | null;
}

/** 과목 시험별 목표진도 목록(examOrdinal 오름차순). */
export async function listExamTargets(
  db: DB,
  ownerId: string,
  subjectId: string,
): Promise<ExamTargetRow[]> {
  return db
    .select({
      id: examTargets.id,
      subjectId: examTargets.subjectId,
      examOrdinal: examTargets.examOrdinal,
      unitFromCode: examTargets.unitFromCode,
      unitToCode: examTargets.unitToCode,
    })
    .from(examTargets)
    .where(
      and(eq(examTargets.ownerId, ownerId), eq(examTargets.subjectId, subjectId)),
    )
    .orderBy(asc(examTargets.examOrdinal));
}

/** 시험별 목표진도 upsert. 충돌 키 (subjectId, examOrdinal) → 범위 갱신. */
export async function upsertExamTarget(
  db: DB,
  ownerId: string,
  subjectId: string,
  examOrdinal: number,
  fromCode: number | null,
  toCode: number | null,
): Promise<void> {
  await db
    .insert(examTargets)
    .values({
      ownerId,
      subjectId,
      examOrdinal,
      unitFromCode: fromCode,
      unitToCode: toCode,
    })
    .onConflictDoUpdate({
      target: [examTargets.subjectId, examTargets.examOrdinal],
      set: {
        unitFromCode: fromCode,
        unitToCode: toCode,
        updatedAt: new Date(),
      },
    });
}

/**
 * 단원별 연결된 차시 수 집계(AC-1.8 최소차시 검증용). unitId 가 null 인 차시는 제외.
 * 반환: Map<unitId, count>.
 */
export async function countOrdinalsPerUnit(
  db: DB,
  ownerId: string,
  subjectId: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      unitId: lessonPlans.unitId,
      count: sql<number>`count(*)::int`,
    })
    .from(lessonPlans)
    .where(
      and(
        eq(lessonPlans.ownerId, ownerId),
        eq(lessonPlans.subjectId, subjectId),
        isNotNull(lessonPlans.unitId),
      ),
    )
    .groupBy(lessonPlans.unitId);
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.unitId) map.set(r.unitId, Number(r.count));
  }
  return map;
}

/** 학기계획 완료 여부(차시계획 게이트, AC-1.1). 세부단원 1개 이상이면 완료. */
export async function isSemesterPlanComplete(
  db: DB,
  ownerId: string,
  subjectId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(lessonUnits)
    .where(
      and(eq(lessonUnits.ownerId, ownerId), eq(lessonUnits.subjectId, subjectId)),
    );
  return Number(row?.count ?? 0) > 0;
}

/** 6자리 코드 헬퍼 재노출(쿼리/액션 계층 편의). */
export { sixDigitCode };
