import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  subjects,
  courseSections,
  classSessions,
  timetableSlots,
} from "../schema/classes";
import {
  lessonPlans,
  sessionRecords,
  lessonUnits,
  examTargets,
} from "../schema/records";
import { schoolDayCalendar } from "../schema/misc";
import { weekdayOf, isSlackCell } from "@/lib/domain/lesson-plan";
import { sixDigitCode } from "@/lib/domain/lesson-unit";
import {
  computeProgressRates,
  progressColor,
  type ProgressColor,
} from "@/lib/domain/progress";
import type { SessionStatus } from "@/lib/domain/types";
import { setSessionStatus } from "./sessions";
import { resolveSemesterRange } from "./calendar";

/**
 * 수업 진척도 관리 쿼리 계층 (교실 2-2 단계3, ownerId 인자 규약).
 *
 * sessions.ts 차시 엔진을 **학기 전체 범위**로 일반화한다. 기존 엔진과의 차이
 * (계획 Critic #6): sessions.ts 는 `today()`→`examBoundaryDate` 클리핑(경계 미설정
 * 시 throw)이지만, 진척도는 `semesterRange(year,sem)` start→end 전체를 대상으로
 * 하고 **시험경계 무관**(throw 제거)이다. done/not_held 행은 절대 덮어쓰지 않고
 * 미래 planned 만 add/remove 한다. schoolDayCalendar 행이 범위에 없으면 no-op.
 */
type DB = PostgresJsDatabase<typeof schema>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface GenerateSemesterResult {
  generated: number;
  removed: number;
  total: number;
}

/**
 * 한 분반의 planned 차시를 **학기 전체 범위**로 생성/정리.
 *
 * 범위 = semesterRange(year,sem). 시험경계 무관(throw 없음). schoolDayCalendar
 * (isSchoolDay) ∩ 분반 슬롯 요일에 missing planned 삽입. 미래(오늘 이후) planned 중
 * target 아님은 삭제(done/not_held 불변). 범위에 수업일 행이 없으면 graceful no-op.
 */
export async function generateSemesterSessions(
  db: DB,
  ownerId: string,
  sectionId: string,
  year: number,
  sem: 1 | 2,
): Promise<GenerateSemesterResult> {
  // QC v3 AC-2.1: 학기 경계를 8/14 고정이 아니라 여름방학 시작 기준으로(미설정 8/14 fallback).
  const { start, end } = await resolveSemesterRange(db, ownerId, year, sem);

  const slots = await db
    .select({ weekday: timetableSlots.weekday })
    .from(timetableSlots)
    .where(
      and(
        eq(timetableSlots.ownerId, ownerId),
        eq(timetableSlots.sectionId, sectionId),
      ),
    );
  const slotWeekdays = new Set(slots.map((s) => s.weekday));
  // 슬롯이 없으면 대상 요일이 없으므로 생성 대상 없음(graceful).
  if (slotWeekdays.size === 0) {
    return { generated: 0, removed: 0, total: 0 };
  }

  const schoolDays = await db
    .select({ date: schoolDayCalendar.date })
    .from(schoolDayCalendar)
    .where(
      and(
        eq(schoolDayCalendar.ownerId, ownerId),
        eq(schoolDayCalendar.isSchoolDay, true),
        gte(schoolDayCalendar.date, start),
        lte(schoolDayCalendar.date, end),
      ),
    );
  const targetDates = new Set<string>();
  for (const { date } of schoolDays) {
    if (slotWeekdays.has(weekdayOf(date))) targetDates.add(date);
  }

  // 학기 범위 내 기존 차시(정리는 범위 밖 차시 불변).
  const existing = await db
    .select({
      id: classSessions.id,
      date: classSessions.date,
      status: classSessions.status,
    })
    .from(classSessions)
    .where(
      and(
        eq(classSessions.ownerId, ownerId),
        eq(classSessions.sectionId, sectionId),
        gte(classSessions.date, start),
        lte(classSessions.date, end),
      ),
    );
  const existingDates = new Set(existing.map((e) => e.date));

  // 생성: target 중 미존재 → planned.
  const start2 = today();
  const toInsert = [...targetDates]
    .filter((date) => !existingDates.has(date))
    .map((date) => ({ ownerId, sectionId, date, status: "planned" as const }));
  if (toInsert.length > 0) {
    await db.insert(classSessions).values(toInsert).onConflictDoNothing();
  }

  // 정리: 미래(오늘 이후) planned 중 target 아님 → 삭제 (done/not_held 불변, 학기 범위 한정).
  const toRemove = existing
    .filter(
      (e) =>
        e.status === "planned" && e.date >= start2 && !targetDates.has(e.date),
    )
    .map((e) => e.id);
  if (toRemove.length > 0) {
    await db
      .delete(classSessions)
      .where(
        and(eq(classSessions.ownerId, ownerId), inArray(classSessions.id, toRemove)),
      );
  }

  return {
    generated: toInsert.length,
    removed: toRemove.length,
    total: targetDates.size,
  };
}

export interface ProgressPopupRow {
  sessionId: string;
  sectionId: string;
  sectionLabel: string;
  subjectId: string;
  subjectName: string;
  date: string;
  overdue: boolean; // date < 오늘 = 연체
}

/** 이번주(월~일) ∪ 연체(date<오늘) 의 planned 차시. 활성 학기 과목으로 한정. */
export async function listProgressPopup(
  db: DB,
  ownerId: string,
  year: number,
  sem: 1 | 2,
): Promise<ProgressPopupRow[]> {
  const todayStr = today();

  // 이번 ISO 주의 월요일~일요일 경계(UTC).
  const now = new Date(todayStr + "T00:00:00Z");
  const dow = now.getUTCDay(); // 0=일..6=토
  const sinceMonday = dow === 0 ? 6 : dow - 1; // 월요일까지 거슬러 간 일수
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - sinceMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const weekStart = monday.toISOString().slice(0, 10);
  const weekEnd = sunday.toISOString().slice(0, 10);

  const rows = await db
    .select({
      sessionId: classSessions.id,
      sectionId: classSessions.sectionId,
      sectionLabel: courseSections.label,
      subjectId: subjects.id,
      subjectName: subjects.name,
      date: classSessions.date,
      status: classSessions.status,
    })
    .from(classSessions)
    .innerJoin(courseSections, eq(classSessions.sectionId, courseSections.id))
    .innerJoin(subjects, eq(courseSections.subjectId, subjects.id))
    .where(
      and(
        eq(classSessions.ownerId, ownerId),
        eq(classSessions.status, "planned"),
        eq(subjects.schoolYear, year),
        eq(subjects.semester, sem),
      ),
    )
    .orderBy(asc(classSessions.date), asc(courseSections.label));

  return rows
    .filter((r) => r.date < todayStr || (r.date >= weekStart && r.date <= weekEnd))
    .map((r) => ({
      sessionId: r.sessionId,
      sectionId: r.sectionId,
      sectionLabel: r.sectionLabel,
      subjectId: r.subjectId,
      subjectName: r.subjectName,
      date: r.date,
      overdue: r.date < todayStr,
    }));
}

export interface DoneRecordInput {
  actualContent?: string | null;
  keywords?: string[];
  evalIdea?: string | null;
  planOrdinal?: number | null;
}

/** 차시 완료 처리 + session_records upsert(unique session_id). 소유자 본인 행만. */
export async function markSessionDone(
  db: DB,
  ownerId: string,
  sessionId: string,
  input: DoneRecordInput,
): Promise<void> {
  // 소유자 가드: 본인 차시인지 확인.
  const [sess] = await db
    .select({ id: classSessions.id })
    .from(classSessions)
    .where(and(eq(classSessions.id, sessionId), eq(classSessions.ownerId, ownerId)))
    .limit(1);
  if (!sess) throw new Error("차시를 찾을 수 없습니다.");

  await db
    .update(classSessions)
    .set({ status: "done", updatedAt: new Date() })
    .where(and(eq(classSessions.id, sessionId), eq(classSessions.ownerId, ownerId)));

  const actualContent = input.actualContent?.trim()
    ? input.actualContent.trim()
    : null;
  const keywords =
    input.keywords && input.keywords.length > 0 ? input.keywords : null;
  const evalIdea = input.evalIdea?.trim() ? input.evalIdea.trim() : null;
  const planOrdinal =
    typeof input.planOrdinal === "number" && input.planOrdinal >= 1
      ? input.planOrdinal
      : null;

  await db
    .insert(sessionRecords)
    .values({ ownerId, sessionId, actualContent, keywords, evalIdea, planOrdinal })
    .onConflictDoUpdate({
      target: sessionRecords.sessionId,
      set: { actualContent, keywords, evalIdea, planOrdinal, updatedAt: new Date() },
    });
}

/** 차시 상태 변경(예정/미진행/완료). sessions.ts setSessionStatus 재사용 래퍼. */
export async function setProgressStatus(
  db: DB,
  ownerId: string,
  sessionId: string,
  status: SessionStatus,
): Promise<void> {
  await setSessionStatus(db, ownerId, sessionId, status);
}

export interface SessionRecordRow {
  sessionId: string;
  actualContent: string | null;
  keywords: string[] | null;
  evalIdea: string | null;
  planOrdinal: number | null;
}

/** 기존 진척 기록 조회(편집용). 없으면 null. */
export async function getSessionRecord(
  db: DB,
  ownerId: string,
  sessionId: string,
): Promise<SessionRecordRow | null> {
  const [rec] = await db
    .select({
      sessionId: sessionRecords.sessionId,
      actualContent: sessionRecords.actualContent,
      keywords: sessionRecords.keywords,
      evalIdea: sessionRecords.evalIdea,
      planOrdinal: sessionRecords.planOrdinal,
    })
    .from(sessionRecords)
    .where(
      and(eq(sessionRecords.ownerId, ownerId), eq(sessionRecords.sessionId, sessionId)),
    )
    .limit(1);
  return rec ?? null;
}

export interface PlanForSession {
  ordinal: number;
  content: string | null;
  keywords: string[] | null;
}

/**
 * 토글 불러오기용 (R16 자동 매핑). 차시의 **분반 내 날짜순위 k**(date-rank, 완료
 * 순서 아님)를 산출하고, 과목 lesson_plans 의 ordinal k 항목을 반환한다.
 *
 * 분반 차시수 > N 이면 초과 k 는 빈 계획(null) graceful. N > 분반 차시수면 잔여 계획
 * 미사용. 차시·계획 부재 시 모두 null.
 */
export async function getPlanForSession(
  db: DB,
  ownerId: string,
  sessionId: string,
): Promise<PlanForSession | null> {
  // 차시의 분반·과목.
  const [sess] = await db
    .select({
      sectionId: classSessions.sectionId,
      subjectId: courseSections.subjectId,
    })
    .from(classSessions)
    .innerJoin(courseSections, eq(classSessions.sectionId, courseSections.id))
    .where(and(eq(classSessions.id, sessionId), eq(classSessions.ownerId, ownerId)))
    .limit(1);
  if (!sess) return null;

  // 분반의 모든 차시를 날짜 오름차순으로 → 이 차시의 1-based 인덱스 k.
  const all = await db
    .select({ id: classSessions.id })
    .from(classSessions)
    .where(
      and(
        eq(classSessions.ownerId, ownerId),
        eq(classSessions.sectionId, sess.sectionId),
      ),
    )
    .orderBy(asc(classSessions.date), asc(classSessions.id));
  const idx = all.findIndex((r) => r.id === sessionId);
  if (idx < 0) return null;
  const k = idx + 1;

  // 과목 계획 ordinal k.
  const [plan] = await db
    .select({
      ordinal: lessonPlans.ordinal,
      content: lessonPlans.content,
      keywords: lessonPlans.keywords,
    })
    .from(lessonPlans)
    .where(
      and(
        eq(lessonPlans.ownerId, ownerId),
        eq(lessonPlans.subjectId, sess.subjectId),
        eq(lessonPlans.ordinal, k),
      ),
    )
    .limit(1);
  return plan ?? null;
}

export interface SemesterSection {
  sectionId: string;
  label: string;
  subjectId: string;
  subjectName: string;
}

export interface SectionProgressStat {
  sectionId: string;
  label: string;
  subjectId: string;
  subjectName: string;
  /** 계획상 오늘까지 진행했어야 할 차시(date<=today). */
  plannedToToday: number;
  /** 실제 진행(done) 차시. */
  actualDone: number;
  /** 시험목표 총 차시(분모). 시험목표 미설정 시 분반 전체 차시. */
  examTargetTotal: number;
  /** 목표 진도율(0..1). */
  targetRate: number;
  /** 실제 진도율(0..1). */
  actualRate: number;
  /** 초록/빨강(실제가 계획보다 2차시 이상 뒤지면 빨강). */
  color: ProgressColor;
  /**
   * QC v5 c2(AC-2.2) — done 차시 중 마지막(날짜·날짜순위)으로 도달한 단원 6자리코드.
   * isSlackCell(여유 빈셀)은 제외. 도달 단원 없으면 null.
   */
  lastDoneUnitCode: number | null;
  /** 마지막 도달 단원 라벨(대>중>소). 없으면 null. */
  lastDoneUnitLabel: string | null;
  /**
   * QC v5 c2(AC-2.4) — 지필(중간/기말) 둘 다 미시행이면 false → 시험진도율 블록 생략,
   * 단원진도(lastDoneUnit)만 표시. 하나라도 시행이면 true.
   */
  showExamProgress: boolean;
}

/**
 * 분반별 진척도 통계(AC-2.4~2.6). 둘 다 차시 수 기준.
 *  - 목표 진도율 = 계획상 오늘까지 차시(date<=today) ÷ 시험목표 총 차시.
 *  - 실제 진도율 = done 차시 ÷ 시험목표 총 차시.
 *  - 시험목표 총 차시 = 과목의 lesson_plans 중 연결 단원(unit) 6자리코드가 exam_targets
 *    범위(from~to) 안인 차시 수. 시험목표 미설정/0이면 분반 전체 차시로 폴백.
 *  - 색상 = progressColor(계획−실제 >= 2 → 빨강).
 * 분반별 독립 카운트.
 */
export async function getSectionProgressStats(
  db: DB,
  ownerId: string,
  year: number,
  sem: 1 | 2,
): Promise<SectionProgressStat[]> {
  const allSections = await listSectionsForSemester(db, ownerId, year, sem);
  if (allSections.length === 0) return [];

  const subjectIds = [...new Set(allSections.map((s) => s.subjectId))];

  // 과목별 지필 시행 플래그(AC-2.4). 둘 다 false면 시험진도율 생략.
  const subjectFlags = await db
    .select({
      id: subjects.id,
      jipilMid: subjects.jipilMidEnabled,
      jipilFinal: subjects.jipilFinalEnabled,
    })
    .from(subjects)
    .where(
      and(eq(subjects.ownerId, ownerId), inArray(subjects.id, subjectIds)),
    );
  const showExamBySubject = new Map<string, boolean>();
  for (const f of subjectFlags) {
    showExamBySubject.set(f.id, f.jipilMid || f.jipilFinal);
  }

  // 과목별 lesson_plans 존재 여부(AC-2.1 활성 조건).
  const subjectsWithPlans = new Set<string>();
  // 과목별 ordinal → {unitId, content}(빈셀 판정·단원코드 도출용).
  const planCellsBySubject = new Map<
    string,
    Map<number, { unitId: string | null; content: string | null }>
  >();
  for (const subjectId of subjectIds) {
    const plans = await db
      .select({
        ordinal: lessonPlans.ordinal,
        unitId: lessonPlans.unitId,
        content: lessonPlans.content,
      })
      .from(lessonPlans)
      .where(
        and(
          eq(lessonPlans.ownerId, ownerId),
          eq(lessonPlans.subjectId, subjectId),
        ),
      );
    if (plans.length > 0) subjectsWithPlans.add(subjectId);
    const m = new Map<
      number,
      { unitId: string | null; content: string | null }
    >();
    for (const p of plans) m.set(p.ordinal, { unitId: p.unitId, content: p.content });
    planCellsBySubject.set(subjectId, m);
  }

  // 분반별 차시(날짜·상태) 일괄 조회. (활성=class_sessions 존재 + lesson_plans 존재)
  const sessions = await db
    .select({
      sectionId: classSessions.sectionId,
      date: classSessions.date,
      status: classSessions.status,
      id: classSessions.id,
    })
    .from(classSessions)
    .where(
      and(
        eq(classSessions.ownerId, ownerId),
        inArray(
          classSessions.sectionId,
          allSections.map((s) => s.sectionId),
        ),
      ),
    );
  const sessionsBySection = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const arr = sessionsBySection.get(s.sectionId) ?? [];
    arr.push(s);
    sessionsBySection.set(s.sectionId, arr);
  }

  // AC-2.1 활성 조건: lesson_plans 존재 + class_sessions 존재 과목/분반만.
  const sections = allSections.filter(
    (s) =>
      subjectsWithPlans.has(s.subjectId) &&
      (sessionsBySection.get(s.sectionId)?.length ?? 0) > 0,
  );
  if (sections.length === 0) return [];

  const todayStr = today();
  const plannedToTodayBySection = new Map<string, number>();
  const actualDoneBySection = new Map<string, number>();
  const totalBySection = new Map<string, number>();
  for (const sec of sections) {
    plannedToTodayBySection.set(sec.sectionId, 0);
    actualDoneBySection.set(sec.sectionId, 0);
    totalBySection.set(sec.sectionId, 0);
  }
  for (const sec of sections) {
    const list = sessionsBySection.get(sec.sectionId) ?? [];
    for (const s of list) {
      totalBySection.set(sec.sectionId, (totalBySection.get(sec.sectionId) ?? 0) + 1);
      if (s.date <= todayStr) {
        plannedToTodayBySection.set(
          sec.sectionId,
          (plannedToTodayBySection.get(sec.sectionId) ?? 0) + 1,
        );
      }
      if (s.status === "done") {
        actualDoneBySection.set(
          sec.sectionId,
          (actualDoneBySection.get(sec.sectionId) ?? 0) + 1,
        );
      }
    }
  }

  // 과목별 단원 코드/라벨 맵(마지막 도달 단원·시험목표 범위 공용).
  const unitMetaBySubject = new Map<
    string,
    Map<string, { code: number; label: string }>
  >();
  for (const subjectId of subjectIds) {
    const units = await db
      .select({
        id: lessonUnits.id,
        majorNo: lessonUnits.majorNo,
        midNo: lessonUnits.midNo,
        minorNo: lessonUnits.minorNo,
        majorName: lessonUnits.majorName,
        midName: lessonUnits.midName,
        minorName: lessonUnits.minorName,
      })
      .from(lessonUnits)
      .where(
        and(
          eq(lessonUnits.ownerId, ownerId),
          eq(lessonUnits.subjectId, subjectId),
        ),
      );
    const m = new Map<string, { code: number; label: string }>();
    for (const u of units) {
      m.set(u.id, {
        code: sixDigitCode(u),
        label: `${u.majorName} > ${u.midName} > ${u.minorName}`,
      });
    }
    unitMetaBySubject.set(subjectId, m);
  }

  // 과목별 시험목표 총 차시(연결 단원코드 ∈ exam_targets 범위).
  const examTargetTotalBySubject = new Map<string, number>();
  for (const subjectId of subjectIds) {
    const targets = await db
      .select({
        from: examTargets.unitFromCode,
        to: examTargets.unitToCode,
      })
      .from(examTargets)
      .where(
        and(
          eq(examTargets.ownerId, ownerId),
          eq(examTargets.subjectId, subjectId),
        ),
      );
    const ranges = targets
      .filter((t) => t.from != null && t.to != null)
      .map((t) => ({ from: t.from as number, to: t.to as number }));
    if (ranges.length === 0) {
      examTargetTotalBySubject.set(subjectId, 0); // 폴백은 분반별 total 사용.
      continue;
    }
    const unitMeta = unitMetaBySubject.get(subjectId);
    const planCells = planCellsBySubject.get(subjectId);
    let count = 0;
    for (const cell of planCells?.values() ?? []) {
      if (!cell.unitId) continue;
      const code = unitMeta?.get(cell.unitId)?.code;
      if (code == null) continue;
      if (ranges.some((r) => code >= r.from && code <= r.to)) count++;
    }
    examTargetTotalBySubject.set(subjectId, count);
  }

  return sections.map((sec) => {
    const plannedToToday = plannedToTodayBySection.get(sec.sectionId) ?? 0;
    const actualDone = actualDoneBySection.get(sec.sectionId) ?? 0;
    const sectionTotal = totalBySection.get(sec.sectionId) ?? 0;
    const subjectTarget = examTargetTotalBySubject.get(sec.subjectId) ?? 0;
    // 시험목표 미설정/0이면 분반 전체 차시로 폴백.
    const examTargetTotal = subjectTarget > 0 ? subjectTarget : sectionTotal;
    const { targetRate, actualRate } = computeProgressRates({
      plannedOrdinalsToToday: plannedToToday,
      actualDoneOrdinals: actualDone,
      examTargetTotalOrdinals: examTargetTotal,
    });

    // AC-2.2: done 차시 중 마지막(날짜·날짜순위) 단원코드 도출. 빈셀(isSlackCell) 제외.
    const planCells = planCellsBySubject.get(sec.subjectId);
    const unitMeta = unitMetaBySubject.get(sec.subjectId);
    const { lastDoneUnitCode, lastDoneUnitLabel } = deriveLastDoneUnit(
      sessionsBySection.get(sec.sectionId) ?? [],
      planCells,
      unitMeta,
    );

    return {
      sectionId: sec.sectionId,
      label: sec.label,
      subjectId: sec.subjectId,
      subjectName: sec.subjectName,
      plannedToToday,
      actualDone,
      examTargetTotal,
      targetRate,
      actualRate,
      color: progressColor({
        plannedOrdinalsToToday: plannedToToday,
        actualDoneOrdinals: actualDone,
      }),
      lastDoneUnitCode,
      lastDoneUnitLabel,
      showExamProgress: showExamBySubject.get(sec.subjectId) ?? true,
    };
  });
}

/**
 * AC-2.2 — 분반 done 차시 중 마지막으로 도달한 단원코드 도출. 차시의 분반 내 날짜순위
 * k(date asc, id asc)로 lesson_plans ordinal k 셀을 찾고, **isSlackCell(빈 여유차시)은
 * 건너뛴다**(여유차시가 실제 진도로 오인되지 않도록, M2). 가장 뒤(날짜·순위) done 차시의
 * 비-빈셀 단원이 마지막 도달 단원. done/연결단원 없으면 null.
 */
function deriveLastDoneUnit(
  sessions: { date: string; status: SessionStatus; id: string }[],
  planCells:
    | Map<number, { unitId: string | null; content: string | null }>
    | undefined,
  unitMeta: Map<string, { code: number; label: string }> | undefined,
): { lastDoneUnitCode: number | null; lastDoneUnitLabel: string | null } {
  if (!planCells || !unitMeta) {
    return { lastDoneUnitCode: null, lastDoneUnitLabel: null };
  }
  // 분반 차시를 날짜·id 오름차순으로 정렬 → 1-based 날짜순위 k.
  const ordered = [...sessions].sort((a, b) =>
    a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date),
  );
  let resultCode: number | null = null;
  let resultLabel: string | null = null;
  ordered.forEach((s, i) => {
    if (s.status !== "done") return;
    const k = i + 1;
    const cell = planCells.get(k);
    if (!cell) return;
    if (isSlackCell({ unitId: cell.unitId, content: cell.content, keywords: null })) {
      return; // 여유차시(빈셀)는 실제 진도로 카운트하지 않음.
    }
    if (!cell.unitId) return;
    const meta = unitMeta.get(cell.unitId);
    if (!meta) return;
    // 더 뒤(날짜순위 큰) done 차시일수록 덮어써 마지막을 남김.
    resultCode = meta.code;
    resultLabel = meta.label;
  });
  return { lastDoneUnitCode: resultCode, lastDoneUnitLabel: resultLabel };
}

/** 활성 학기 과목들의 분반 목록(과목명·분반순). 진척도 보드용. */
export async function listSectionsForSemester(
  db: DB,
  ownerId: string,
  year: number,
  sem: 1 | 2,
): Promise<SemesterSection[]> {
  return db
    .select({
      sectionId: courseSections.id,
      label: courseSections.label,
      subjectId: subjects.id,
      subjectName: subjects.name,
    })
    .from(courseSections)
    .innerJoin(subjects, eq(courseSections.subjectId, subjects.id))
    .where(
      and(
        eq(courseSections.ownerId, ownerId),
        eq(subjects.schoolYear, year),
        eq(subjects.semester, sem),
      ),
    )
    .orderBy(asc(subjects.name), asc(courseSections.label));
}
