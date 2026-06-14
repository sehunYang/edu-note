import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  attendanceRecords,
  reportTracking,
} from "../schema/attendance";
import { studentYears } from "../schema/identity";
import { schoolDayCalendar } from "../schema/misc";
import { isReportRequired } from "@/lib/domain/attendance-rules";
import { absentPeriods, submissionTier } from "@/lib/domain/attendance";
import type {
  AttendanceReason,
  AttendanceKind,
  ReportTier,
} from "@/lib/domain/types";
import { listHomeroomStudents } from "./observations";

/**
 * 출결 쿼리 계층 (계획 §3.3 F, §3.4 attendanceRules, AC-F).
 * 사유×성격으로 기록하고, 신고서 필요 여부(reportRequired)를 도메인 규칙으로 파생
 * 저장한다. 필요 시 report_tracking 스냅샷 행을 생성/정리한다(티어 재계산은 §US-006).
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface UpsertAttendanceInput {
  studentYearId: string;
  date: string;
  reason: AttendanceReason;
  kind: AttendanceKind;
  noteField?: string | null;
  /** 교시 입력. 지각/조퇴=기점 교시, 결과=다중선택 교시, 결석=무시. */
  pivotPeriod?: number;
  selectedPeriods?: number[];
  /** 교시 목록(조회=0 포함). 미지정 시 기본값 사용. */
  periodList?: number[];
}

export interface AttendanceRow {
  id: string;
  studentYearId: string;
  date: string;
  reason: AttendanceReason;
  kind: AttendanceKind;
  reportRequired: boolean;
  reportSubmitted: boolean;
  noteField: string | null;
  periods: number[] | null;
}

/**
 * 기본 교시 목록 = [조회(0), 1..7].
 * AC-7.2의 컴시간 기반 일별 교시 수는 US-B13(시간표 연동)에서 주입된다.
 * 그 전까지는 7을 안전한 상한으로 사용한다.
 */
export const DEFAULT_PERIOD_LIST = [0, 1, 2, 3, 4, 5, 6, 7];

/** report_tracking 행을 신고서 필요 여부에 맞춰 생성/정리. */
async function syncTracking(
  db: DB,
  ownerId: string,
  attendanceRecordId: string,
  required: boolean,
): Promise<void> {
  const existing = await db
    .select({ id: reportTracking.id })
    .from(reportTracking)
    .where(
      and(
        eq(reportTracking.ownerId, ownerId),
        eq(reportTracking.attendanceRecordId, attendanceRecordId),
      ),
    )
    .limit(1);
  if (required && existing.length === 0) {
    await db.insert(reportTracking).values({ ownerId, attendanceRecordId });
  } else if (!required && existing.length > 0) {
    await db
      .delete(reportTracking)
      .where(
        and(
          eq(reportTracking.ownerId, ownerId),
          eq(reportTracking.attendanceRecordId, attendanceRecordId),
        ),
      );
  }
}

/**
 * 출결 기록 upsert(같은 학생·날짜·성격이면 갱신). reportRequired 파생 저장 +
 * report_tracking 동기화. 생성/갱신된 행 반환.
 */
export async function upsertAttendance(
  db: DB,
  ownerId: string,
  input: UpsertAttendanceInput,
): Promise<AttendanceRow> {
  const reportRequired = isReportRequired({
    kind: input.kind,
    reason: input.reason,
    noteField: input.noteField,
  });

  // 영향받은 교시 산정(저장 시점에 도메인 규칙으로 파생).
  const periods = absentPeriods(
    input.kind,
    input.pivotPeriod ?? 0,
    input.selectedPeriods ?? [],
    input.periodList ?? DEFAULT_PERIOD_LIST,
  );

  // (owner, student, date, kind) unique 제약 기반 원자적 upsert(경합 방지).
  const [row] = await db
    .insert(attendanceRecords)
    .values({
      ownerId,
      studentYearId: input.studentYearId,
      date: input.date,
      reason: input.reason,
      kind: input.kind,
      reportRequired,
      noteField: input.noteField ?? null,
      periods,
    })
    .onConflictDoUpdate({
      target: [
        attendanceRecords.ownerId,
        attendanceRecords.studentYearId,
        attendanceRecords.date,
        attendanceRecords.kind,
      ],
      set: {
        reason: input.reason,
        noteField: input.noteField ?? null,
        reportRequired,
        periods,
        updatedAt: new Date(),
      },
    })
    .returning();

  await syncTracking(db, ownerId, row.id, reportRequired);
  return toRow(row);
}

function toRow(r: typeof attendanceRecords.$inferSelect): AttendanceRow {
  return {
    id: r.id,
    studentYearId: r.studentYearId,
    date: r.date,
    reason: r.reason as AttendanceReason,
    kind: r.kind as AttendanceKind,
    reportRequired: r.reportRequired,
    reportSubmitted: r.reportSubmitted,
    noteField: r.noteField,
    periods: r.periods,
  };
}

/** 신고서 제출 여부 마킹. */
export async function setReportSubmitted(
  db: DB,
  ownerId: string,
  attendanceRecordId: string,
  submitted: boolean,
): Promise<void> {
  await db
    .update(attendanceRecords)
    .set({ reportSubmitted: submitted, updatedAt: new Date() })
    .where(
      and(
        eq(attendanceRecords.id, attendanceRecordId),
        eq(attendanceRecords.ownerId, ownerId),
      ),
    );
}

/** 출결 기록 삭제(연결된 tracking 은 FK cascade). */
export async function deleteAttendance(
  db: DB,
  ownerId: string,
  id: string,
): Promise<void> {
  await db
    .delete(attendanceRecords)
    .where(and(eq(attendanceRecords.id, id), eq(attendanceRecords.ownerId, ownerId)));
}

/** 특정 날짜의 출결 기록(학생 정보 포함, 학번순). */
export async function listAttendanceByDate(
  db: DB,
  ownerId: string,
  date: string,
): Promise<(AttendanceRow & { sid: string; name: string })[]> {
  const rows = await db
    .select({
      id: attendanceRecords.id,
      studentYearId: attendanceRecords.studentYearId,
      date: attendanceRecords.date,
      reason: attendanceRecords.reason,
      kind: attendanceRecords.kind,
      reportRequired: attendanceRecords.reportRequired,
      reportSubmitted: attendanceRecords.reportSubmitted,
      noteField: attendanceRecords.noteField,
      periods: attendanceRecords.periods,
      sid: studentYears.sid,
      name: studentYears.name,
    })
    .from(attendanceRecords)
    .innerJoin(studentYears, eq(attendanceRecords.studentYearId, studentYears.id))
    .where(and(eq(attendanceRecords.ownerId, ownerId), eq(attendanceRecords.date, date)))
    .orderBy(asc(studentYears.sid));
  return rows.map((r) => ({
    id: r.id,
    studentYearId: r.studentYearId,
    date: r.date,
    reason: r.reason as AttendanceReason,
    kind: r.kind as AttendanceKind,
    reportRequired: r.reportRequired,
    reportSubmitted: r.reportSubmitted,
    noteField: r.noteField,
    periods: r.periods,
    sid: r.sid,
    name: r.name,
  }));
}

/** 한 학생의 출결 기록(최신순). */
export async function listAttendanceByStudent(
  db: DB,
  ownerId: string,
  studentYearId: string,
): Promise<AttendanceRow[]> {
  const rows = await db
    .select()
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.ownerId, ownerId),
        eq(attendanceRecords.studentYearId, studentYearId),
      ),
    )
    .orderBy(desc(attendanceRecords.date));
  return rows.map(toRow);
}

export type AttendanceStudentRow = AttendanceRow & { sid: string; name: string };

/** 담임 학급 학생 id 집합(필터용). */
async function homeroomStudentIds(
  db: DB,
  ownerId: string,
  year: number,
): Promise<Set<string>> {
  const roster = await listHomeroomStudents(db, ownerId, year);
  return new Set(roster.map((s) => s.id));
}

function toStudentRow(r: {
  id: string;
  studentYearId: string;
  date: string;
  reason: string;
  kind: string;
  reportRequired: boolean;
  reportSubmitted: boolean;
  noteField: string | null;
  periods: number[] | null;
  sid: string;
  name: string;
}): AttendanceStudentRow {
  return {
    id: r.id,
    studentYearId: r.studentYearId,
    date: r.date,
    reason: r.reason as AttendanceReason,
    kind: r.kind as AttendanceKind,
    reportRequired: r.reportRequired,
    reportSubmitted: r.reportSubmitted,
    noteField: r.noteField,
    periods: r.periods,
    sid: r.sid,
    name: r.name,
  };
}

const STUDENT_ROW_COLUMNS = {
  id: attendanceRecords.id,
  studentYearId: attendanceRecords.studentYearId,
  date: attendanceRecords.date,
  reason: attendanceRecords.reason,
  kind: attendanceRecords.kind,
  reportRequired: attendanceRecords.reportRequired,
  reportSubmitted: attendanceRecords.reportSubmitted,
  noteField: attendanceRecords.noteField,
  periods: attendanceRecords.periods,
  sid: studentYears.sid,
  name: studentYears.name,
} as const;

/** (a) 월별 출결 목록 — 해당 월(YYYY-MM)의 담임 학생 기록을 날짜순. */
export async function listAttendanceByMonth(
  db: DB,
  ownerId: string,
  year: number,
  month: string,
): Promise<AttendanceStudentRow[]> {
  const start = `${month}-01`;
  // 다음 달 1일 미만(상한). 12월이면 다음 해 1월.
  const [y, m] = month.split("-").map(Number);
  const nextMonth =
    m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  const ids = await homeroomStudentIds(db, ownerId, year);
  const rows = await db
    .select(STUDENT_ROW_COLUMNS)
    .from(attendanceRecords)
    .innerJoin(studentYears, eq(attendanceRecords.studentYearId, studentYears.id))
    .where(
      and(
        eq(attendanceRecords.ownerId, ownerId),
        gte(attendanceRecords.date, start),
        lt(attendanceRecords.date, nextMonth),
      ),
    )
    .orderBy(asc(attendanceRecords.date), asc(studentYears.sid));
  return rows.filter((r) => ids.has(r.studentYearId)).map(toStudentRow);
}

/** (b) 학생별 검색 — 담임 학생 1명의 출결 기록(최신순). */
export async function searchAttendanceByStudent(
  db: DB,
  ownerId: string,
  year: number,
  studentYearId: string,
): Promise<AttendanceStudentRow[]> {
  const ids = await homeroomStudentIds(db, ownerId, year);
  if (!ids.has(studentYearId)) return [];
  const rows = await db
    .select(STUDENT_ROW_COLUMNS)
    .from(attendanceRecords)
    .innerJoin(studentYears, eq(attendanceRecords.studentYearId, studentYears.id))
    .where(
      and(
        eq(attendanceRecords.ownerId, ownerId),
        eq(attendanceRecords.studentYearId, studentYearId),
      ),
    )
    .orderBy(desc(attendanceRecords.date));
  return rows.map(toStudentRow);
}

export type UnsubmittedAttendanceRow = AttendanceStudentRow & {
  deadlineDate: string | null;
  remainingSchoolDays: number | null;
  tier: ReportTier;
};

/**
 * (c) 미제출만 — 신고서 필요·미제출 담임 학생 기록.
 * 남은 수업일(오늘 다음 날부터 마감일까지, 마감 포함)을 세어 submissionTier 로 분류.
 */
export async function listUnsubmittedAttendance(
  db: DB,
  ownerId: string,
  year: number,
  asOf: Date = new Date(),
): Promise<UnsubmittedAttendanceRow[]> {
  const ids = await homeroomStudentIds(db, ownerId, year);
  const rows = await db
    .select({
      ...STUDENT_ROW_COLUMNS,
      deadlineDate: reportTracking.deadlineDate,
    })
    .from(attendanceRecords)
    .innerJoin(studentYears, eq(attendanceRecords.studentYearId, studentYears.id))
    .leftJoin(
      reportTracking,
      eq(reportTracking.attendanceRecordId, attendanceRecords.id),
    )
    .where(
      and(
        eq(attendanceRecords.ownerId, ownerId),
        eq(attendanceRecords.reportRequired, true),
        eq(attendanceRecords.reportSubmitted, false),
      ),
    )
    .orderBy(asc(attendanceRecords.date), asc(studentYears.sid));

  // 남은 수업일 계산용 수업일 집합.
  const cal = await db
    .select({ date: schoolDayCalendar.date })
    .from(schoolDayCalendar)
    .where(
      and(
        eq(schoolDayCalendar.ownerId, ownerId),
        eq(schoolDayCalendar.isSchoolDay, true),
      ),
    );
  const sortedSchoolDays = cal.map((c) => c.date).sort();
  const today = asOf.toISOString().slice(0, 10);

  return rows
    .filter((r) => ids.has(r.studentYearId))
    .map((r) => {
      const remaining =
        r.deadlineDate == null
          ? null
          : remainingSchoolDays(sortedSchoolDays, today, r.deadlineDate);
      return {
        ...toStudentRow(r),
        deadlineDate: r.deadlineDate,
        remainingSchoolDays: remaining,
        tier: submissionTier(remaining ?? 0),
      };
    });
}

/** today(제외) 다음 날부터 deadline(포함)까지 남은 수업일. deadline 지났으면 음수. */
function remainingSchoolDays(
  sortedSchoolDays: string[],
  today: string,
  deadline: string,
): number {
  if (deadline >= today) {
    // (today, deadline] 구간의 수업일 수.
    return sortedSchoolDays.filter((d) => d > today && d <= deadline).length;
  }
  // 마감 경과: (deadline, today] 구간 수업일 수의 음수.
  return -sortedSchoolDays.filter((d) => d > deadline && d <= today).length;
}
