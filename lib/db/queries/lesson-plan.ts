import { and, asc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { courseSections, timetableSlots } from "../schema/classes";
import {
  lessonPlans,
  lessonUnits,
  examTargets,
  examSegmentPlans,
} from "../schema/records";
import { schoolDayCalendar, calendarEvents } from "../schema/misc";
import { sixDigitCode } from "@/lib/domain/lesson-unit";
import {
  computePlanLength,
  pickRepresentativeSection,
  representativeDates,
  monthWeekLabel,
  isSlackCell,
  shiftSlackCell,
  unshiftSlackCell,
  computeRemainingToExam,
  type SectionSlots,
  type PlanSlot,
  type ExamSegment,
  type RemainingToExamView,
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
 * QC v6 ① AC-1.3 — "시험까지 남은 차시" 카운터 조립. getPlanView 와 동일 내부 자료
 * (대표분반·수업일·시험일)에 시험구간 계획(planned/slack)을 더해 순수 computeRemainingToExam
 * 으로 산출한다. 대표분반이 없으면 null. examDate 출처는 calendarEvents(단일 진실원).
 */
export async function getRemainingToExam(
  db: DB,
  ownerId: string,
  subjectId: string,
  year: number,
  sem: 1 | 2,
  today: string,
): Promise<RemainingToExamView | null> {
  const { start, end } = await resolveSemesterRange(db, ownerId, year, sem);
  const sections = await listSectionSlots(db, ownerId, subjectId);
  const repWeekdays = pickRepresentativeSection(sections);
  if (repWeekdays.size === 0) return null;

  const schoolDays = await listSchoolDays(db, ownerId, start, end);
  const dates = representativeDates(schoolDays, repWeekdays);

  // 시험일(차수별) — calendarEvents 단일 진실원(getPlanView 와 동일 필터).
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
  const examDateByOrdinal = new Map<number, string>();
  for (const ex of exams) {
    if (ex.examOrdinal === 1 || ex.examOrdinal === 2) {
      examDateByOrdinal.set(ex.examOrdinal, ex.date);
    }
  }

  const plans = await listExamSegmentPlans(db, ownerId, subjectId);
  const planByOrdinal = new Map<number, ExamSegmentPlanRow>();
  for (const p of plans) planByOrdinal.set(p.examOrdinal, p);

  const segments: ExamSegment[] = [1, 2].map((ord) => {
    const plan = planByOrdinal.get(ord);
    return {
      ordinal: ord as 1 | 2,
      examDate: examDateByOrdinal.get(ord) ?? null,
      plannedPeriods: plan?.plannedPeriods ?? 0,
      slackPeriods: plan?.slackPeriods ?? 0,
    };
  });

  return computeRemainingToExam({
    today,
    representativeDates: dates,
    schoolDays,
    representativeWeekdays: repWeekdays,
    segments,
  });
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

/* ──────────────────────────────────────────────────────────────────────────
 * 시험 구간 계획(exam_segment_plans) — 구간별 진행/여유 차시 (QC v6 US-1, AC-1.1)
 * subjectId 가 이미 학기-스코프이므로 upsert 충돌 키 (subjectId, examOrdinal).
 * ──────────────────────────────────────────────────────────────────────── */

export interface ExamSegmentPlanRow {
  id: string;
  subjectId: string;
  examOrdinal: number;
  plannedPeriods: number;
  slackPeriods: number;
}

/** 과목 시험 구간 계획 목록(examOrdinal 오름차순). */
export async function listExamSegmentPlans(
  db: DB,
  ownerId: string,
  subjectId: string,
): Promise<ExamSegmentPlanRow[]> {
  return db
    .select({
      id: examSegmentPlans.id,
      subjectId: examSegmentPlans.subjectId,
      examOrdinal: examSegmentPlans.examOrdinal,
      plannedPeriods: examSegmentPlans.plannedPeriods,
      slackPeriods: examSegmentPlans.slackPeriods,
    })
    .from(examSegmentPlans)
    .where(
      and(
        eq(examSegmentPlans.ownerId, ownerId),
        eq(examSegmentPlans.subjectId, subjectId),
      ),
    )
    .orderBy(asc(examSegmentPlans.examOrdinal));
}

/** 시험 구간 계획 upsert. 충돌 키 (subjectId, examOrdinal) → 진행/여유 차시 갱신. */
export async function upsertExamSegmentPlan(
  db: DB,
  ownerId: string,
  subjectId: string,
  examOrdinal: number,
  plannedPeriods: number,
  slackPeriods: number,
): Promise<void> {
  const planned = Number.isFinite(plannedPeriods) && plannedPeriods > 0
    ? Math.floor(plannedPeriods)
    : 0;
  const slack = Number.isFinite(slackPeriods) && slackPeriods > 0
    ? Math.floor(slackPeriods)
    : 0;
  await db
    .insert(examSegmentPlans)
    .values({
      ownerId,
      subjectId,
      examOrdinal,
      plannedPeriods: planned,
      slackPeriods: slack,
    })
    .onConflictDoUpdate({
      target: [examSegmentPlans.subjectId, examSegmentPlans.examOrdinal],
      set: {
        plannedPeriods: planned,
        slackPeriods: slack,
        updatedAt: new Date(),
      },
    });
}

/**
 * 시험 구간별 시험일(calendarEvents, exam, examSemester=sem). getPlanView 와 동일 소스.
 * 반환: Map<examOrdinal(1|2), date(YYYY-MM-DD)>. AC-1.3 남은차시 카운터 입력.
 */
export async function getExamDatesByOrdinal(
  db: DB,
  ownerId: string,
  year: number,
  sem: 1 | 2,
): Promise<Map<number, string>> {
  const { start, end } = await resolveSemesterRange(db, ownerId, year, sem);
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
  const map = new Map<number, string>();
  for (const ex of exams) {
    if (ex.examOrdinal === 1 || ex.examOrdinal === 2) {
      // 동일 차수 복수면 가장 이른 날짜를 채택(결정론).
      const prev = map.get(ex.examOrdinal);
      if (prev == null || ex.date < prev) map.set(ex.examOrdinal, ex.date);
    }
  }
  return map;
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

/* ──────────────────────────────────────────────────────────────────────────
 * QC v5 c1 — 여유차시(slack) 토글/해제 (AC-1.5).
 *
 * 순수 시프트(domain shiftSlackCell/unshiftSlackCell)로 목표 상태를 계산하고, DB 에는
 * **ordinal 을 바꾸지 않고 각 ordinal 행의 내용 필드(unitId/content/keywords)만
 * 재배치**한다. ordinal 컬럼을 변경하지 않으므로 `uq_lesson_plans(subject_id, ordinal)`
 * (0017:12 plain unique = 비-deferrable)을 statement 단위로도 절대 위반하지 않는다
 * (이관은 내용 이동일 뿐 키 이동이 아님 — RALPLAN-DR (b) 비-deferrable 회피 채택).
 *
 * 시프트로 인해 마지막 칸 밖으로 밀려나는 내용이 있으면(= 빈 여유차시 슬랙이 없으면)
 * 데이터 손실이 되므로, 호출 측이 슬랙 한도 안에서만 토글하도록 사전 검증한다.
 * ──────────────────────────────────────────────────────────────────────── */

/** 과목 차시를 ordinal 1..N 연속 슬롯으로 조회(빈 ordinal 은 빈 셀로 채움). */
async function listPlanSlots(
  db: DB,
  ownerId: string,
  subjectId: string,
): Promise<{ slots: PlanSlot[]; length: number }> {
  const rows = await listLessonPlan(db, ownerId, subjectId);
  const maxOrdinal = rows.reduce((m, r) => Math.max(m, r.ordinal), 0);
  const byOrdinal = new Map<number, LessonPlanRow>();
  for (const r of rows) byOrdinal.set(r.ordinal, r);
  const slots: PlanSlot[] = [];
  for (let ordinal = 1; ordinal <= maxOrdinal; ordinal++) {
    const r = byOrdinal.get(ordinal);
    slots.push({
      ordinal,
      unitId: r?.unitId ?? null,
      content: r?.content ?? null,
      keywords: r?.keywords ?? null,
    });
  }
  return { slots, length: maxOrdinal };
}

/** 차시 1행의 내용 필드만 갱신(ordinal 불변). 행이 없으면 삽입한다. */
async function setPlanCell(
  db: DB,
  ownerId: string,
  subjectId: string,
  slot: PlanSlot,
): Promise<void> {
  await db
    .insert(lessonPlans)
    .values({
      ownerId,
      subjectId,
      ordinal: slot.ordinal,
      content: slot.content,
      keywords: slot.keywords,
      unitId: slot.unitId,
    })
    .onConflictDoUpdate({
      target: [lessonPlans.subjectId, lessonPlans.ordinal],
      set: {
        content: slot.content,
        keywords: slot.keywords,
        unitId: slot.unitId,
        updatedAt: new Date(),
      },
    });
}

export interface SlackToggleResult {
  ok: boolean;
  /** 거부 사유(슬랙 한도 초과 등). ok=true 면 undefined. */
  error?: string;
}

/**
 * ordinal `k` 를 여유차시로 등록(시프트). k..N 내용을 한 칸 뒤로 이관하고 k 를 빈
 * 차시로 만든다. 마지막 칸에 내용이 있으면(= 밀어낼 빈 슬랙 없음) 데이터 손실이므로
 * 거부한다(슬랙 한도 초과). 차이가 있는 행만 내용 재배치(ordinal 불변).
 */
export async function toggleSlackCell(
  db: DB,
  ownerId: string,
  subjectId: string,
  k: number,
): Promise<SlackToggleResult> {
  const { slots } = await listPlanSlots(db, ownerId, subjectId);
  if (slots.length === 0) return { ok: false, error: "차시가 없습니다." };
  const last = slots[slots.length - 1];
  // 마지막 칸에 내용이 있으면 시프트 시 탈락 → 손실. 슬랙(빈 차시) 한도 초과.
  if (k <= last.ordinal && !isSlackCell(last)) {
    return {
      ok: false,
      error: "마지막 차시에 내용이 있어 여유차시로 밀어낼 공간이 없습니다. 차시를 추가하세요.",
    };
  }
  const next = shiftSlackCell(slots, k);
  await applySlotDiff(db, ownerId, subjectId, slots, next);
  return { ok: true };
}

/**
 * ordinal `k` 여유차시 해제(역연산). k+1..N 내용을 한 칸 앞으로 당겨 원위치 복원하고
 * 마지막 칸을 빈 차시로 만든다. 차이가 있는 행만 내용 재배치(ordinal 불변).
 */
export async function untoggleSlackCell(
  db: DB,
  ownerId: string,
  subjectId: string,
  k: number,
): Promise<SlackToggleResult> {
  const { slots } = await listPlanSlots(db, ownerId, subjectId);
  if (slots.length === 0) return { ok: false, error: "차시가 없습니다." };
  const next = unshiftSlackCell(slots, k);
  await applySlotDiff(db, ownerId, subjectId, slots, next);
  return { ok: true };
}

/**
 * before→after 슬롯 내용 차이만 DB 에 반영(ordinal 불변). ordinal 키를 바꾸지 않으므로
 * 비-deferrable unique 위반이 구조적으로 불가능하다. 순서 무관(키 충돌 없음).
 */
async function applySlotDiff(
  db: DB,
  ownerId: string,
  subjectId: string,
  before: PlanSlot[],
  after: PlanSlot[],
): Promise<void> {
  const beforeByOrdinal = new Map<number, PlanSlot>();
  for (const s of before) beforeByOrdinal.set(s.ordinal, s);
  for (const s of after) {
    const b = beforeByOrdinal.get(s.ordinal);
    if (
      b &&
      b.unitId === s.unitId &&
      b.content === s.content &&
      JSON.stringify(b.keywords) === JSON.stringify(s.keywords)
    ) {
      continue; // 변화 없음 → skip.
    }
    await setPlanCell(db, ownerId, subjectId, s);
  }
}

/** 6자리 코드 헬퍼 재노출(쿼리/액션 계층 편의). */
export { sixDigitCode };
