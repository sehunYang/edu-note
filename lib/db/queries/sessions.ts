import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  subjects,
  courseSections,
  classSessions,
  timetableSlots,
} from "../schema/classes";
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

export interface SectionProgress {
  sectionId: string;
  label: string;
  subjectId: string;
  subjectName: string;
  boundary: string | null;
  plannedUpToBoundary: number;
  done: number;
  notHeld: number;
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
    })
    .from(classSessions)
    .where(eq(classSessions.ownerId, ownerId));
  const bySection = new Map<string, SessionLike[]>();
  for (const s of allSessions) {
    const arr = bySection.get(s.sectionId) ?? [];
    arr.push({ date: s.date, status: s.status });
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
    })
    .from(classSessions)
    .where(
      and(eq(classSessions.ownerId, ownerId), eq(classSessions.sectionId, sectionId)),
    )
    .orderBy(asc(classSessions.date));
}
