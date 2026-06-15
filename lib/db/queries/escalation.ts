import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  reportTracking,
  attendanceRecords,
  fieldTripReports,
} from "../schema/attendance";
import { schoolDayCalendar } from "../schema/misc";
import { studentYears } from "../schema/identity";
import { tierFromDates } from "@/lib/domain/escalation";
import type { ReportTier } from "@/lib/domain/types";
import { applyPaging } from "../pagination";
import { writeAudit } from "./audit";

/**
 * 신고서 에스컬레이션 재계산 (계획 §3.3 F, §3.4 escalation, AC-F).
 *
 * 미제출 신고서(출결/교외체험 사후보고서)의 경과 수업일을 school_day_calendar 로
 * 세어 티어(정상≤3/위험>3/심각>5)를 재계산하고 report_tracking 스냅샷을 갱신한다.
 * 티어가 바뀌면 audit_log(escalation_transition)에 전이를 남긴다.
 * 제출된 신고서는 정상으로 정리한다. 일일 pg_cron(0005)이 이 로직의 SQL 백스톱.
 */
type DB = PostgresJsDatabase<typeof schema>;

function dateAtUtc(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00Z");
}

/** 출결 신고서 마감 = 기준일 이후 수업일 5일. */
export const ATTENDANCE_REPORT_DEADLINE_SCHOOL_DAYS = 5;
/** 교외체험 사후보고서 마감 = 체험일 이후 수업일 10일(QC v3 Part B, AC-7.2). */
export const FIELD_TRIP_POST_REPORT_DEADLINE_SCHOOL_DAYS = 10;

/** base 이후 n번째 수업일(신고서 마감일). 없으면 null. */
function nthSchoolDayAfter(
  sortedSchoolDays: string[],
  base: string,
  n: number,
): string | null {
  const after = sortedSchoolDays.filter((d) => d > base);
  return after.length >= n ? after[n - 1] : null;
}

export interface FieldTripInput {
  studentYearId: string;
  tripDate: string;
  /** 기간 종료일(QC v4, 0031). 미지정=당일(=tripDate). */
  endDate?: string | null;
}

/**
 * 교외체험 사후보고서 추적 시작(보고서 행 + tracking 생성).
 * trip_date=start_date 미러, end_date=종료일(미지정 시 trip_date)로 영속.
 * 출결 자동생성이 필요하면 attendance.ts 의 addFieldTrip 을 사용한다.
 */
export async function addFieldTripReport(
  db: DB,
  ownerId: string,
  input: FieldTripInput,
): Promise<{ id: string }> {
  const endDate = input.endDate ?? input.tripDate;
  const [trip] = await db
    .insert(fieldTripReports)
    .values({
      ownerId,
      studentYearId: input.studentYearId,
      tripDate: input.tripDate,
      startDate: input.tripDate,
      endDate,
    })
    .returning({ id: fieldTripReports.id });
  await db.insert(reportTracking).values({ ownerId, fieldTripId: trip.id });
  return { id: trip.id };
}

/** 교외체험 사후보고서 제출 여부 마킹. */
export async function setFieldTripSubmitted(
  db: DB,
  ownerId: string,
  fieldTripId: string,
  submitted: boolean,
): Promise<void> {
  await db
    .update(fieldTripReports)
    .set({ postReportSubmitted: submitted, updatedAt: new Date() })
    .where(
      and(
        eq(fieldTripReports.id, fieldTripId),
        eq(fieldTripReports.ownerId, ownerId),
      ),
    );
}

export interface RecomputeResult {
  recomputed: number;
  transitions: number;
}

/**
 * 한 owner 의 모든 신고서 추적 티어를 재계산. asOf 기준(기본 오늘).
 * 출결/교외체험에 동일한 5일·3/5 규칙(기준일=결석일/체험일)을 적용한다.
 */
export async function recomputeEscalation(
  db: DB,
  ownerId: string,
  asOf: Date = new Date(),
): Promise<RecomputeResult> {
  const cal = await db
    .select({ date: schoolDayCalendar.date })
    .from(schoolDayCalendar)
    .where(
      and(
        eq(schoolDayCalendar.ownerId, ownerId),
        eq(schoolDayCalendar.isSchoolDay, true),
      ),
    );
  const schoolDaySet = new Set(cal.map((c) => c.date));
  const sortedSchoolDays = [...schoolDaySet].sort();
  const isSchoolDay = (d: Date) => schoolDaySet.has(d.toISOString().slice(0, 10));

  // 추적행 + 기준일/제출여부 조인
  const rows = await db
    .select({
      id: reportTracking.id,
      lastTier: reportTracking.lastTier,
      attendanceRecordId: reportTracking.attendanceRecordId,
      fieldTripId: reportTracking.fieldTripId,
      attDate: attendanceRecords.date,
      attSubmitted: attendanceRecords.reportSubmitted,
      tripDate: fieldTripReports.tripDate,
      tripEndDate: fieldTripReports.endDate,
      tripSubmitted: fieldTripReports.postReportSubmitted,
    })
    .from(reportTracking)
    .leftJoin(
      attendanceRecords,
      eq(reportTracking.attendanceRecordId, attendanceRecords.id),
    )
    .leftJoin(fieldTripReports, eq(reportTracking.fieldTripId, fieldTripReports.id))
    .where(eq(reportTracking.ownerId, ownerId));

  let transitions = 0;
  for (const r of rows) {
    // 마감 기준일: 출결=결석일, 교외체험=종료일(end_date, 폴백 trip_date).
    const base = r.attDate ?? r.tripEndDate ?? r.tripDate;
    if (!base) continue; // 손상된 추적행 방어
    const submitted = r.attSubmitted ?? r.tripSubmitted ?? false;

    const newTier: ReportTier = submitted
      ? "normal"
      : tierFromDates(dateAtUtc(base), asOf, isSchoolDay);
    // 마감일: 출결=수업일 5일, 교외체험 사후보고서=수업일 10일.
    const deadlineDays = r.fieldTripId
      ? FIELD_TRIP_POST_REPORT_DEADLINE_SCHOOL_DAYS
      : ATTENDANCE_REPORT_DEADLINE_SCHOOL_DAYS;
    const deadline = nthSchoolDayAfter(sortedSchoolDays, base, deadlineDays);

    if (newTier !== r.lastTier) {
      transitions += 1;
      await writeAudit(db, ownerId, "escalation_transition", r.id, {
        from: r.lastTier,
        to: newTier,
        base,
        kind: r.attendanceRecordId ? "attendance" : "field_trip",
      });
    }

    await db
      .update(reportTracking)
      .set({
        lastTier: newTier,
        deadlineDate: deadline,
        lastComputedAt: asOf,
        updatedAt: new Date(),
      })
      .where(eq(reportTracking.id, r.id));
  }

  await writeAudit(db, ownerId, "escalation_recompute", null, {
    recomputed: rows.length,
    transitions,
  });
  return { recomputed: rows.length, transitions };
}

export interface FieldTripRow {
  id: string;
  studentYearId: string;
  sid: string;
  name: string;
  tripDate: string;
  startDate: string | null;
  endDate: string | null;
  postReportSubmitted: boolean;
  tier: ReportTier;
  deadlineDate: string | null;
}

/** 교외체험 사후보고서 목록(학생·티어·마감 포함, 최신순). */
export async function listFieldTrips(
  db: DB,
  ownerId: string,
  opts?: { limit?: number; offset?: number },
): Promise<FieldTripRow[]> {
  const q = db
    .select({
      id: fieldTripReports.id,
      studentYearId: fieldTripReports.studentYearId,
      sid: studentYears.sid,
      name: studentYears.name,
      tripDate: fieldTripReports.tripDate,
      startDate: fieldTripReports.startDate,
      endDate: fieldTripReports.endDate,
      postReportSubmitted: fieldTripReports.postReportSubmitted,
      tier: reportTracking.lastTier,
      deadlineDate: reportTracking.deadlineDate,
    })
    .from(fieldTripReports)
    .innerJoin(studentYears, eq(fieldTripReports.studentYearId, studentYears.id))
    .leftJoin(reportTracking, eq(reportTracking.fieldTripId, fieldTripReports.id))
    .where(eq(fieldTripReports.ownerId, ownerId))
    .orderBy(fieldTripReports.tripDate)
    .$dynamic();
  const rows = await applyPaging(q, opts);
  return rows.map((r) => ({
    id: r.id,
    studentYearId: r.studentYearId,
    sid: r.sid,
    name: r.name,
    tripDate: r.tripDate,
    startDate: r.startDate,
    endDate: r.endDate,
    postReportSubmitted: r.postReportSubmitted,
    tier: (r.tier ?? "normal") as ReportTier,
    deadlineDate: r.deadlineDate,
  }));
}
