import { and, asc, desc, eq, gt, gte, inArray, lt, lte, ne, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  attendanceRecords,
  fieldTripReports,
  reportTracking,
} from "../schema/attendance";
import { studentYears } from "../schema/identity";
import { homeroomMembers } from "../schema/classes";
import { schoolDayCalendar } from "../schema/misc";
import { isReportRequired } from "@/lib/domain/attendance-rules";
import {
  collapseAbsenceGroups,
  groupAnchor,
  isJoinableAbsence,
} from "@/lib/domain/attendance-group";
import {
  absentPeriods,
  submissionTier,
  type SubmissionTier,
} from "@/lib/domain/attendance";
import {
  buildAttendanceTally,
  type StudentTally,
} from "@/lib/domain/attendance-tally";
import type {
  AttendanceReason,
  AttendanceKind,
} from "@/lib/domain/types";
import { applyPaging } from "../pagination";
import { listHomeroomStudents } from "./observations";
import { writeAudit } from "./audit";
import {
  ATTENDANCE_REPORT_DEADLINE_SCHOOL_DAYS,
  FIELD_TRIP_POST_REPORT_DEADLINE_SCHOOL_DAYS,
  nthSchoolDayAfter,
} from "./escalation";

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
  /**
   * 바로 앞·뒤 수업일의 같은 사유 미제출 결석과 서류를 묶는다(결석일 때만). 기본 끔 —
   * 입력 화면이 교사의 선택을 넘긴다.
   */
  joinAdjacent?: boolean;
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
  /** 이 출결을 만든 교외체험(0064). null=수동 입력. */
  fieldTripId: string | null;
  /** 결석 기간 입력 묶음(0066). 같은 묶음은 서류 1건·마감은 마지막 날 기준. null=하루 입력. */
  absenceGroupId: string | null;
}

/**
 * 기본 교시 목록 = [조회(0), 1..7].
 * AC-7.2의 컴시간 기반 일별 교시 수는 US-B13(시간표 연동)에서 주입된다.
 * 그 전까지는 7을 안전한 상한으로 사용한다.
 */
export const DEFAULT_PERIOD_LIST = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * 학생 소유권 검증(심층 방어). 액션 계층의 담임반 가드(isOwnerHomeroomStudent)와
 * 별개로, 쓰기 진입점(upsertAttendance/addFieldTrip/addAbsenceRange)에서
 * studentYearId 가 이 owner 의 학생인지 쿼리 계층 자체가 강제한다 — 향후 새 호출자가
 * 가드를 빠뜨려도 교차 owner 기록 생성이 불가능하다.
 */
async function assertStudentOwner(
  db: DB,
  ownerId: string,
  studentYearId: string,
): Promise<void> {
  const rows = await db
    .select({ id: studentYears.id })
    .from(studentYears)
    .where(
      and(eq(studentYears.id, studentYearId), eq(studentYears.ownerId, ownerId)),
    )
    .limit(1);
  if (rows.length === 0) throw new Error("학생을 찾을 수 없습니다.");
}

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
 * 결석 기간 묶음(0066)의 신고서 추적을 정리한다. 묶음은 서류 1건이라 추적행도 1개 —
 * 서류가 필요한 행 중 가장 늦은 날짜의 행(앵커)에만 둔다. 추적행의 출결 날짜가 곧 마감
 * 기준일이므로(recomputeEscalation·pg_cron 모두) 마감이 기간의 마지막 날을 따른다.
 * 묶음의 행을 수정·삭제해 앵커가 바뀌면 추적행도 새 앵커로 옮긴다.
 */
async function syncGroupTracking(
  db: DB,
  ownerId: string,
  absenceGroupId: string,
): Promise<void> {
  const rows = await db
    .select({
      id: attendanceRecords.id,
      date: attendanceRecords.date,
      reportRequired: attendanceRecords.reportRequired,
    })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.ownerId, ownerId),
        eq(attendanceRecords.absenceGroupId, absenceGroupId),
      ),
    );
  const anchor = groupAnchor(rows);
  const otherIds = rows.filter((r) => r.id !== anchor?.id).map((r) => r.id);
  if (otherIds.length > 0) {
    await db
      .delete(reportTracking)
      .where(
        and(
          eq(reportTracking.ownerId, ownerId),
          inArray(reportTracking.attendanceRecordId, otherIds),
        ),
      );
  }
  if (anchor) await syncTracking(db, ownerId, anchor.id, true);
}

/** 출결 1행의 추적 동기화 — 묶음 소속이면 묶음 단위로, 아니면 행 단위로. */
async function syncRecordTracking(
  db: DB,
  ownerId: string,
  recordId: string,
  required: boolean,
  absenceGroupId: string | null,
): Promise<void> {
  if (absenceGroupId) await syncGroupTracking(db, ownerId, absenceGroupId);
  else await syncTracking(db, ownerId, recordId, required);
}

/**
 * 출결 기록 upsert(같은 학생·날짜·성격이면 갱신). reportRequired 파생 저장 +
 * report_tracking 동기화. 생성/갱신된 행 반환.
 */
export async function upsertAttendance(
  db: DB,
  ownerId: string,
  input: UpsertAttendanceInput,
): Promise<AttendanceRow & { joined: AbsenceJoinResult | null }> {
  await assertStudentOwner(db, ownerId, input.studentYearId);
  // 같은 키의 기존 행이 교외체험 소속이면 갱신 후에도 소속이 유지된다(아래 set 에 없음)
  // — 그 행의 서류는 계속 사후보고서가 맡으므로 판정에 소속을 넘긴다.
  // 묶음(0066) 소속도 갱신 후 유지된다 — 추적은 묶음 단위로 다시 맞춘다.
  const [existing] = await db
    .select({
      fieldTripId: attendanceRecords.fieldTripId,
      absenceGroupId: attendanceRecords.absenceGroupId,
    })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.ownerId, ownerId),
        eq(attendanceRecords.studentYearId, input.studentYearId),
        eq(attendanceRecords.date, input.date),
        eq(attendanceRecords.kind, input.kind),
      ),
    )
    .limit(1);
  const reportRequired = isReportRequired({
    kind: input.kind,
    reason: input.reason,
    noteField: input.noteField,
    fieldTripId: existing?.fieldTripId,
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

  await syncRecordTracking(db, ownerId, row.id, reportRequired, row.absenceGroupId);
  const joined =
    input.joinAdjacent && row.kind === "absent"
      ? await joinAdjacentAbsences(db, ownerId, row.id)
      : null;
  return {
    ...toRow(row),
    ...(joined ? { absenceGroupId: joined.absenceGroupId } : {}),
    joined,
  };
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
    fieldTripId: r.fieldTripId,
    absenceGroupId: r.absenceGroupId,
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
  /** 이 출결을 만든 교외체험(0064). 결석 기간 입력 등 수동 경로는 null. */
  fieldTripId: string | null = null,
  /** 결석 기간 묶음(0066). 주면 새로 만든 행이 서류 1건·마지막 날 마감을 공유한다. */
  absenceGroupId: string | null = null,
): Promise<number> {
  const days = await schoolDaysInRange(db, ownerId, start, end);
  const reportRequired = isReportRequired({
    kind: "absent",
    reason,
    noteField,
    fieldTripId,
  });
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
        fieldTripId,
        absenceGroupId,
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
      // 묶음은 행마다가 아니라 다 만든 뒤 한 번에 — 추적행은 마지막 날 1개뿐이다.
      if (!absenceGroupId) await syncTracking(db, ownerId, row.id, reportRequired);
      created += 1;
    }
  }
  if (absenceGroupId) await syncGroupTracking(db, ownerId, absenceGroupId);
  return created;
}

/**
 * 교외체험학습 추가(AC-4.2). 사후보고서 추적 행 + 기간 내 수업일마다 인정결석
 * 출결 자동 생성. endDate null=당일. trip_date=start_date 미러, 마감 기준=end_date.
 * 체험이 만든 인정결석은 날짜별 신고서 불필요(사후보고서가 곧 보고) — report_required=false.
 */
export async function addFieldTrip(
  db: DB,
  ownerId: string,
  studentYearId: string,
  startDate: string,
  endDate?: string | null,
): Promise<{ id: string; createdRecords: number }> {
  await assertStudentOwner(db, ownerId, studentYearId);
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
    FIELD_TRIP_NOTE, // QC v6 ③ — 비고란에 '체험학습' 자동 기입(정리 용이). reason='accepted' 유지.
    trip.id, // 소속 체험(0064) — 수정·삭제가 이 FK 로 자기 출결을 찾는다.
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
 * 교외체험 자동 생성 출결의 비고 문구 — 표시용. 소속은 attendance_records.field_trip_id
 * 가 가리키며(0064), 수정·삭제는 그 FK 로만 자기 출결을 찾는다(비고는 교사가 똑같이
 * 적을 수 있어 연결로 쓰지 않는다).
 */
export const FIELD_TRIP_NOTE = "체험학습";

async function getFieldTrip(db: DB, ownerId: string, id: string) {
  const [trip] = await db
    .select({
      id: fieldTripReports.id,
      studentYearId: fieldTripReports.studentYearId,
      tripDate: fieldTripReports.tripDate,
      startDate: fieldTripReports.startDate,
      endDate: fieldTripReports.endDate,
    })
    .from(fieldTripReports)
    .where(and(eq(fieldTripReports.id, id), eq(fieldTripReports.ownerId, ownerId)))
    .limit(1);
  return trip ?? null;
}

/**
 * [start,end] 와 겹치는 같은 학생의 다른 체험들이 빠진 날을 다시 채운다.
 * 체험 두 건이 날짜를 겹치면 그 날의 결석 행은 먼저 만든 쪽 하나뿐이라, 그쪽을
 * 지우거나 줄이면 나중 체험에 구멍이 생긴다 — 그 구멍을 여기서 메운다.
 */
async function refillOverlappingTrips(
  db: DB,
  ownerId: string,
  studentYearId: string,
  start: string,
  end: string,
  excludeId: string,
): Promise<void> {
  const others = await db
    .select({
      id: fieldTripReports.id,
      tripDate: fieldTripReports.tripDate,
      startDate: fieldTripReports.startDate,
      endDate: fieldTripReports.endDate,
    })
    .from(fieldTripReports)
    .where(
      and(
        eq(fieldTripReports.ownerId, ownerId),
        eq(fieldTripReports.studentYearId, studentYearId),
        ne(fieldTripReports.id, excludeId),
        lte(sql`coalesce(${fieldTripReports.startDate}, ${fieldTripReports.tripDate})`, end),
        gte(sql`coalesce(${fieldTripReports.endDate}, ${fieldTripReports.tripDate})`, start),
      ),
    );
  for (const t of others) {
    await createAbsenceRangeRecords(
      db,
      ownerId,
      studentYearId,
      t.startDate ?? t.tripDate,
      t.endDate ?? t.tripDate,
      "accepted",
      FIELD_TRIP_NOTE,
      t.id,
    );
  }
}

export interface FieldTripUpdate {
  studentYearId: string;
  startDate: string;
  /** null/생략 = 당일. */
  endDate?: string | null;
}

/**
 * 교외체험학습 수정(학생·기간). 이 체험이 만든 출결 중 새 기간 밖(또는 학생이 바뀐)
 * 행만 지우고 새 기간의 빠진 날만 채운다 — 남는 날의 행은 그대로라 교사가 손본
 * 교시·제출 표시가 살아남는다. 수동 입력(field_trip_id null)은 건드리지 않고, 새
 * 기간에 이미 수동 행이 있으면 보존한다(createAbsenceRangeRecords 의 onConflictDoNothing).
 * 한 트랜잭션 — 중간에 실패하면 옛 출결도 그대로다. 없거나 남의 것이면 null.
 */
export async function updateFieldTrip(
  db: DB,
  ownerId: string,
  id: string,
  input: FieldTripUpdate,
): Promise<{ deletedRecords: number; createdRecords: number } | null> {
  await assertStudentOwner(db, ownerId, input.studentYearId);
  return db.transaction(async (tx) => {
    const prev = await getFieldTrip(tx, ownerId, id);
    if (!prev) return null;
    const end = input.endDate ?? input.startDate;
    const prevStart = prev.startDate ?? prev.tripDate;
    const prevEnd = prev.endDate ?? prev.tripDate;

    const removed = await tx
      .delete(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.ownerId, ownerId),
          eq(attendanceRecords.fieldTripId, id),
          or(
            ne(attendanceRecords.studentYearId, input.studentYearId),
            lt(attendanceRecords.date, input.startDate),
            gt(attendanceRecords.date, end),
          ),
        ),
      )
      .returning({ id: attendanceRecords.id });
    await tx
      .update(fieldTripReports)
      .set({
        studentYearId: input.studentYearId,
        tripDate: input.startDate, // start_date 미러(0031 불변식)
        startDate: input.startDate,
        endDate: end,
        updatedAt: new Date(),
      })
      .where(and(eq(fieldTripReports.id, id), eq(fieldTripReports.ownerId, ownerId)));
    const createdRecords = await createAbsenceRangeRecords(
      tx,
      ownerId,
      input.studentYearId,
      input.startDate,
      end,
      "accepted",
      FIELD_TRIP_NOTE,
      id,
    );
    await refillOverlappingTrips(tx, ownerId, prev.studentYearId, prevStart, prevEnd, id);

    await writeAudit(tx, ownerId, "field_trip_update", id, {
      from: { studentYearId: prev.studentYearId, startDate: prevStart, endDate: prevEnd },
      to: { studentYearId: input.studentYearId, startDate: input.startDate, endDate: end },
      deletedRecords: removed.length,
      createdRecords,
    });
    return { deletedRecords: removed.length, createdRecords };
  });
}

/**
 * 교외체험학습 삭제. 이 체험이 만든 출결(field_trip_id)과 추적행(report_tracking)은
 * FK cascade 로 함께 사라진다. 수동 입력은 남는다. 한 트랜잭션. 없거나 남의 것이면 null.
 */
export async function deleteFieldTrip(
  db: DB,
  ownerId: string,
  id: string,
): Promise<{ deletedRecords: number } | null> {
  return db.transaction(async (tx) => {
    const prev = await getFieldTrip(tx, ownerId, id);
    if (!prev) return null;
    const linked = await tx
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.ownerId, ownerId), eq(attendanceRecords.fieldTripId, id)));
    await tx
      .delete(fieldTripReports)
      .where(and(eq(fieldTripReports.id, id), eq(fieldTripReports.ownerId, ownerId)));
    await refillOverlappingTrips(
      tx,
      ownerId,
      prev.studentYearId,
      prev.startDate ?? prev.tripDate,
      prev.endDate ?? prev.tripDate,
      id,
    );
    await writeAudit(tx, ownerId, "field_trip_delete", id, {
      studentYearId: prev.studentYearId,
      startDate: prev.startDate ?? prev.tripDate,
      endDate: prev.endDate ?? prev.tripDate,
      deletedRecords: linked.length,
    });
    return { deletedRecords: linked.length };
  });
}

/**
 * 결석 기간 입력(AC-4.4). [start,end] 의 수업일마다 결석 출결 자동 생성(멱등).
 * reason 은 호출자 지정(예: illness). 생성 건수 반환.
 * 새로 만든 행은 한 묶음(0066)이다 — 교외체험처럼 서류는 1건이고 마감은 기간의
 * 마지막 날 기준. 이미 있던 같은 날의 행(수동 입력)은 묶음에 들지 않고 그대로 둔다.
 */
export async function addAbsenceRange(
  db: DB,
  ownerId: string,
  studentYearId: string,
  startDate: string,
  endDate: string,
  reason: AttendanceReason,
  noteField?: string | null,
  opts?: { joinAdjacent?: boolean },
): Promise<{
  createdRecords: number;
  absenceGroupId: string | null;
  joined: AbsenceJoinResult | null;
}> {
  await assertStudentOwner(db, ownerId, studentYearId);
  let absenceGroupId: string | null = randomUUID();
  const createdRecords = await createAbsenceRangeRecords(
    db,
    ownerId,
    studentYearId,
    startDate,
    endDate,
    reason,
    noteField ?? null,
    null,
    absenceGroupId,
  );
  await writeAudit(db, ownerId, "attendance_record", null, {
    studentYearId,
    startDate,
    endDate,
    reason,
    createdRecords,
    absenceGroupId: createdRecords > 0 ? absenceGroupId : null,
  });
  if (createdRecords === 0) return { createdRecords, absenceGroupId: null, joined: null };
  let joined: AbsenceJoinResult | null = null;
  if (opts?.joinAdjacent) {
    const [seed] = await db
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.ownerId, ownerId),
          eq(attendanceRecords.absenceGroupId, absenceGroupId),
        ),
      )
      .limit(1);
    if (seed) joined = await joinAdjacentAbsences(db, ownerId, seed.id);
    if (joined) absenceGroupId = joined.absenceGroupId;
  }
  return { createdRecords, absenceGroupId, joined };
}

export interface AbsenceJoinResult {
  /** 합쳐진 묶음 id. */
  absenceGroupId: string;
  /** 묶음의 첫날·마지막 날(서류 1건이 다루는 기간). */
  firstDate: string;
  lastDate: string;
  /** 마지막 날 기준 서류 마감(수업일 5일). 캘린더가 거기까지 없으면 null. */
  deadlineDate: string | null;
  /** 이번에 새로 이어 붙인 앞·뒤 날짜(정렬). */
  joinedDates: string[];
}

/**
 * 따로 입력한 연속 결석을 서류 1건으로 묶는다 (0066 후속).
 *
 * 예: 어제 '몸살 감기' 질병결석을 입력했고 오늘도 같은 사유로 결석 — 결석계는 두 장이
 * 아니라 한 장(기간 어제~오늘)이고 마감은 오늘 기준이어야 한다.
 *
 * seed 출결(이미 묶음이면 그 묶음 전체)의 바로 앞 수업일·바로 뒤 수업일에 있는 같은
 * 학생 결석 중 isJoinableAbsence 를 만족하는 것을 찾아, 그 결석(묶음이면 묶음 전체)과
 * seed 를 한 묶음으로 합친다. 한 단계만 본다 — 이웃이 이미 묶음이면 그 묶음이 통째로
 * 들어오므로 연속 입력은 저절로 이어진다. 합칠 게 없으면 아무것도 바꾸지 않고 null.
 * 추적행은 합친 묶음의 마지막 날로 옮겨져 마감이 그 날을 따른다(syncGroupTracking).
 */
export async function joinAdjacentAbsences(
  db: DB,
  ownerId: string,
  seedRecordId: string,
): Promise<AbsenceJoinResult | null> {
  const cols = {
    id: attendanceRecords.id,
    studentYearId: attendanceRecords.studentYearId,
    date: attendanceRecords.date,
    kind: attendanceRecords.kind,
    reason: attendanceRecords.reason,
    reportRequired: attendanceRecords.reportRequired,
    reportSubmitted: attendanceRecords.reportSubmitted,
    fieldTripId: attendanceRecords.fieldTripId,
    absenceGroupId: attendanceRecords.absenceGroupId,
  } as const;
  const [seed] = await db
    .select(cols)
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.id, seedRecordId), eq(attendanceRecords.ownerId, ownerId)))
    .limit(1);
  if (!seed) return null;
  // seed 자체가 묶을 수 있는 결석이 아니면(제출됨·서류 불필요·체험 등) 손대지 않는다.
  if (!isJoinableAbsence(seed, seed)) return null;

  const seedRows = seed.absenceGroupId
    ? await db
        .select(cols)
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.ownerId, ownerId),
            eq(attendanceRecords.absenceGroupId, seed.absenceGroupId),
          ),
        )
    : [seed];
  const seedFirst = seedRows.reduce((m, r) => (r.date < m ? r.date : m), seed.date);
  const seedLast = seedRows.reduce((m, r) => (r.date > m ? r.date : m), seed.date);

  // 바로 앞·뒤 수업일(주말·공휴일 건너뜀). 이웃 수업일 하나씩만 필요하므로 그 둘레만 읽는다.
  const [prevRow] = await db
    .select({ date: schoolDayCalendar.date })
    .from(schoolDayCalendar)
    .where(
      and(
        eq(schoolDayCalendar.ownerId, ownerId),
        eq(schoolDayCalendar.isSchoolDay, true),
        lt(schoolDayCalendar.date, seedFirst),
      ),
    )
    .orderBy(desc(schoolDayCalendar.date))
    .limit(1);
  const after = await db
    .select({ date: schoolDayCalendar.date })
    .from(schoolDayCalendar)
    .where(
      and(
        eq(schoolDayCalendar.ownerId, ownerId),
        eq(schoolDayCalendar.isSchoolDay, true),
        gt(schoolDayCalendar.date, seedLast),
      ),
    )
    .orderBy(asc(schoolDayCalendar.date))
    .limit(ATTENDANCE_REPORT_DEADLINE_SCHOOL_DAYS + 1);
  const neighborDays = [prevRow?.date, after[0]?.date].filter(
    (d): d is string => !!d,
  );
  if (neighborDays.length === 0) return null;

  const neighbors = (
    await db
      .select(cols)
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.ownerId, ownerId),
          eq(attendanceRecords.studentYearId, seed.studentYearId),
          eq(attendanceRecords.kind, "absent"),
          inArray(attendanceRecords.date, neighborDays),
        ),
      )
  ).filter((r) => isJoinableAbsence(seed, r));
  if (neighbors.length === 0) return null;

  // 이웃이 묶음이면 묶음 전체를 데려온다. 묶음 id 는 seed 것을 우선 재사용한다.
  const neighborGroupIds = [
    ...new Set(neighbors.map((n) => n.absenceGroupId).filter((g): g is string => !!g)),
  ];
  const neighborGroupRows =
    neighborGroupIds.length > 0
      ? await db
          .select(cols)
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.ownerId, ownerId),
              inArray(attendanceRecords.absenceGroupId, neighborGroupIds),
            ),
          )
      : [];
  const target = seed.absenceGroupId ?? neighborGroupIds[0] ?? randomUUID();
  const all = new Map<string, { id: string; date: string }>();
  for (const r of [...seedRows, ...neighbors, ...neighborGroupRows]) all.set(r.id, r);
  const seedIds = new Set(seedRows.map((r) => r.id));

  await db
    .update(attendanceRecords)
    .set({ absenceGroupId: target, updatedAt: new Date() })
    .where(
      and(
        eq(attendanceRecords.ownerId, ownerId),
        inArray(attendanceRecords.id, [...all.keys()]),
      ),
    );
  await syncGroupTracking(db, ownerId, target);

  const dates = [...all.values()].map((r) => r.date).sort();
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const joinedDates = [...all.values()]
    .filter((r) => !seedIds.has(r.id))
    .map((r) => r.date)
    .sort();
  // 마감 = 마지막 날 이후 5번째 수업일. 마지막 날이 seed 뒤쪽 이웃 묶음이면 다시 읽는다.
  const deadlineBase = lastDate;
  const deadlineRows =
    deadlineBase === seedLast
      ? after
      : await db
          .select({ date: schoolDayCalendar.date })
          .from(schoolDayCalendar)
          .where(
            and(
              eq(schoolDayCalendar.ownerId, ownerId),
              eq(schoolDayCalendar.isSchoolDay, true),
              gt(schoolDayCalendar.date, deadlineBase),
            ),
          )
          .orderBy(asc(schoolDayCalendar.date))
          .limit(ATTENDANCE_REPORT_DEADLINE_SCHOOL_DAYS);
  const deadlineDate = nthSchoolDayAfter(
    deadlineRows.map((r) => r.date),
    deadlineBase,
    ATTENDANCE_REPORT_DEADLINE_SCHOOL_DAYS,
  );

  await writeAudit(db, ownerId, "attendance_absence_join", target, {
    studentYearId: seed.studentYearId,
    seedRecordId,
    firstDate,
    lastDate,
    joinedDates,
  });
  return { absenceGroupId: target, firstDate, lastDate, deadlineDate, joinedDates };
}

export interface AbsenceJoinCandidate {
  studentYearId: string;
  /** 이웃 결석 날짜(묶음이면 그 묶음의 첫날~마지막 날). */
  firstDate: string;
  lastDate: string;
  reason: AttendanceReason;
  /** 입력 날짜 기준 위치 — prev=바로 앞 수업일, next=바로 뒤 수업일. */
  side: "prev" | "next";
}

/**
 * 입력 화면 미리보기용 — date 바로 앞·뒤 수업일에 있는, 묶을 수 있는 결석.
 * 교사가 학생·사유를 고르면 "11-13 질병결석과 서류 1건으로 묶기"를 보여 주는 데 쓴다.
 * 실제 묶기 판단은 저장할 때 joinAdjacentAbsences 가 다시 한다(이건 안내일 뿐).
 */
export async function listAbsenceJoinCandidates(
  db: DB,
  ownerId: string,
  date: string,
): Promise<AbsenceJoinCandidate[]> {
  const [prevRow] = await db
    .select({ date: schoolDayCalendar.date })
    .from(schoolDayCalendar)
    .where(
      and(
        eq(schoolDayCalendar.ownerId, ownerId),
        eq(schoolDayCalendar.isSchoolDay, true),
        lt(schoolDayCalendar.date, date),
      ),
    )
    .orderBy(desc(schoolDayCalendar.date))
    .limit(1);
  const [nextRow] = await db
    .select({ date: schoolDayCalendar.date })
    .from(schoolDayCalendar)
    .where(
      and(
        eq(schoolDayCalendar.ownerId, ownerId),
        eq(schoolDayCalendar.isSchoolDay, true),
        gt(schoolDayCalendar.date, date),
      ),
    )
    .orderBy(asc(schoolDayCalendar.date))
    .limit(1);
  const days = [prevRow?.date, nextRow?.date].filter((d): d is string => !!d);
  if (days.length === 0) return [];

  const rows = (
    await db
      .select({
        id: attendanceRecords.id,
        studentYearId: attendanceRecords.studentYearId,
        date: attendanceRecords.date,
        kind: attendanceRecords.kind,
        reason: attendanceRecords.reason,
        reportRequired: attendanceRecords.reportRequired,
        reportSubmitted: attendanceRecords.reportSubmitted,
        fieldTripId: attendanceRecords.fieldTripId,
        absenceGroupId: attendanceRecords.absenceGroupId,
      })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.ownerId, ownerId),
          eq(attendanceRecords.kind, "absent"),
          inArray(attendanceRecords.date, days),
        ),
      )
  ).filter((r) => isJoinableAbsence(r, r));

  // 묶음이면 기간 전체를 보여 준다("11-10~11-13 질병결석과 묶기").
  const groupIds = [
    ...new Set(rows.map((r) => r.absenceGroupId).filter((g): g is string => !!g)),
  ];
  const span = new Map<string, { first: string; last: string }>();
  if (groupIds.length > 0) {
    const gs = await db
      .select({
        g: attendanceRecords.absenceGroupId,
        first: sql<string>`min(${attendanceRecords.date})::text`,
        last: sql<string>`max(${attendanceRecords.date})::text`,
      })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.ownerId, ownerId),
          inArray(attendanceRecords.absenceGroupId, groupIds),
        ),
      )
      .groupBy(attendanceRecords.absenceGroupId);
    for (const g of gs) if (g.g) span.set(g.g, { first: g.first, last: g.last });
  }
  return rows.map((r) => {
    const sp = r.absenceGroupId ? span.get(r.absenceGroupId) : undefined;
    return {
      studentYearId: r.studentYearId,
      firstDate: sp?.first ?? r.date,
      lastDate: sp?.last ?? r.date,
      reason: r.reason as AttendanceReason,
      side: r.date < date ? ("prev" as const) : ("next" as const),
    };
  });
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
  const [existing] = await db
    .select({
      fieldTripId: attendanceRecords.fieldTripId,
      absenceGroupId: attendanceRecords.absenceGroupId,
    })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.id, recordId),
        eq(attendanceRecords.ownerId, ownerId),
      ),
    )
    .limit(1);
  if (!existing) return null;
  const reportRequired = isReportRequired({
    kind: input.kind,
    reason: input.reason,
    noteField: input.noteField,
    fieldTripId: existing.fieldTripId,
  });
  const [row] = await db
    .update(attendanceRecords)
    .set({
      reason: input.reason,
      kind: input.kind,
      noteField: input.noteField ?? null,
      reportRequired,
      // periods 미지정이면 기존 값 보존 — 예전엔 무조건 null 로 덮어써서
      // 인라인 수정 한 번에 교시 기록이 통째로 사라졌다.
      ...(input.periods !== undefined ? { periods: input.periods } : {}),
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
  await syncRecordTracking(db, ownerId, row.id, reportRequired, existing.absenceGroupId);
  await writeAudit(db, ownerId, "attendance_update", row.id, {
    reason: input.reason,
    kind: input.kind,
    reportRequired,
  });
  return toRow(row);
}

/**
 * 신고서 제출 여부 마킹. 결석 기간 묶음(0066)의 행이면 서류가 1건이므로 묶음 전체를
 * 함께 바꾼다 — 기간 중 어느 날에서 눌러도 같은 결과다.
 */
export async function setReportSubmitted(
  db: DB,
  ownerId: string,
  attendanceRecordId: string,
  submitted: boolean,
): Promise<void> {
  const [rec] = await db
    .select({ absenceGroupId: attendanceRecords.absenceGroupId })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.id, attendanceRecordId),
        eq(attendanceRecords.ownerId, ownerId),
      ),
    )
    .limit(1);
  if (!rec) return;
  await db
    .update(attendanceRecords)
    .set({ reportSubmitted: submitted, updatedAt: new Date() })
    .where(
      and(
        eq(attendanceRecords.ownerId, ownerId),
        rec.absenceGroupId
          ? eq(attendanceRecords.absenceGroupId, rec.absenceGroupId)
          : eq(attendanceRecords.id, attendanceRecordId),
      ),
    );
}

/**
 * 출결 기록 삭제(연결된 tracking 은 FK cascade). 결석 기간 묶음(0066)의 마지막 날을
 * 지우면 추적행도 함께 사라지므로, 남은 날 중 마지막 날로 추적을 옮긴다(마감도 당겨진다).
 */
export async function deleteAttendance(
  db: DB,
  ownerId: string,
  id: string,
): Promise<void> {
  const [removed] = await db
    .delete(attendanceRecords)
    .where(and(eq(attendanceRecords.id, id), eq(attendanceRecords.ownerId, ownerId)))
    .returning({ absenceGroupId: attendanceRecords.absenceGroupId });
  if (removed?.absenceGroupId) {
    await syncGroupTracking(db, ownerId, removed.absenceGroupId);
  }
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
      fieldTripId: attendanceRecords.fieldTripId,
      absenceGroupId: attendanceRecords.absenceGroupId,
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
    fieldTripId: r.fieldTripId,
    absenceGroupId: r.absenceGroupId,
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

/**
 * 서버액션 담임반 가드용 — 이 학생이 소유자의 담임반 멤버인지(연도 무관) 검사한다.
 * 서버액션은 임의 studentYearId를 받을 수 있으므로(신뢰 경계), 저장 전 이 술어로
 * "내 담임반 학생"임을 강제한다. 연도 무관(homeroom_members는 owner 스코프)이라
 * 학년도 경계(3월~다음해 2월) 날짜에서도 정상 저장을 막지 않는다.
 */
export async function isOwnerHomeroomStudent(
  db: DB,
  ownerId: string,
  studentYearId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: homeroomMembers.id })
    .from(homeroomMembers)
    .where(
      and(
        eq(homeroomMembers.ownerId, ownerId),
        eq(homeroomMembers.studentYearId, studentYearId),
      ),
    )
    .limit(1);
  return rows.length > 0;
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
  fieldTripId: string | null;
  absenceGroupId: string | null;
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
    fieldTripId: r.fieldTripId,
    absenceGroupId: r.absenceGroupId,
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
  fieldTripId: attendanceRecords.fieldTripId,
  absenceGroupId: attendanceRecords.absenceGroupId,
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
  reason?: AttendanceReason,
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
        // QC v6 ③ — 사유 기준 검색(미지정이면 전체).
        reason ? eq(attendanceRecords.reason, reason) : undefined,
      ),
    )
    .orderBy(asc(attendanceRecords.date), asc(studentYears.sid));
  const filtered = rows.filter((r) => ids.has(r.studentYearId)).map(toStudentRow);
  return slicePage(filtered, opts);
}

/** (b) 학생별 검색 — 담임 학생 1명의 출결 기록(최신순). QC v6 ③: 사유 필터 옵션. */
export async function searchAttendanceByStudent(
  db: DB,
  ownerId: string,
  year: number,
  studentYearId: string,
  reason?: AttendanceReason,
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
        reason ? eq(attendanceRecords.reason, reason) : undefined,
      ),
    )
    .orderBy(desc(attendanceRecords.date))
    .$dynamic();
  const rows = await applyPaging(q, opts);
  return rows.map(toStudentRow);
}

export type UnsubmittedAttendanceRow = AttendanceStudentRow & {
  /**
   * 기간 서류의 마지막 날 — 결석 기간 묶음(0066)·다일 교외체험. 하루짜리면 null.
   * date 는 첫날이고, 마감은 이 날(없으면 date) 기준이다.
   */
  endDate: string | null;
  deadlineDate: string | null;
  remainingSchoolDays: number | null;
  tier: SubmissionTier;
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

  // (1) attendance 소스 — 신고서 필요·미제출 출결 + 추적행(dedupe 용 추적 id).
  const attRows = await db
    .select({
      ...STUDENT_ROW_COLUMNS,
      reportTrackingId: reportTracking.id,
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
      endDate: fieldTripReports.endDate,
      sid: studentYears.sid,
      name: studentYears.name,
      reportTrackingId: reportTracking.id,
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

  // 마감일은 추적 스냅샷(report_tracking.deadline_date)이 아니라 여기서 직접
  // 계산한다 — 스냅샷은 일일 재계산(recomputeEscalation/pg_cron)이 채우는
  // 값이라 그 전엔 null 이고, null 을 남은 0일로 취급하면 방금 입력한 기록까지
  // 전부 심각으로 오판정됐다(실측 버그). 기준일=결석일(출결)/종료일(교외체험),
  // 마감=기준일 이후 수업일 5일(출결)/10일(교외체험).
  const deadlineFor = (base: string, days: number) =>
    nthSchoolDayAfter(sortedSchoolDays, base, days);

  // 제출불가(expired)는 결석계에만 적용 — 결석계는 5수업일을 넘기면 미인정 전환
  // 대상이라 제출이 무의미하지만, 교외체험 사후보고서(마감 10수업일)는 늦어도
  // 받기는 하므로 마감 경과 시 심각으로 캡한다. 마감을 알 수 없으면(캘린더가
  // 그 날짜까지 없음 = 마감이 알려진 지평선 밖) 정상으로 둔다.
  const tierFor = (
    deadline: string | null,
    source: "attendance" | "fieldTrip",
  ): { remaining: number | null; tier: SubmissionTier } => {
    if (deadline == null) return { remaining: null, tier: "normal" };
    const remaining = remainingSchoolDays(sortedSchoolDays, today, deadline);
    let tier = submissionTier(remaining);
    if (tier === "expired" && source === "fieldTrip") tier = "critical";
    return { remaining, tier };
  };

  // (4) 양쪽 homeroom 필터 + tier 계산 → UnsubmittedAttendanceRow + dedupe 키.
  type Merged = UnsubmittedAttendanceRow & { _dedupeKey: string };

  // 결석 기간 묶음(0066)은 서류 1건 — 묶음의 미제출 행들을 한 줄로 접는다.
  // 대표 행 = 첫날(날짜·제출 처리 id), 마감 기준 = 마지막 날.
  const attGroups = collapseAbsenceGroups(
    attRows.filter((r) => ids.has(r.studentYearId)),
  );
  const attMapped: Merged[] = attGroups.map(({ first: r, lastDate }) => {
    const deadline = deadlineFor(lastDate, ATTENDANCE_REPORT_DEADLINE_SCHOOL_DAYS);
    const { remaining, tier } = tierFor(deadline, "attendance");
    return {
      ...toStudentRow(r),
      endDate: lastDate !== r.date ? lastDate : null,
      deadlineDate: deadline,
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
      const deadline = deadlineFor(
        r.endDate ?? r.startDate ?? r.tripDate,
        FIELD_TRIP_POST_REPORT_DEADLINE_SCHOOL_DAYS,
      );
      const { remaining, tier } = tierFor(deadline, "fieldTrip");
      const date = r.startDate ?? r.tripDate;
      const end = r.endDate ?? date;
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
        fieldTripId: r.id,
        absenceGroupId: null,
        sid: r.sid,
        name: r.name,
        endDate: end !== date ? end : null,
        deadlineDate: deadline,
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

// ── NEIS 출결 집계 (연간시나리오 기능갭 #1) ──

export interface AttendanceTallyResult {
  /** 명단 순서(학번순) 그대로. 기록 0인 학생도 포함. */
  rows: StudentTally[];
  /** 기간 내 수업일수(school_day_calendar 기준). */
  schoolDays: number;
  from: string;
  to: string;
}

/**
 * 담임반 전원의 기간 출결을 NEIS 출결상황 격자로 집계한다.
 *
 * 담임은 월 단위로 출결을 마감하므로 기간은 호출 측이 정한다(월/학기/학년도).
 * 수업일수는 school_day_calendar 를 단일 진실원으로 쓴다 — NEIS 동기화가 안 돼
 * 있으면 0 이 나오는데, 그건 틀린 값이 아니라 "아직 학사일정을 안 받았다"는
 * 사실이므로 화면에서 그대로 안내한다(임의 추정 금지).
 *
 * 집계 규칙(결과=교시 수 등)은 도메인 buildAttendanceTally 에 있다.
 */
export async function getAttendanceTally(
  db: DB,
  ownerId: string,
  year: number,
  from: string,
  to: string,
): Promise<AttendanceTallyResult> {
  const [students, records, schoolDayRows] = await Promise.all([
    listHomeroomStudents(db, ownerId, year),
    db
      .select({
        studentYearId: attendanceRecords.studentYearId,
        kind: attendanceRecords.kind,
        reason: attendanceRecords.reason,
        periods: attendanceRecords.periods,
        reportRequired: attendanceRecords.reportRequired,
        reportSubmitted: attendanceRecords.reportSubmitted,
        absenceGroupId: attendanceRecords.absenceGroupId,
      })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.ownerId, ownerId),
          gte(attendanceRecords.date, from),
          lte(attendanceRecords.date, to),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schoolDayCalendar)
      .where(
        and(
          eq(schoolDayCalendar.ownerId, ownerId),
          eq(schoolDayCalendar.isSchoolDay, true),
          gte(schoolDayCalendar.date, from),
          lte(schoolDayCalendar.date, to),
        ),
      ),
  ]);

  const rows = buildAttendanceTally(
    students.map((s) => ({ studentYearId: s.id, sid: s.sid, name: s.name })),
    records.map((r) => ({
      studentYearId: r.studentYearId,
      kind: r.kind as AttendanceKind,
      reason: r.reason as AttendanceReason,
      periods: r.periods,
      reportRequired: r.reportRequired,
      reportSubmitted: r.reportSubmitted,
      absenceGroupId: r.absenceGroupId,
    })),
  );

  return { rows, schoolDays: schoolDayRows[0]?.n ?? 0, from, to };
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
