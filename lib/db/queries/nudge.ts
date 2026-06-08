import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  reportTracking,
  attendanceRecords,
  fieldTripReports,
} from "../schema/attendance";
import {
  assembleNudges,
  type NudgeResult,
  type NudgeOptions,
} from "@/lib/domain/nudge";
import type { ReportTier } from "@/lib/domain/types";
import {
  countSubjectObservationsByStudent,
  studentsWithoutBehaviorNoteToday,
} from "./observations";

/**
 * 넛지 수집 (계획 §3.4 nudgeEngine, AC-C). DB 조회 후 순수 assembleNudges 로 조립.
 * 16시 게이트는 서버 UTC 를 KST 로 변환해 적용한다.
 */
type DB = PostgresJsDatabase<typeof schema>;

/** 미제출 신고서(출결+교외체험)의 현재 티어 목록. */
export async function listPendingReportTiers(
  db: DB,
  ownerId: string,
): Promise<ReportTier[]> {
  // 출결 신고서: report_required ∧ !submitted
  const att = await db
    .select({ tier: reportTracking.lastTier })
    .from(reportTracking)
    .innerJoin(
      attendanceRecords,
      eq(reportTracking.attendanceRecordId, attendanceRecords.id),
    )
    .where(
      and(
        eq(reportTracking.ownerId, ownerId),
        eq(attendanceRecords.reportSubmitted, false),
      ),
    );
  // 교외체험 사후보고서: !post_report_submitted
  const trip = await db
    .select({ tier: reportTracking.lastTier })
    .from(reportTracking)
    .innerJoin(fieldTripReports, eq(reportTracking.fieldTripId, fieldTripReports.id))
    .where(
      and(
        eq(reportTracking.ownerId, ownerId),
        eq(fieldTripReports.postReportSubmitted, false),
      ),
    );
  return [...att, ...trip].map((r) => r.tier as ReportTier);
}

/** 현재 KST 시각의 '시'(0~23). */
function kstHour(now: Date = new Date()): number {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCHours();
}

/** 오늘 KST 날짜(yyyy-mm-dd). */
function kstDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 4종 넛지를 수집해 결과를 반환. */
export async function collectNudges(
  db: DB,
  ownerId: string,
  schoolYear: number,
  options: Pick<NudgeOptions, "now" | "rng"> = {},
): Promise<NudgeResult> {
  const now = options.now ?? new Date();
  const [observationCounts, behaviorPendingStudentIds, pendingReportTiers] =
    await Promise.all([
      countSubjectObservationsByStudent(db, ownerId, schoolYear),
      studentsWithoutBehaviorNoteToday(db, ownerId, schoolYear, kstDate(now)),
      listPendingReportTiers(db, ownerId),
    ]);

  return assembleNudges(
    { observationCounts, behaviorPendingStudentIds, pendingReportTiers },
    { rng: options.rng, currentHour: kstHour(now) },
  );
}
