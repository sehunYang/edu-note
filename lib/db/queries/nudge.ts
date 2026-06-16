import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  reportTracking,
  attendanceRecords,
  fieldTripReports,
} from "../schema/attendance";
import {
  subjects,
  courseSections,
  timetableSlots,
  enrollments,
} from "../schema/classes";
import { subjectObservations } from "../schema/records";
import { studentYears } from "../schema/identity";
import {
  assembleNudges,
  type NudgeResult,
  type NudgeOptions,
  type SectionObservationInput,
} from "@/lib/domain/nudge";
import type { ReportTier } from "@/lib/domain/types";
import { activeSemester } from "@/lib/domain/school-year";
import { studentsWithoutBehaviorNoteToday } from "./observations";
import { listPendingCounselLogReservations } from "./counseling";

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

/** 오늘 KST 날짜(yyyy-mm-dd). */
function kstDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** KST 기준 오늘 요일(1=월 .. 7=일). */
function kstWeekday(now: Date = new Date()): number {
  const jsDay = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCDay(); // 0=일..6=토
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * 오늘 진행하는 분반 수업당 교과 관찰 넛지 입력 산출(AC-7.2/7.4). 당일 한정:
 *  1. 활성 학기 시간표에서 **오늘 요일** 슬롯의 분반을 distinct 로 수집.
 *  2. 오늘 이미 관찰이 1건이라도 기록된 분반은 제외(resolved-on-record).
 *  3. 남은 분반별 수강생 + 학년 누적 관찰수(0건 포함)를 가중랜덤 입력으로 구성.
 * 지나간 날의 미기록은 절대 포함하지 않는다(넛지=유도, 강제 아님).
 */
export async function collectTodaySectionObservations(
  db: DB,
  ownerId: string,
  schoolYear: number,
  now: Date = new Date(),
): Promise<SectionObservationInput[]> {
  const semester = activeSemester(now);
  const today = kstDate(now);
  const weekday = kstWeekday(now);

  // 1. 오늘 요일에 수업이 있는 분반(활성 학기) — distinct.
  const todaySlots = await db
    .select({
      sectionId: courseSections.id,
      label: courseSections.label,
      subjectName: subjects.name,
    })
    .from(timetableSlots)
    .innerJoin(courseSections, eq(timetableSlots.sectionId, courseSections.id))
    .innerJoin(subjects, eq(courseSections.subjectId, subjects.id))
    .where(
      and(
        eq(timetableSlots.ownerId, ownerId),
        eq(timetableSlots.weekday, weekday),
        eq(subjects.schoolYear, schoolYear),
        eq(subjects.semester, semester),
      ),
    )
    .orderBy(asc(subjects.name), asc(courseSections.label));

  const sectionById = new Map<string, { label: string; subjectName: string }>();
  for (const s of todaySlots) {
    if (!sectionById.has(s.sectionId)) {
      sectionById.set(s.sectionId, { label: s.label, subjectName: s.subjectName });
    }
  }
  const sectionIds = [...sectionById.keys()];
  if (sectionIds.length === 0) return [];

  // 2. 오늘 이미 관찰된 분반 제외(resolved-on-record).
  const observedToday = await db
    .select({ sectionId: subjectObservations.sectionId })
    .from(subjectObservations)
    .where(
      and(
        eq(subjectObservations.ownerId, ownerId),
        eq(subjectObservations.observedOn, today),
        inArray(subjectObservations.sectionId, sectionIds),
      ),
    );
  const resolved = new Set(
    observedToday.map((o) => o.sectionId).filter((id): id is string => id !== null),
  );
  const pendingSectionIds = sectionIds.filter((id) => !resolved.has(id));
  if (pendingSectionIds.length === 0) return [];

  // 3. 남은 분반 수강생 + 학년 누적 관찰수(0건 포함). 분반×학생 LEFT JOIN 관찰.
  const rows = await db
    .select({
      sectionId: enrollments.sectionId,
      studentYearId: studentYears.id,
      sid: studentYears.sid,
      name: studentYears.name,
      recordCount: sql<number>`count(${subjectObservations.id})::int`,
    })
    .from(enrollments)
    .innerJoin(studentYears, eq(studentYears.id, enrollments.studentYearId))
    .leftJoin(
      subjectObservations,
      eq(subjectObservations.studentYearId, studentYears.id),
    )
    .where(
      and(
        eq(enrollments.ownerId, ownerId),
        inArray(enrollments.sectionId, pendingSectionIds),
      ),
    )
    .groupBy(enrollments.sectionId, studentYears.id, studentYears.sid, studentYears.name)
    .orderBy(asc(studentYears.sid));

  const bySection = new Map<string, SectionObservationInput>();
  for (const id of pendingSectionIds) {
    const meta = sectionById.get(id)!;
    bySection.set(id, {
      sectionKey: id,
      sectionLabel: `${meta.subjectName} ${meta.label}`,
      studentCounts: [],
      studentNames: {},
    });
  }
  for (const r of rows) {
    const sec = bySection.get(r.sectionId);
    if (!sec) continue;
    sec.studentCounts.push({ id: r.studentYearId, recordCount: Number(r.recordCount) });
    sec.studentNames![r.studentYearId] = `${r.sid} ${r.name}`;
  }
  // 수강생 없는 분반은 추천 후보가 없으므로 제외.
  return [...bySection.values()].filter((s) => s.studentCounts.length > 0);
}

/** 4종 넛지를 수집해 결과를 반환(교과 관찰은 오늘 분반 수업당 1개, AC-7.2). */
export async function collectNudges(
  db: DB,
  ownerId: string,
  schoolYear: number,
  options: Pick<NudgeOptions, "now" | "rng"> = {},
): Promise<NudgeResult> {
  const now = options.now ?? new Date();
  const today = kstDate(now);
  const [
    sectionObservations,
    behaviorPendingStudentIds,
    pendingReportTiers,
    pendingCounselLogs,
  ] = await Promise.all([
    collectTodaySectionObservations(db, ownerId, schoolYear, now),
    studentsWithoutBehaviorNoteToday(db, ownerId, schoolYear, today),
    listPendingReportTiers(db, ownerId),
    // c8: 슬롯 날짜가 경과(< 오늘 KST)했으나 상담일지 미작성인 예약.
    listPendingCounselLogReservations(db, ownerId, schoolYear, today),
  ]);

  return assembleNudges(
    {
      sectionObservations,
      behaviorPendingStudentIds,
      pendingReportTiers,
      pendingCounselLogs,
    },
    { rng: options.rng },
  );
}
