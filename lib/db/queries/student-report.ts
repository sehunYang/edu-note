import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  subjects,
  courseSections,
  enrollments,
  performanceItems,
} from "../schema/classes";
import { studentYears } from "../schema/identity";
import {
  subjectObservations,
  performanceAssessments,
  jipilScores,
} from "../schema/records";
import {
  jipilTrend,
  observationShortage,
  performanceMissing,
  sectionRank,
  type StudentReportFlags,
  type PerformanceItemStatus,
} from "@/lib/domain/student-report";
import { getGradeView } from "./grades";

/**
 * 학생 분석 보고서 쿼리 계층 (교실 2-2 단계6, ownerId 인자 규약).
 *
 * 인적사항 + 관찰 건수 + 성적(지필/수행) 종합을 모아 도메인 규칙기반 플래그 4종을
 * 적용한다. **AI 호출 없음**(Principle 5, AC-R5). 분반 코호트(sectionRank)는
 * 해당 sectionId 의 enrollments 학생들의 환산 총점(getGradeView 재사용)을 모집단으로
 * 삼는다(성적은 과목단위 저장이나 비교 모집단은 분반). 전 쿼리 ownerId 스코프.
 */
type DB = PostgresJsDatabase<typeof schema>;

/** 학생 인적사항(보고서 표시용). */
export interface StudentReportProfile {
  studentYearId: string;
  sid: string;
  name: string;
  grade: number;
  classNo: number;
  number: number;
  phone: string | null;
  career: string | null;
}

/** 성적 종합(읽기시점 환산값 + 추이 입력). */
export interface StudentReportGrades {
  /** 지필 중간 환산점(미시행·미입력 시 null). */
  jipilMidConverted: number | null;
  /** 지필 기말 환산점(미시행·미입력 시 null). */
  jipilFinalConverted: number | null;
  /** 지필 환산 합(활성 회차만). */
  jipilTotal: number;
  /** 수행 점수 합. */
  performanceTotal: number;
  /** 지필 + 수행 합(분반순위 입력). */
  total: number;
  /** 수행항목별 입력 여부(미입력 플래그 입력). */
  performanceItems: PerformanceItemStatus[];
}

export interface StudentReport {
  profile: StudentReportProfile;
  observationCount: number;
  grades: StudentReportGrades;
  flags: StudentReportFlags;
}

/**
 * 학생 분석 보고서 조립. studentYearId·sectionId·year·sem 으로:
 *  1) 인적사항(student_years),
 *  2) 관찰 건수(subject_observations),
 *  3) 학생의 지필 중간/기말 환산점 + 수행 항목별 입력여부,
 *  4) 분반 코호트(sectionId enrollments) 환산 총점,
 * 을 모아 도메인 플래그 4종을 적용해 반환한다. 학생/분반 미존재 시 null.
 */
export async function getStudentReport(
  db: DB,
  ownerId: string,
  studentYearId: string,
  sectionId: string,
  _year: number,
  _sem: 1 | 2,
): Promise<StudentReport | null> {
  // 인적사항.
  const [profile] = await db
    .select({
      studentYearId: studentYears.id,
      sid: studentYears.sid,
      name: studentYears.name,
      grade: studentYears.grade,
      classNo: studentYears.classNo,
      number: studentYears.number,
      phone: studentYears.phone,
      career: studentYears.career,
    })
    .from(studentYears)
    .where(
      and(eq(studentYears.id, studentYearId), eq(studentYears.ownerId, ownerId)),
    )
    .limit(1);
  if (!profile) return null;

  // 분반 → 과목 + 지필 가중치·활성 플래그.
  const [section] = await db
    .select({
      subjectId: courseSections.subjectId,
      midWeight: subjects.jipilMidWeight,
      finalWeight: subjects.jipilFinalWeight,
      midEnabled: subjects.jipilMidEnabled,
      finalEnabled: subjects.jipilFinalEnabled,
    })
    .from(courseSections)
    .innerJoin(subjects, eq(subjects.id, courseSections.subjectId))
    .where(
      and(
        eq(courseSections.id, sectionId),
        eq(courseSections.ownerId, ownerId),
      ),
    )
    .limit(1);
  if (!section) return null;
  const subjectId = section.subjectId;

  // 관찰 건수(학생 전체 관찰 — 분반 무관, 관찰부족 플래그용).
  const observations = await db
    .select({ id: subjectObservations.id })
    .from(subjectObservations)
    .where(
      and(
        eq(subjectObservations.ownerId, ownerId),
        eq(subjectObservations.studentYearId, studentYearId),
      ),
    );
  const observationCount = observations.length;

  // 학생 지필 원점수 → 회차별 환산(읽기시점). 활성 회차 + 원점수 존재 시에만 값.
  const midW = section.midEnabled ? Number(section.midWeight ?? 0) : 0;
  const finalW = section.finalEnabled ? Number(section.finalWeight ?? 0) : 0;
  const jipilRows = await db
    .select({
      ordinal: jipilScores.ordinal,
      rawScore: jipilScores.rawScore,
    })
    .from(jipilScores)
    .where(
      and(
        eq(jipilScores.ownerId, ownerId),
        eq(jipilScores.subjectId, subjectId),
        eq(jipilScores.studentYearId, studentYearId),
      ),
    );
  let jipilMidConverted: number | null = null;
  let jipilFinalConverted: number | null = null;
  for (const j of jipilRows) {
    if (j.rawScore === null) continue;
    const raw = Number(j.rawScore);
    if (j.ordinal === 1 && section.midEnabled) {
      jipilMidConverted = (raw * midW) / 100;
    } else if (j.ordinal === 2 && section.finalEnabled) {
      jipilFinalConverted = (raw * finalW) / 100;
    }
  }
  const jipilTotal =
    (jipilMidConverted ?? 0) + (jipilFinalConverted ?? 0);

  // 수행항목 설정 + 학생 입력여부(점수 또는 서술 중 하나라도 있으면 입력).
  const items = await db
    .select({ name: performanceItems.name })
    .from(performanceItems)
    .where(
      and(
        eq(performanceItems.ownerId, ownerId),
        eq(performanceItems.subjectId, subjectId),
      ),
    )
    .orderBy(asc(performanceItems.createdAt));
  const perfRows = await db
    .select({
      name: performanceAssessments.name,
      score: performanceAssessments.score,
      prose: performanceAssessments.prose,
    })
    .from(performanceAssessments)
    .where(
      and(
        eq(performanceAssessments.ownerId, ownerId),
        eq(performanceAssessments.subjectId, subjectId),
        eq(performanceAssessments.studentYearId, studentYearId),
      ),
    );
  const filledByName = new Map<string, boolean>();
  let performanceTotal = 0;
  for (const p of perfRows) {
    const has = p.score !== null || (p.prose?.trim() ?? "") !== "";
    if (has) filledByName.set(p.name, true);
    if (p.score !== null) performanceTotal += Number(p.score);
  }
  const performanceItemsStatus: PerformanceItemStatus[] = items.map((i) => ({
    name: i.name,
    hasScore: filledByName.get(i.name) ?? false,
  }));

  const total = jipilTotal + performanceTotal;

  // 분반 코호트 환산 총점(sectionRank 모집단). 해당 분반 enrollments 학생들의
  // getGradeView 총점(점수 보유 여부 무관 전원 — getGradeView 는 미보유 시 0)을
  // 모집단으로 한다. 학생 본인도 포함(동점 결정론 보장).
  const cohortIds = await db
    .select({ studentYearId: enrollments.studentYearId })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.ownerId, ownerId),
        eq(enrollments.sectionId, sectionId),
      ),
    );
  const cohortIdSet = new Set(cohortIds.map((r) => r.studentYearId));
  const gradeView = await getGradeView(db, ownerId, subjectId);
  const cohortScores = gradeView
    .filter((g) => cohortIdSet.has(g.studentYearId))
    .map((g) => g.total);
  // 학생 본인 환산 총점(코호트 행에서 추출 — 없으면 위에서 계산한 total).
  const studentRow = gradeView.find((g) => g.studentYearId === studentYearId);
  const studentScore = studentRow ? studentRow.total : total;

  const flags: StudentReportFlags = {
    jipilTrend: jipilTrend(jipilMidConverted, jipilFinalConverted),
    observationShortage: observationShortage(observationCount),
    performanceMissing: performanceMissing(performanceItemsStatus),
    sectionRank:
      cohortScores.length > 0
        ? sectionRank(studentScore, cohortScores)
        : null,
  };

  return {
    profile,
    observationCount,
    grades: {
      jipilMidConverted,
      jipilFinalConverted,
      jipilTotal,
      performanceTotal,
      total,
      performanceItems: performanceItemsStatus,
    },
    flags,
  };
}
