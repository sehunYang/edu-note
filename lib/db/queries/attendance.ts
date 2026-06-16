import { and, asc, desc, eq, gte, lt, lte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  attendanceRecords,
  fieldTripReports,
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
import { applyPaging } from "../pagination";
import { listHomeroomStudents } from "./observations";
import { writeAudit } from "./audit";

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

/** owner 의 수업일(is_school_day=true) 집합을 [start,end] 범위로 조회(정렬). */
async function schoolDaysInRange(
  db: DB,
  ownerId: string,
  start: string,
  end: string,
): Promise<string[]> {
  const rows = await db
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
  return rows.map((r) => r.date);
}

/**
 * 범위 내 수업일마다 결석(kind='absent') 출결을 자동 생성한다(AC-4.2~4.4).
 * unique(owner,student,date,kind) 기반 onConflictDoNothing 로 멱등(수동 입력 보존).
 * report_required 는 도메인 규칙으로 파생, 필요 시 tracking 동기화. 생성 건수 반환.
 */
async function createAbsenceRangeRecords(
  db: DB,
  ownerId: string,
  studentYearId: string,
  start: string,
  end: string,
  reason: AttendanceReason,
  noteField: string | null,
): Promise<number> {
  const days = await schoolDaysInRange(db, ownerId, start, end);
  const reportRequired = isReportRequired({ kind: "absent", reason, noteField });
  let created = 0;
  for (const date of days) {
    // 결석=하루 전체 교시(periods 파생).
    const periods = absentPeriods("absent", 0, [], DEFAULT_PERIOD_LIST);
    const [row] = await db
      .insert(attendanceRecords)
      .values({
        ownerId,
        studentYearId,
        date,
        reason,
        kind: "absent",
        reportRequired,
        noteField,
        periods,
      })
      .onConflictDoNothing({
        target: [
          attendanceRecords.ownerId,
          attendanceRecords.studentYearId,
          attendanceRecords.date,
          attendanceRecords.kind,
        ],
      })
      .returning({ id: attendanceRecords.id });
    if (row) {
      await syncTracking(db, ownerId, row.id, reportRequired);
      created += 1;
    }
  }
  return created;
}

/**
 * 교외체험학습 추가(AC-4.2). 사후보고서 추적 행 + 기간 내 수업일마다 인정결석
 * 출결 자동 생성. endDate null=당일. trip_date=start_date 미러, 마감 기준=end_date.
 * 인정결석(reason='accepted')은 신고서 불필요(사후보고서가 곧 보고) — report_required=false.
 */
export async function addFieldTrip(
  db: DB,
  ownerId: string,
  studentYearId: string,
  startDate: string,
  endDate?: string | null,
): Promise<{ id: string; createdRecords: number }> {
  const end = endDate ?? startDate;
  const [trip] = await db
    .insert(fieldTripReports)
    .values({
      ownerId,
      studentYearId,
      tripDate: startDate,
      startDate,
      endDate: end,
    })
    .returning({ id: fieldTripReports.id });
  await db.insert(reportTracking).values({ ownerId, fieldTripId: trip.id });

  const createdRecords = await createAbsenceRangeRecords(
    db,
    ownerId,
    studentYearId,
    startDate,
    end,
    "accepted",
    null,
  );

  await writeAudit(db, ownerId, "field_trip_add", trip.id, {
    studentYearId,
    startDate,
    endDate: end,
    createdRecords,
  });
  return { id: trip.id, createdRecords };
}

/**
 * 결석 기간 입력(AC-4.4). [start,end] 의 수업일마다 결석 출결 자동 생성(멱등).
 * reason 은 호출자 지정(예: illness). 생성 건수 반환.
 */
export async function addAbsenceRange(
  db: DB,
  ownerId: string,
  studentYearId: string,
  startDate: string,
  endDate: string,
  reason: AttendanceReason,
  noteField?: string | null,
): Promise<{ createdRecords: number }> {
  const createdRecords = await createAbsenceRangeRecords(
    db,
    ownerId,
    studentYearId,
    startDate,
    endDate,
    reason,
    noteField ?? null,
  );
  await writeAudit(db, ownerId, "attendance_record", null, {
    studentYearId,
    startDate,
    endDate,
    reason,
    createdRecords,
  });
  return { createdRecords };
}

export interface UpdateAttendanceInput {
  reason: AttendanceReason;
  kind: AttendanceKind;
  noteField?: string | null;
  periods?: number[] | null;
}

/**
 * 출결 기록 수정(AC-4.5). 사유/성격/비고/교시를 갱신하고 report_required 를
 * 재계산, tracking 을 동기화한다. owner-scoped. 갱신된 행 반환(없으면 null).
 */
export async function updateAttendanceRecord(
  db: DB,
  ownerId: string,
  recordId: string,
  input: UpdateAttendanceInput,
): Promise<AttendanceRow | null> {
  const reportRequired = isReportRequired({
    kind: input.kind,
    reason: input.reason,
    noteField: input.noteField,
  });
  const [row] = await db
    .update(attendanceRecords)
    .set({
      reason: input.reason,
      kind: input.kind,
      noteField: input.noteField ?? null,
      reportRequired,
      periods: input.periods ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(attendanceRecords.id, recordId),
        eq(attendanceRecords.ownerId, ownerId),
      ),
    )
    .returning();
  if (!row) return null;
  await syncTracking(db, ownerId, row.id, reportRequired);
  await writeAudit(db, ownerId, "attendance_update", row.id, {
    reason: input.reason,
    kind: input.kind,
    reportRequired,
  });
  return toRow(row);
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

/** 페이지네이션 옵션(limit/offset). 미지정 시 전체 반환. */
export interface PageOpts {
  limit?: number;
  offset?: number;
}

/** 담임 필터 이후 메모리 슬라이스(limit/offset). 담임 필터가 SQL 후처리라 인메모리. */
function slicePage<T>(rows: T[], opts?: PageOpts): T[] {
  if (!opts || opts.limit == null) return rows;
  const offset = opts.offset != null && opts.offset > 0 ? opts.offset : 0;
  return rows.slice(offset, offset + opts.limit);
}

/** (a) 월별 출결 목록 — 해당 월(YYYY-MM)의 담임 학생 기록을 날짜순. */
export async function listAttendanceByMonth(
  db: DB,
  ownerId: string,
  year: number,
  month: string,
  opts?: PageOpts,
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
  const filtered = rows.filter((r) => ids.has(r.studentYearId)).map(toStudentRow);
  return slicePage(filtered, opts);
}

/** (b) 학생별 검색 — 담임 학생 1명의 출결 기록(최신순). */
export async function searchAttendanceByStudent(
  db: DB,
  ownerId: string,
  year: number,
  studentYearId: string,
  opts?: PageOpts,
): Promise<AttendanceStudentRow[]> {
  const ids = await homeroomStudentIds(db, ownerId, year);
  if (!ids.has(studentYearId)) return [];
  const q = db
    .select(STUDENT_ROW_COLUMNS)
    .from(attendanceRecords)
    .innerJoin(studentYears, eq(attendanceRecords.studentYearId, studentYears.id))
    .where(
      and(
        eq(attendanceRecords.ownerId, ownerId),
        eq(attendanceRecords.studentYearId, studentYearId),
      ),
    )
    .orderBy(desc(attendanceRecords.date))
    .$dynamic();
  const rows = await applyPaging(q, opts);
  return rows.map(toStudentRow);
}

export type UnsubmittedAttendanceRow = AttendanceStudentRow & {
  deadlineDate: string | null;
  remainingSchoolDays: number | null;
  tier: ReportTier;
  /** dedupe·UI 구분용 사건 출처. attendance=출결 신고서, fieldTrip=교외체험 사후보고서. */
  source: "attendance" | "fieldTrip";
};

/**
 * (c) 미제출만 — 신고서 필요·미제출 담임 학생 기록 + 교외체험 사후보고서 미제출.
 *
 * 두 소스(출결 신고서·교외체험 사후보고서)를 **각각 별도 fetch** 한 뒤 JS 에서
 * 머지한다(SQL UNION 미사용 — 담임 필터·slicePage 단계를 우회하지 않기 위함). 절차:
 *   1) attendance 소스 fetch(attendanceRecords ⋈ reportTracking(attendanceRecordId),
 *      reportRequired=true & reportSubmitted=false). 페이징 전 raw.
 *   2) fieldTrip 소스 fetch(fieldTripReports ⋈ reportTracking(fieldTripId),
 *      postReportSubmitted=false). 다일 체험은 1행으로 유지.
 *   3) 양쪽 각각 remainingSchoolDays + submissionTier 로 tier 계산(sortedSchoolDays 공유).
 *   4) 양쪽에 담임 학생 필터 적용.
 *   5) reportTrackingId 키로 dedupe(다일 체험이 (studentYearId,date) 로 collapse 되지
 *      않도록 단순 date 키 금지). null 이면 (studentYearId, source, 사건 id) 폴백.
 *   6) (date, sid) 정렬 후 **마지막에 slicePage 1회**(소스별 slicePage 금지).
 */
export async function listUnsubmittedAttendance(
  db: DB,
  ownerId: string,
  year: number,
  asOf: Date = new Date(),
  opts?: PageOpts,
): Promise<UnsubmittedAttendanceRow[]> {
  const ids = await homeroomStudentIds(db, ownerId, year);

  // (1) attendance 소스 — 신고서 필요·미제출 출결 + 추적행(마감/추적 id).
  const attRows = await db
    .select({
      ...STUDENT_ROW_COLUMNS,
      reportTrackingId: reportTracking.id,
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
    );

  // (2) fieldTrip 소스 — 사후보고서 미제출 교외체험 + 추적행. 다일 체험은 1행(시작일 대표).
  const tripRows = await db
    .select({
      id: fieldTripReports.id,
      studentYearId: fieldTripReports.studentYearId,
      tripDate: fieldTripReports.tripDate,
      startDate: fieldTripReports.startDate,
      sid: studentYears.sid,
      name: studentYears.name,
      reportTrackingId: reportTracking.id,
      deadlineDate: reportTracking.deadlineDate,
    })
    .from(fieldTripReports)
    .innerJoin(studentYears, eq(fieldTripReports.studentYearId, studentYears.id))
    .leftJoin(reportTracking, eq(reportTracking.fieldTripId, fieldTripReports.id))
    .where(
      and(
        eq(fieldTripReports.ownerId, ownerId),
        eq(fieldTripReports.postReportSubmitted, false),
      ),
    );

  // (3) 남은 수업일 계산용 수업일 집합(양쪽 소스 공유, 1회 조회).
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

  const tierFor = (deadline: string | null) => {
    const remaining =
      deadline == null ? null : remainingSchoolDays(sortedSchoolDays, today, deadline);
    return { remaining, tier: submissionTier(remaining ?? 0) };
  };

  // (4) 양쪽 homeroom 필터 + tier 계산 → UnsubmittedAttendanceRow + dedupe 키.
  type Merged = UnsubmittedAttendanceRow & { _dedupeKey: string };

  const attMapped: Merged[] = attRows
    .filter((r) => ids.has(r.studentYearId))
    .map((r) => {
      const { remaining, tier } = tierFor(r.deadlineDate);
      return {
        ...toStudentRow(r),
        deadlineDate: r.deadlineDate,
        remainingSchoolDays: remaining,
        tier,
        source: "attendance" as const,
        _dedupeKey:
          r.reportTrackingId ?? `${r.studentYearId}|attendance|${r.id}`,
      };
    });

  const tripMapped: Merged[] = tripRows
    .filter((r) => ids.has(r.studentYearId))
    .map((r) => {
      const { remaining, tier } = tierFor(r.deadlineDate);
      const date = r.startDate ?? r.tripDate;
      return {
        id: r.id,
        studentYearId: r.studentYearId,
        date,
        reason: "accepted" as AttendanceReason,
        kind: "absent" as AttendanceKind,
        reportRequired: true,
        reportSubmitted: false,
        noteField: null,
        periods: null,
        sid: r.sid,
        name: r.name,
        deadlineDate: r.deadlineDate,
        remainingSchoolDays: remaining,
        tier,
        source: "fieldTrip" as const,
        _dedupeKey: r.reportTrackingId ?? `${r.studentYearId}|fieldTrip|${r.id}`,
      };
    });

  // (5) reportTrackingId 키 dedupe(같은 사건이 양쪽 소스에 등장해도 1행).
  const byKey = new Map<string, Merged>();
  for (const row of [...attMapped, ...tripMapped]) {
    if (!byKey.has(row._dedupeKey)) byKey.set(row._dedupeKey, row);
  }

  // (6) (date, sid) 정렬 후 마지막에 slicePage 1회.
  const merged = [...byKey.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.sid.localeCompare(b.sid))
    .map((row): UnsubmittedAttendanceRow => {
      const { _dedupeKey: _unused, ...rest } = row;
      void _unused;
      return rest;
    });
  return slicePage(merged, opts);
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
