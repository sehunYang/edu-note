import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  subjects,
  courseSections,
  classSessions,
  timetableSlots,
} from "../schema/classes";
import { lessonPlans, sessionRecords } from "../schema/records";
import { schoolDayCalendar } from "../schema/misc";
import { semesterRange } from "@/lib/domain/school-year";
import { weekdayOf } from "@/lib/domain/lesson-plan";
import type { SessionStatus } from "@/lib/domain/types";
import { setSessionStatus } from "./sessions";

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
  const { start, end } = semesterRange(year, sem);

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
