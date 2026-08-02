import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  subjects,
  courseSections,
  classSessions,
  timetableSlots,
} from "../schema/classes";
import { lessonPlans } from "../schema/records";
import { schoolDayCalendar } from "../schema/misc";
import {
  resolveBoundary,
  tallySessions,
  type SessionLike,
} from "@/lib/domain/remaining-sessions";
import type { SessionStatus } from "@/lib/domain/types";

/**
 * 시수(차시) 관리 쿼리 계층 (계획 §3.3 B·N3, §3.4 remainingSessions, AC-B).
 *
 * 차시 생성 정책(N3): **오늘~시험경계일** 범위에서 시간표 요일 ∧ 수업일
 * (school_day_calendar)에 planned 차시를 생성. **done·not_held 행은 절대
 * 덮어쓰지 않으며**, 미래 planned만 add/remove 한다. unique(section,date)로 하루 1행.
 * 잔여차시 = planned(≤경계) − done (도메인 규칙 tallySessions).
 */
type DB = PostgresJsDatabase<typeof schema>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function weekdayOf(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay(); // 0=일..6=토 (1=월..5=금)
}

/** 과목 시험경계일(다가오는 시험) 설정. null이면 해제. */
export async function setSubjectExamBoundary(
  db: DB,
  ownerId: string,
  subjectId: string,
  date: string | null,
): Promise<void> {
  await db
    .update(subjects)
    .set({ examBoundaryDate: date, updatedAt: new Date() })
    .where(and(eq(subjects.id, subjectId), eq(subjects.ownerId, ownerId)));
}

export interface GenerateResult {
  generated: number;
  removed: number;
  total: number;
  boundary: string;
}

/** 한 분반의 planned 차시를 N3 정책으로 생성/정리. */
export async function generatePlannedSessions(
  db: DB,
  ownerId: string,
  sectionId: string,
): Promise<GenerateResult> {
  const [sec] = await db
    .select({
      subjectId: courseSections.subjectId,
      sectionBoundary: courseSections.examBoundaryDate,
    })
    .from(courseSections)
    .where(and(eq(courseSections.id, sectionId), eq(courseSections.ownerId, ownerId)))
    .limit(1);
  if (!sec) throw new Error("분반을 찾을 수 없습니다.");

  const [subj] = await db
    .select({ boundary: subjects.examBoundaryDate })
    .from(subjects)
    .where(eq(subjects.id, sec.subjectId))
    .limit(1);

  const boundary = resolveBoundary(sec.sectionBoundary, subj?.boundary ?? null);
  if (!boundary) throw new Error("시험 경계일(시험 날짜)을 먼저 설정하세요.");

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
  if (slotWeekdays.size === 0) {
    throw new Error("이 분반의 시간표가 없습니다. 먼저 컴시간 동기화를 하세요.");
  }

  const start = today();
  const schoolDays = await db
    .select({ date: schoolDayCalendar.date })
    .from(schoolDayCalendar)
    .where(
      and(
        eq(schoolDayCalendar.ownerId, ownerId),
        eq(schoolDayCalendar.isSchoolDay, true),
        gte(schoolDayCalendar.date, start),
        lte(schoolDayCalendar.date, boundary),
      ),
    );
  const targetDates = new Set<string>();
  for (const { date } of schoolDays) {
    if (slotWeekdays.has(weekdayOf(date))) targetDates.add(date);
  }

  const existing = await db
    .select({
      id: classSessions.id,
      date: classSessions.date,
      status: classSessions.status,
    })
    .from(classSessions)
    .where(
      and(eq(classSessions.ownerId, ownerId), eq(classSessions.sectionId, sectionId)),
    );
  const existingDates = new Set(existing.map((e) => e.date));

  // 생성: target 중 미존재 → planned
  const toInsert = [...targetDates]
    .filter((date) => !existingDates.has(date))
    .map((date) => ({ ownerId, sectionId, date, status: "planned" as const }));
  if (toInsert.length > 0) {
    await db.insert(classSessions).values(toInsert).onConflictDoNothing();
  }

  // 정리: 미래(오늘 이후) planned 중 target 아님 → 삭제 (done/not_held 불변)
  const toRemove = existing
    .filter(
      (e) =>
        e.status === "planned" && e.date >= start && !targetDates.has(e.date),
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
    boundary,
  };
}

/** 차시 상태 변경(완료/미진행/예정). 소유자 본인 행만. */
export async function setSessionStatus(
  db: DB,
  ownerId: string,
  sessionId: string,
  status: SessionStatus,
): Promise<void> {
  await db
    .update(classSessions)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(classSessions.id, sessionId), eq(classSessions.ownerId, ownerId)));
}

/**
 * 결손 차시의 보강일 설정/해제 (기능갭 #3). 소유자 본인 행만.
 * `makeupDate=null` 이면 보강 지정을 지운다(미회복으로 되돌림).
 */
export async function setSessionMakeup(
  db: DB,
  ownerId: string,
  sessionId: string,
  makeupDate: string | null,
  makeupNote: string | null,
): Promise<void> {
  await db
    .update(classSessions)
    .set({ makeupDate, makeupNote, updatedAt: new Date() })
    .where(and(eq(classSessions.id, sessionId), eq(classSessions.ownerId, ownerId)));
}

export interface SectionProgress {
  sectionId: string;
  label: string;
  subjectId: string;
  subjectName: string;
  boundary: string | null;
  plannedUpToBoundary: number;
  done: number;
  notHeld: number;
  makeupPlanned: number;
  unrecovered: number;
  remaining: number;
}

/** 모든 분반의 진척(잔여차시) 요약. 과목명·분반순. */
export async function listSectionsWithProgress(
  db: DB,
  ownerId: string,
  schoolYear: number,
): Promise<SectionProgress[]> {
  const secs = await db
    .select({
      sectionId: courseSections.id,
      label: courseSections.label,
      subjectId: subjects.id,
      subjectName: subjects.name,
      sectionBoundary: courseSections.examBoundaryDate,
      subjectBoundary: subjects.examBoundaryDate,
    })
    .from(courseSections)
    .innerJoin(subjects, eq(courseSections.subjectId, subjects.id))
    .where(
      and(eq(courseSections.ownerId, ownerId), eq(subjects.schoolYear, schoolYear)),
    )
    .orderBy(asc(subjects.name), asc(courseSections.label));

  const allSessions = await db
    .select({
      sectionId: classSessions.sectionId,
      date: classSessions.date,
      status: classSessions.status,
      makeupDate: classSessions.makeupDate,
    })
    .from(classSessions)
    .where(eq(classSessions.ownerId, ownerId));
  const bySection = new Map<string, SessionLike[]>();
  for (const s of allSessions) {
    const arr = bySection.get(s.sectionId) ?? [];
    arr.push({ date: s.date, status: s.status, makeupDate: s.makeupDate });
    bySection.set(s.sectionId, arr);
  }

  return secs.map((sec) => {
    const boundary = resolveBoundary(sec.sectionBoundary, sec.subjectBoundary);
    const tally = tallySessions(bySection.get(sec.sectionId) ?? [], boundary);
    return {
      sectionId: sec.sectionId,
      label: sec.label,
      subjectId: sec.subjectId,
      subjectName: sec.subjectName,
      boundary,
      ...tally,
    };
  });
}

export interface SessionRow {
  id: string;
  date: string;
  status: SessionStatus;
  makeupDate: string | null;
  makeupNote: string | null;
}

/** 한 분반의 차시 목록(날짜순). */
export async function getSectionSessions(
  db: DB,
  ownerId: string,
  sectionId: string,
): Promise<SessionRow[]> {
  return db
    .select({
      id: classSessions.id,
      date: classSessions.date,
      status: classSessions.status,
      makeupDate: classSessions.makeupDate,
      makeupNote: classSessions.makeupNote,
    })
    .from(classSessions)
    .where(
      and(eq(classSessions.ownerId, ownerId), eq(classSessions.sectionId, sectionId)),
    )
    .orderBy(asc(classSessions.date));
}

export interface TodayLesson {
  sectionId: string;
  subjectId: string;
  subjectName: string;
  label: string;
  periods: number[];
  ordinal: number;
  content: string | null;
  done: boolean;
}

/**
 * 오늘의 학교 "오늘 수업" 카드용 (QC v7 comp1, AC-1.1). 오늘 시간표 슬롯을
 * 분반별로 묶고, 체크 상태(class_sessions)와 차시 내용(lesson_plans)을 배치
 * 조회해 합성한다. 스키마 변경 0 — 완료 상태는 class_sessions.status 단일
 * 진실원(setTodaySessionStatus 가 upsert하는 바로 그 행)을 그대로 읽는다.
 *
 * ordinal(날짜순위) 산출은 getPlanForSession(progress.ts)의 k(date-asc 1-based
 * 인덱스)와 반드시 같은 값을 내야 한다(패리티, Architect 필수#2) — 오늘 행이
 * 이미 존재하면 (section,date) unique 제약상 그 날짜 행은 하나뿐이므로
 * "date < 오늘 개수 + 1"이 getPlanForSession의 k와 정확히 일치한다.
 */
export async function listTodayLessons(
  db: DB,
  ownerId: string,
  date: string,
  weekday: number,
  year: number,
  semester: number,
): Promise<TodayLesson[]> {
  const slots = await db
    .select({
      sectionId: courseSections.id,
      subjectId: subjects.id,
      subjectName: subjects.name,
      label: courseSections.label,
      period: timetableSlots.period,
    })
    .from(timetableSlots)
    .innerJoin(courseSections, eq(timetableSlots.sectionId, courseSections.id))
    .innerJoin(subjects, eq(courseSections.subjectId, subjects.id))
    .where(
      and(
        eq(timetableSlots.ownerId, ownerId),
        eq(timetableSlots.weekday, weekday),
        eq(subjects.schoolYear, year),
        eq(subjects.semester, semester),
      ),
    );
  if (slots.length === 0) return [];

  const bySection = new Map<
    string,
    { subjectId: string; subjectName: string; label: string; periods: number[] }
  >();
  for (const s of slots) {
    const entry = bySection.get(s.sectionId);
    if (entry) entry.periods.push(s.period);
    else
      bySection.set(s.sectionId, {
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        label: s.label,
        periods: [s.period],
      });
  }
  const sectionIds = [...bySection.keys()];
  const subjectIds = [...new Set([...bySection.values()].map((v) => v.subjectId))];

  const allSessions = await db
    .select({
      sectionId: classSessions.sectionId,
      date: classSessions.date,
      status: classSessions.status,
    })
    .from(classSessions)
    .where(
      and(eq(classSessions.ownerId, ownerId), inArray(classSessions.sectionId, sectionIds)),
    );
  const sessionsBySection = new Map<string, { date: string; status: SessionStatus }[]>();
  for (const s of allSessions) {
    const arr = sessionsBySection.get(s.sectionId) ?? [];
    arr.push({ date: s.date, status: s.status });
    sessionsBySection.set(s.sectionId, arr);
  }

  const plans = await db
    .select({
      subjectId: lessonPlans.subjectId,
      ordinal: lessonPlans.ordinal,
      content: lessonPlans.content,
    })
    .from(lessonPlans)
    .where(
      and(eq(lessonPlans.ownerId, ownerId), inArray(lessonPlans.subjectId, subjectIds)),
    );
  const planBySubject = new Map<string, Map<number, string | null>>();
  for (const p of plans) {
    const m = planBySubject.get(p.subjectId) ?? new Map<number, string | null>();
    m.set(p.ordinal, p.content);
    planBySubject.set(p.subjectId, m);
  }

  const result: TodayLesson[] = [];
  for (const [sectionId, info] of bySection) {
    const sessions = sessionsBySection.get(sectionId) ?? [];
    const ordinal = sessions.filter((s) => s.date < date).length + 1;
    const todayRow = sessions.find((s) => s.date === date);
    const content = planBySubject.get(info.subjectId)?.get(ordinal) ?? null;
    result.push({
      sectionId,
      subjectId: info.subjectId,
      subjectName: info.subjectName,
      label: info.label,
      periods: [...info.periods].sort((a, b) => a - b),
      ordinal,
      content,
      done: todayRow?.status === "done",
    });
  }

  return result.sort((a, b) => {
    const byPeriod = (a.periods[0] ?? 0) - (b.periods[0] ?? 0);
    return byPeriod !== 0 ? byPeriod : a.subjectName.localeCompare(b.subjectName);
  });
}

/**
 * 오늘 차시 체크/해제 (QC v7 comp1, AC-1.2/1.3). class_sessions(section,date)
 * unique 행을 upsert — 오늘 행이 없으면(시수 미생성 분반) 생성한다. 이는 의도된
 * 동작이다: "오늘 수업했다"를 그대로 반영하며, 해당 분반이 진척도에 새로
 * 등장할 수 있다(R2, 수용됨). 해제 시 삭제가 아닌 planned 복구로 멱등.
 *
 * [Architect 필수#1] upsert 전 섹션 소유권을 SELECT로 강제해 타 소유자 sectionId로
 * 상태를 만드는 IDOR을 차단한다. setWhere 로 update 절에도 방어를 병기한다.
 */
export async function setTodaySessionStatus(
  db: DB,
  ownerId: string,
  sectionId: string,
  date: string,
  status: SessionStatus,
): Promise<void> {
  const [sec] = await db
    .select({ id: courseSections.id })
    .from(courseSections)
    .where(and(eq(courseSections.id, sectionId), eq(courseSections.ownerId, ownerId)))
    .limit(1);
  if (!sec) throw new Error("분반을 찾을 수 없습니다.");

  await db
    .insert(classSessions)
    .values({ ownerId, sectionId, date, status })
    .onConflictDoUpdate({
      target: [classSessions.sectionId, classSessions.date],
      set: { status, updatedAt: new Date() },
      setWhere: eq(classSessions.ownerId, ownerId),
    });
}
