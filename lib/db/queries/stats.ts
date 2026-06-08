import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { studentYears } from "../schema/identity";
import {
  subjectObservations,
  homeroomBehaviorNotes,
  studentActivityEntries,
  specialNoteDrafts,
} from "../schema/records";
import { attendanceRecords } from "../schema/attendance";
import { counselingLogs, clubs } from "../schema/misc";

/**
 * 통계실 집계 쿼리 (계획 §4 Phase2-K-2). 소유자 데이터의 기록 현황을 한눈에.
 * 성적(grades)은 Phase 1 목업이므로 통계에서도 '준비중'으로 표기(값 미집계).
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface OwnerStats {
  students: number; // 해당 연도 등록 학생
  observations: number; // 교과 관찰기록
  behaviorNotes: number; // 행동특성 기록
  activities: number; // 활동 기입
  counseling: number; // 상담 기록
  clubs: number; // 동아리
  draftsTotal: number; // 세특 초안 전체
  draftsFinalized: number; // 완료된 초안
  attendanceTotal: number; // 출결 기록
  unsubmittedReports: number; // 미제출 신고서
}

/** 소유자 통계 집계(해당 연도 학생 기준). */
export async function getOwnerStats(
  db: DB,
  ownerId: string,
  schoolYear: number,
): Promise<OwnerStats> {
  const N = sql<number>`count(*)::int`;
  const [
    studentsR,
    observationsR,
    behaviorR,
    activitiesR,
    counselingR,
    clubsR,
    drafts,
    attendance,
  ] = await Promise.all([
    db
      .select({ n: N })
      .from(studentYears)
      .where(
        and(
          eq(studentYears.ownerId, ownerId),
          eq(studentYears.schoolYear, schoolYear),
        ),
      ),
    db
      .select({ n: N })
      .from(subjectObservations)
      .where(eq(subjectObservations.ownerId, ownerId)),
    db
      .select({ n: N })
      .from(homeroomBehaviorNotes)
      .where(eq(homeroomBehaviorNotes.ownerId, ownerId)),
    db
      .select({ n: N })
      .from(studentActivityEntries)
      .where(eq(studentActivityEntries.ownerId, ownerId)),
    db
      .select({ n: N })
      .from(counselingLogs)
      .where(eq(counselingLogs.ownerId, ownerId)),
    db.select({ n: N }).from(clubs).where(eq(clubs.ownerId, ownerId)),
    db
      .select({
        total: N,
        finalized: sql<number>`count(*) filter (where ${specialNoteDrafts.status} = 'finalized')::int`,
      })
      .from(specialNoteDrafts)
      .where(eq(specialNoteDrafts.ownerId, ownerId)),
    db
      .select({
        total: N,
        unsubmitted: sql<number>`count(*) filter (where ${attendanceRecords.reportRequired} and not ${attendanceRecords.reportSubmitted})::int`,
      })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.ownerId, ownerId)),
  ]);

  return {
    students: studentsR[0]?.n ?? 0,
    observations: observationsR[0]?.n ?? 0,
    behaviorNotes: behaviorR[0]?.n ?? 0,
    activities: activitiesR[0]?.n ?? 0,
    counseling: counselingR[0]?.n ?? 0,
    clubs: clubsR[0]?.n ?? 0,
    draftsTotal: drafts[0]?.total ?? 0,
    draftsFinalized: drafts[0]?.finalized ?? 0,
    attendanceTotal: attendance[0]?.total ?? 0,
    unsubmittedReports: attendance[0]?.unsubmitted ?? 0,
  };
}
