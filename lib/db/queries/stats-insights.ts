import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  subjects,
  courseSections,
  enrollments,
  performanceItems,
  homeroomClasses,
  homeroomMembers,
} from "../schema/classes";
import { studentYears } from "../schema/identity";
import {
  subjectObservations,
  homeroomBehaviorNotes,
  specialNoteDrafts,
  creativeActivityStudentOverrides,
  jipilScores,
} from "../schema/records";
import { attendanceRecords } from "../schema/attendance";
import { todayKST, ATTENDANCE_WINDOW_DAYS, RECORD_GAP_DAYS } from "@/lib/domain/stats-alerts";
import { completionRate } from "@/lib/domain/stats-insights";
import { getGradeView, type GradeViewRow } from "./grades";
import { getSectionProgressStats, type SectionProgressStat } from "./progress";

/**
 * 통계실 인사이트 쿼리 계층 (통계실·인쇄실 재구축 AD-2). **행 수집 전용** — 임계값·
 * 집계 규칙은 전부 `lib/domain/stats-alerts.ts`·`lib/domain/stats-insights.ts`(순수
 * 함수)에 두고, 여기서는 DB 조회 + 도메인 함수 호출에 필요한 입력 형태로 정리만 한다.
 * 전 함수 ownerId 스코프.
 */
type DB = PostgresJsDatabase<typeof schema>;

/** dateStr(YYYY-MM-DD) 에서 delta 일 이동한 날짜(YYYY-MM-DD). 순수 달력 연산(UTC 앵커). */
function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// getAlertInputs
// ---------------------------------------------------------------------------

export interface AlertGradeDrop {
  subjectId: string;
  /** 지필 중간 환산점(미시행·미입력 시 null). */
  midConverted: number | null;
  /** 지필 기말 환산점(미시행·미입력 시 null). */
  finalConverted: number | null;
}

export interface AlertInputRow {
  studentYearId: string;
  name: string;
  isHomeroomStudent: boolean;
  /** 최근 30일([today-29, today]) 출결(4종 kind 전부) 건수. */
  attendanceRecent30: number;
  /** 직전 30일([today-59, today-30]) 출결 건수. */
  attendancePrev30: number;
  /** 과목별 중간→기말 환산점 쌍(gradeDrop 경보 입력, 과목 복수 수강 대응). */
  gradeDropsBySubject: AlertGradeDrop[];
  /** 최근 21일([today-20, today]) 교과 관찰 건수. */
  obsCount21d: number;
  /** 최근 21일 행동특성 기록 건수. */
  behaviorCount21d: number;
}

/**
 * 경보 3종(attendanceSurge/gradeDrop/recordGap) 평가에 필요한 학생별 입력값.
 *
 * 날짜 윈도 경계(todayKST() 앵커, 전부 인접·비중첩):
 *  - 출결 최근 30일 = [today-29, today], 직전 30일 = [today-59, today-30].
 *  - 관찰/행특 21일 = [today-20, today].
 *
 * 지필 환산은 `getGradeView` 재계산이 아니라 `jipil_scores` 직접 조회 +
 * `subjects.jipilMid/FinalWeight·Enabled` 가중 환산(student-report.ts:139-165 규칙
 * 복제) — 경보는 전 과목×전 학생 스캔이라 과목별 뷰 재계산보다 직접 조회가 적합(AD-2).
 */
export async function getAlertInputs(
  db: DB,
  ownerId: string,
  year: number,
): Promise<AlertInputRow[]> {
  const today = todayKST();
  const recentStart = addDays(today, -(ATTENDANCE_WINDOW_DAYS - 1));
  const prevStart = addDays(today, -(ATTENDANCE_WINDOW_DAYS * 2 - 1));
  const gapStart = addDays(today, -(RECORD_GAP_DAYS - 1));

  const students = await db
    .select({ studentYearId: studentYears.id, name: studentYears.name })
    .from(studentYears)
    .where(and(eq(studentYears.ownerId, ownerId), eq(studentYears.schoolYear, year)));
  if (students.length === 0) return [];
  const ids = students.map((s) => s.studentYearId);

  const [homeroomRows, attendanceRows, jipilRows, obsRows, behaviorRows] =
    await Promise.all([
      db
        .select({ studentYearId: homeroomMembers.studentYearId })
        .from(homeroomMembers)
        .innerJoin(homeroomClasses, eq(homeroomMembers.homeroomId, homeroomClasses.id))
        .where(
          and(
            eq(homeroomMembers.ownerId, ownerId),
            eq(homeroomClasses.schoolYear, year),
            inArray(homeroomMembers.studentYearId, ids),
          ),
        ),
      db
        .select({
          studentYearId: attendanceRecords.studentYearId,
          date: attendanceRecords.date,
        })
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.ownerId, ownerId),
            inArray(attendanceRecords.studentYearId, ids),
            gte(attendanceRecords.date, prevStart),
            lte(attendanceRecords.date, today),
          ),
        ),
      db
        .select({
          studentYearId: jipilScores.studentYearId,
          subjectId: jipilScores.subjectId,
          ordinal: jipilScores.ordinal,
          rawScore: jipilScores.rawScore,
        })
        .from(jipilScores)
        .where(
          and(eq(jipilScores.ownerId, ownerId), inArray(jipilScores.studentYearId, ids)),
        ),
      db
        .select({ studentYearId: subjectObservations.studentYearId })
        .from(subjectObservations)
        .where(
          and(
            eq(subjectObservations.ownerId, ownerId),
            inArray(subjectObservations.studentYearId, ids),
            gte(subjectObservations.observedOn, gapStart),
            lte(subjectObservations.observedOn, today),
          ),
        ),
      db
        .select({ studentYearId: homeroomBehaviorNotes.studentYearId })
        .from(homeroomBehaviorNotes)
        .where(
          and(
            eq(homeroomBehaviorNotes.ownerId, ownerId),
            inArray(homeroomBehaviorNotes.studentYearId, ids),
            gte(homeroomBehaviorNotes.notedOn, gapStart),
            lte(homeroomBehaviorNotes.notedOn, today),
          ),
        ),
    ]);

  const homeroomSet = new Set(homeroomRows.map((r) => r.studentYearId));

  // 조회 범위가 이미 [prevStart, today] 로 제한되므로, recentStart 기준 양분만으로
  // 최근30/직전30 두 버킷이 정확히 갈린다(경계 addDays 산출식이 인접·비중첩 보장).
  const recentCount = new Map<string, number>();
  const prevCount = new Map<string, number>();
  for (const r of attendanceRows) {
    const bucket = r.date >= recentStart ? recentCount : prevCount;
    bucket.set(r.studentYearId, (bucket.get(r.studentYearId) ?? 0) + 1);
  }

  const subjectIds = [...new Set(jipilRows.map((j) => j.subjectId))];
  const subjectMeta =
    subjectIds.length > 0
      ? await db
          .select({
            id: subjects.id,
            midWeight: subjects.jipilMidWeight,
            finalWeight: subjects.jipilFinalWeight,
            midEnabled: subjects.jipilMidEnabled,
            finalEnabled: subjects.jipilFinalEnabled,
          })
          .from(subjects)
          .where(and(eq(subjects.ownerId, ownerId), inArray(subjects.id, subjectIds)))
      : [];
  const subjectMetaById = new Map(subjectMeta.map((s) => [s.id, s]));

  const dropsByStudent = new Map<string, Map<string, AlertGradeDrop>>();
  for (const j of jipilRows) {
    if (j.rawScore === null) continue;
    const meta = subjectMetaById.get(j.subjectId);
    if (!meta) continue;
    const raw = Number(j.rawScore);
    let studentMap = dropsByStudent.get(j.studentYearId);
    if (!studentMap) {
      studentMap = new Map();
      dropsByStudent.set(j.studentYearId, studentMap);
    }
    let entry = studentMap.get(j.subjectId);
    if (!entry) {
      entry = { subjectId: j.subjectId, midConverted: null, finalConverted: null };
      studentMap.set(j.subjectId, entry);
    }
    if (j.ordinal === 1 && meta.midEnabled) {
      entry.midConverted = (raw * Number(meta.midWeight ?? 0)) / 100;
    } else if (j.ordinal === 2 && meta.finalEnabled) {
      entry.finalConverted = (raw * Number(meta.finalWeight ?? 0)) / 100;
    }
  }

  const obsCount = new Map<string, number>();
  for (const r of obsRows) obsCount.set(r.studentYearId, (obsCount.get(r.studentYearId) ?? 0) + 1);
  const behaviorCount = new Map<string, number>();
  for (const r of behaviorRows) {
    behaviorCount.set(r.studentYearId, (behaviorCount.get(r.studentYearId) ?? 0) + 1);
  }

  return students.map((s) => {
    const dropsMap = dropsByStudent.get(s.studentYearId);
    return {
      studentYearId: s.studentYearId,
      name: s.name,
      isHomeroomStudent: homeroomSet.has(s.studentYearId),
      attendanceRecent30: recentCount.get(s.studentYearId) ?? 0,
      attendancePrev30: prevCount.get(s.studentYearId) ?? 0,
      gradeDropsBySubject: dropsMap ? [...dropsMap.values()] : [],
      obsCount21d: obsCount.get(s.studentYearId) ?? 0,
      behaviorCount21d: behaviorCount.get(s.studentYearId) ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// getSectionGradeAnalysis
// ---------------------------------------------------------------------------

export interface SectionCohortStudent {
  studentYearId: string;
  sid: string;
  name: string;
  jipilMid: number;
  jipilFinal: number;
  total: number;
}

export interface OtherSectionScores {
  sectionId: string;
  label: string;
  /** 코호트(그 분반 enrollments) 학생들의 환산 총점. */
  scores: number[];
}

export interface PerformanceItemFill {
  name: string;
  filledCount: number;
  totalStudents: number;
  /** 입력된 학생 기준 평균(미입력 0명이면 null). */
  avgScore: number | null;
}

export interface SectionGradeAnalysis {
  sectionId: string;
  sectionLabel: string;
  subjectId: string;
  subjectName: string;
  /** 이 분반 코호트(enrollments) 학생들의 환산 성적. */
  students: SectionCohortStudent[];
  /** 같은 과목의 다른 분반(비교용, 각자 코호트로 필터). */
  otherSections: OtherSectionScores[];
  /** 수행 항목별 입력률/평균(이 분반 코호트 기준). */
  performanceItems: PerformanceItemFill[];
}

/**
 * 분반 단위 성적 분석 입력(히스토그램/기초통계/추이/분반비교/수행입력률 화면 재료).
 * `getGradeView`(과목 전체 수강생)를 재사용하되, 화면에 노출되는 값은 전부 분반
 * enrollments 로 필터한 코호트다(student-report.ts:220-224 로직 복제 — 과목 전체
 * 오염 방지). 분반 미존재 시 null.
 */
export async function getSectionGradeAnalysis(
  db: DB,
  ownerId: string,
  sectionId: string,
): Promise<SectionGradeAnalysis | null> {
  const [section] = await db
    .select({
      id: courseSections.id,
      label: courseSections.label,
      subjectId: courseSections.subjectId,
      subjectName: subjects.name,
    })
    .from(courseSections)
    .innerJoin(subjects, eq(subjects.id, courseSections.subjectId))
    .where(and(eq(courseSections.id, sectionId), eq(courseSections.ownerId, ownerId)))
    .limit(1);
  if (!section) return null;

  const [gradeView, sameSubjectSections, items] = await Promise.all([
    getGradeView(db, ownerId, section.subjectId),
    db
      .select({ id: courseSections.id, label: courseSections.label })
      .from(courseSections)
      .where(
        and(
          eq(courseSections.ownerId, ownerId),
          eq(courseSections.subjectId, section.subjectId),
        ),
      ),
    db
      .select({ name: performanceItems.name })
      .from(performanceItems)
      .where(
        and(
          eq(performanceItems.ownerId, ownerId),
          eq(performanceItems.subjectId, section.subjectId),
        ),
      )
      .orderBy(asc(performanceItems.createdAt)),
  ]);

  const enrollRows =
    sameSubjectSections.length > 0
      ? await db
          .select({
            sectionId: enrollments.sectionId,
            studentYearId: enrollments.studentYearId,
          })
          .from(enrollments)
          .where(
            and(
              eq(enrollments.ownerId, ownerId),
              inArray(
                enrollments.sectionId,
                sameSubjectSections.map((s) => s.id),
              ),
            ),
          )
      : [];
  const cohortBySection = new Map<string, Set<string>>();
  for (const r of enrollRows) {
    let set = cohortBySection.get(r.sectionId);
    if (!set) {
      set = new Set();
      cohortBySection.set(r.sectionId, set);
    }
    set.add(r.studentYearId);
  }

  const gradeViewById = new Map<string, GradeViewRow>(
    gradeView.map((g) => [g.studentYearId, g]),
  );
  const ownCohortIds = cohortBySection.get(sectionId) ?? new Set<string>();
  const students: SectionCohortStudent[] = [...ownCohortIds]
    .map((id) => gradeViewById.get(id))
    .filter((g): g is GradeViewRow => g !== undefined)
    .map((g) => ({
      studentYearId: g.studentYearId,
      sid: g.sid,
      name: g.name,
      jipilMid: g.jipilMid,
      jipilFinal: g.jipilFinal,
      total: g.total,
    }));

  const otherSections: OtherSectionScores[] = sameSubjectSections
    .filter((s) => s.id !== sectionId)
    .map((s) => {
      const cohort = cohortBySection.get(s.id) ?? new Set<string>();
      const scores = [...cohort]
        .map((id) => gradeViewById.get(id)?.total)
        .filter((t): t is number => t !== undefined);
      return { sectionId: s.id, label: s.label, scores };
    });

  const performanceItemsResult: PerformanceItemFill[] = items.map((it) => {
    const filled = students
      .map((s) => gradeViewById.get(s.studentYearId)?.performanceByItem[it.name])
      .filter((v): v is number => v !== undefined);
    return {
      name: it.name,
      filledCount: filled.length,
      totalStudents: students.length,
      avgScore: filled.length > 0 ? filled.reduce((a, b) => a + b, 0) / filled.length : null,
    };
  });

  return {
    sectionId: section.id,
    sectionLabel: section.label,
    subjectId: section.subjectId,
    subjectName: section.subjectName,
    students,
    otherSections,
    performanceItems: performanceItemsResult,
  };
}

// ---------------------------------------------------------------------------
// getCoverageRows
// ---------------------------------------------------------------------------

export interface CoverageRawRow {
  studentYearId: string;
  studentName: string;
  kind: "observation" | "behavior" | "setechDraft" | "creative";
}

/**
 * 기록 커버리지 원시 행(학생×유형, 1건=1행) — `coverageMatrix()`(stats-insights.ts)
 * 입력. 4유형: 관찰(subject_observations)/행특(homeroom_behavior_notes)/세특초안
 * (special_note_drafts)/창체(creative_activity_student_overrides — Architect 확정:
 * creative_activity_records 는 clubId 단위라 학생별 변별력 없음, override 만 개인화
 * 기입으로 카운트). 쿼리는 행 수집만 하고 매트릭스 집계는 호출측에서 수행.
 */
export async function getCoverageRows(
  db: DB,
  ownerId: string,
  year: number,
): Promise<CoverageRawRow[]> {
  const students = await db
    .select({ studentYearId: studentYears.id, name: studentYears.name })
    .from(studentYears)
    .where(and(eq(studentYears.ownerId, ownerId), eq(studentYears.schoolYear, year)));
  if (students.length === 0) return [];
  const ids = students.map((s) => s.studentYearId);
  const nameById = new Map(students.map((s) => [s.studentYearId, s.name]));

  const [obs, behavior, drafts, creative] = await Promise.all([
    db
      .select({ studentYearId: subjectObservations.studentYearId })
      .from(subjectObservations)
      .where(
        and(
          eq(subjectObservations.ownerId, ownerId),
          inArray(subjectObservations.studentYearId, ids),
        ),
      ),
    db
      .select({ studentYearId: homeroomBehaviorNotes.studentYearId })
      .from(homeroomBehaviorNotes)
      .where(
        and(
          eq(homeroomBehaviorNotes.ownerId, ownerId),
          inArray(homeroomBehaviorNotes.studentYearId, ids),
        ),
      ),
    db
      .select({ studentYearId: specialNoteDrafts.studentYearId })
      .from(specialNoteDrafts)
      .where(
        and(
          eq(specialNoteDrafts.ownerId, ownerId),
          inArray(specialNoteDrafts.studentYearId, ids),
        ),
      ),
    db
      .select({ studentYearId: creativeActivityStudentOverrides.studentYearId })
      .from(creativeActivityStudentOverrides)
      .where(
        and(
          eq(creativeActivityStudentOverrides.ownerId, ownerId),
          inArray(creativeActivityStudentOverrides.studentYearId, ids),
        ),
      ),
  ]);

  const rows: CoverageRawRow[] = [];
  for (const r of obs) {
    rows.push({ studentYearId: r.studentYearId, studentName: nameById.get(r.studentYearId) ?? "", kind: "observation" });
  }
  for (const r of behavior) {
    rows.push({ studentYearId: r.studentYearId, studentName: nameById.get(r.studentYearId) ?? "", kind: "behavior" });
  }
  for (const r of drafts) {
    rows.push({ studentYearId: r.studentYearId, studentName: nameById.get(r.studentYearId) ?? "", kind: "setechDraft" });
  }
  for (const r of creative) {
    rows.push({ studentYearId: r.studentYearId, studentName: nameById.get(r.studentYearId) ?? "", kind: "creative" });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// getWorkProgress
// ---------------------------------------------------------------------------

export interface WorkProgressResult {
  /** 분반별 진도율(getSectionProgressStats 재사용, 재구현 없음). */
  sections: SectionProgressStat[];
  /**
   * 세특 초안 완성률(finalized/전체). 해당 연도(schoolYear=year) 학생 전원의 초안을
   * 유형·과목 구분 없이 aggregate 로 합산(학생별 세분화는 UI 필요시 후속 — 여기선
   * 업무 진척 요약 지표 1개로 충분하다고 판단). total=0 이면 null(completionRate 계약).
   */
  specialNoteCompletionRate: number | null;
  /**
   * 신고서 처리율(reportRequired 대비 reportSubmitted). `getOwnerStats`(stats.ts:83-89)
   * 와 **동일 필터**(ownerId 전역, 연도/학기 미스코프)로 AD-2 명시 — 기존 대시보드
   * 지표와 판정 기준을 일치시킨다(year/sem 파라미터는 sections 에만 적용).
   */
  reportProcessRate: number | null;
}

/**
 * 업무 진척 3종 집계. 진도율은 `getSectionProgressStats`(progress.ts) 재사용,
 * 세특완성률·신고서처리율은 카운트 조회 후 `completionRate()`(stats-insights.ts)로 산출.
 */
export async function getWorkProgress(
  db: DB,
  ownerId: string,
  year: number,
  sem: 1 | 2,
): Promise<WorkProgressResult> {
  const students = await db
    .select({ studentYearId: studentYears.id })
    .from(studentYears)
    .where(and(eq(studentYears.ownerId, ownerId), eq(studentYears.schoolYear, year)));
  const studentIds = students.map((s) => s.studentYearId);

  const [sections, draftAgg, reportAgg] = await Promise.all([
    getSectionProgressStats(db, ownerId, year, sem),
    studentIds.length > 0
      ? db
          .select({
            total: sql<number>`count(*)::int`,
            finalized: sql<number>`count(*) filter (where ${specialNoteDrafts.status} = 'finalized')::int`,
          })
          .from(specialNoteDrafts)
          .where(
            and(
              eq(specialNoteDrafts.ownerId, ownerId),
              inArray(specialNoteDrafts.studentYearId, studentIds),
            ),
          )
      : Promise.resolve([{ total: 0, finalized: 0 }]),
    db
      .select({
        total: sql<number>`count(*) filter (where ${attendanceRecords.reportRequired})::int`,
        submitted: sql<number>`count(*) filter (where ${attendanceRecords.reportRequired} and ${attendanceRecords.reportSubmitted})::int`,
      })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.ownerId, ownerId)),
  ]);

  return {
    sections,
    specialNoteCompletionRate: completionRate(draftAgg[0]?.finalized ?? 0, draftAgg[0]?.total ?? 0),
    reportProcessRate: completionRate(reportAgg[0]?.submitted ?? 0, reportAgg[0]?.total ?? 0),
  };
}
