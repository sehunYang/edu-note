import { and, asc, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  attendanceRecords,
  reportTracking,
} from "../schema/attendance";
import { studentYears } from "../schema/identity";
import { isReportRequired } from "@/lib/domain/attendance-rules";
import type { AttendanceReason, AttendanceKind } from "@/lib/domain/types";

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
