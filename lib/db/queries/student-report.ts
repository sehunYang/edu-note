import { and, asc, eq } from "drizzle-orm";
import { inArray } from "drizzle-orm";
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
  homeroomBehaviorNotes,
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

/**
 * 분반 전원 학생 분석 보고서 일괄 조립(통계실·인쇄실 목록용, 계획 AD-4).
 *
 * `getStudentReport()`와 동일한 규칙·플래그를 산출하지만, 분반 학생 수(N)에
 * 비례해 쿼리를 반복하지 않는다: 분반 코호트(=보고 대상 전원)를 1회 조회하고,
 * 관찰·지필·수행 원자료를 `inArray`로 1회씩 배치 조회한 뒤 메모리에서
 * 학생별로 그룹핑한다. `getGradeView()`도 **1회만** 호출해 코호트로 필터링한
 * `cohortScores`를 전원이 공유한다(단건 함수를 N번 호출하면 `getGradeView`가
 * N번 재계산됨 — 이를 피하는 것이 본 함수의 존재 이유).
 *
 * 코호트 정의는 단건 함수(위 79-252행, `enrollments` where `sectionId` 일치)와
 * 동일하며, 여기서는 그 조회 결과가 "보고 대상 목록"과 "순위 모집단"을 겸한다.
 * 분반 미존재 시 빈 배열.
 */
export async function getStudentReportsForSection(
  db: DB,
  ownerId: string,
  sectionId: string,
  _year: number,
  _sem: 1 | 2,
): Promise<StudentReport[]> {
  // 분반 → 과목 + 지필 가중치·활성 플래그 (getStudentReport 와 동일 쿼리).
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
  if (!section) return [];
  const subjectId = section.subjectId;

  // 분반 수강생 인적사항 — 보고 대상 전원이자 순위 코호트(1회 조회, 공용).
  const profiles = await db
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
    .from(enrollments)
    .innerJoin(studentYears, eq(studentYears.id, enrollments.studentYearId))
    .where(
      and(
        eq(enrollments.ownerId, ownerId),
        eq(enrollments.sectionId, sectionId),
      ),
    );
  if (profiles.length === 0) return [];
  const cohortIds = profiles.map((p) => p.studentYearId);

  // 관찰 건수 배치(학생 전체 관찰 — 분반 무관, 관찰부족 플래그용). 1쿼리 + 메모리 그룹핑.
  const observationRows = await db
    .select({ studentYearId: subjectObservations.studentYearId })
    .from(subjectObservations)
    .where(
      and(
        eq(subjectObservations.ownerId, ownerId),
        inArray(subjectObservations.studentYearId, cohortIds),
      ),
    );
  const observationCountByStudent = new Map<string, number>();
  for (const o of observationRows) {
    observationCountByStudent.set(
      o.studentYearId,
      (observationCountByStudent.get(o.studentYearId) ?? 0) + 1,
    );
  }

  // 학생 지필 원점수 배치 → 회차별 환산(읽기시점). 1쿼리 + 메모리 그룹핑.
  const midW = section.midEnabled ? Number(section.midWeight ?? 0) : 0;
  const finalW = section.finalEnabled ? Number(section.finalWeight ?? 0) : 0;
  const jipilRows = await db
    .select({
      studentYearId: jipilScores.studentYearId,
      ordinal: jipilScores.ordinal,
      rawScore: jipilScores.rawScore,
    })
    .from(jipilScores)
    .where(
      and(
        eq(jipilScores.ownerId, ownerId),
        eq(jipilScores.subjectId, subjectId),
        inArray(jipilScores.studentYearId, cohortIds),
      ),
    );
  const jipilByStudent = new Map<
    string,
    { mid: number | null; final: number | null }
  >();
  for (const j of jipilRows) {
    if (j.rawScore === null) continue;
    const raw = Number(j.rawScore);
    const entry = jipilByStudent.get(j.studentYearId) ?? {
      mid: null,
      final: null,
    };
    if (j.ordinal === 1 && section.midEnabled) {
      entry.mid = (raw * midW) / 100;
    } else if (j.ordinal === 2 && section.finalEnabled) {
      entry.final = (raw * finalW) / 100;
    }
    jipilByStudent.set(j.studentYearId, entry);
  }

  // 수행항목 설정(과목 공통, 1쿼리) + 학생별 입력여부(1쿼리 + 메모리 그룹핑).
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
      studentYearId: performanceAssessments.studentYearId,
      name: performanceAssessments.name,
      score: performanceAssessments.score,
      prose: performanceAssessments.prose,
    })
    .from(performanceAssessments)
    .where(
      and(
        eq(performanceAssessments.ownerId, ownerId),
        eq(performanceAssessments.subjectId, subjectId),
        inArray(performanceAssessments.studentYearId, cohortIds),
      ),
    );
  const filledByStudent = new Map<string, Map<string, boolean>>();
  const performanceTotalByStudent = new Map<string, number>();
  for (const p of perfRows) {
    const has = p.score !== null || (p.prose?.trim() ?? "") !== "";
    if (has) {
      const filled = filledByStudent.get(p.studentYearId) ?? new Map<string, boolean>();
      filled.set(p.name, true);
      filledByStudent.set(p.studentYearId, filled);
    }
    if (p.score !== null) {
      performanceTotalByStudent.set(
        p.studentYearId,
        (performanceTotalByStudent.get(p.studentYearId) ?? 0) + Number(p.score),
      );
    }
  }

  // 분반 코호트 환산 총점(sectionRank 모집단) — getGradeView 는 전 학생 공유로 1회만 호출.
  const cohortIdSet = new Set(cohortIds);
  const gradeView = await getGradeView(db, ownerId, subjectId);
  const cohortScores = gradeView
    .filter((g) => cohortIdSet.has(g.studentYearId))
    .map((g) => g.total);
  const gradeViewTotalByStudent = new Map(
    gradeView.map((g) => [g.studentYearId, g.total]),
  );

  return profiles.map((profile) => {
    const studentYearId = profile.studentYearId;
    const observationCount = observationCountByStudent.get(studentYearId) ?? 0;
    const jipil = jipilByStudent.get(studentYearId) ?? {
      mid: null,
      final: null,
    };
    const jipilMidConverted = jipil.mid;
    const jipilFinalConverted = jipil.final;
    const jipilTotal = (jipilMidConverted ?? 0) + (jipilFinalConverted ?? 0);
    const performanceTotal = performanceTotalByStudent.get(studentYearId) ?? 0;
    const filledForStudent = filledByStudent.get(studentYearId);
    const performanceItemsStatus: PerformanceItemStatus[] = items.map((i) => ({
      name: i.name,
      hasScore: filledForStudent?.get(i.name) ?? false,
    }));
    const total = jipilTotal + performanceTotal;
    // 학생 본인 환산 총점(getGradeView 행에서 추출 — 없으면 위에서 계산한 total).
    const studentScore = gradeViewTotalByStudent.get(studentYearId) ?? total;

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
  });
}

/**
 * 학생 인적사항 단건 조회(분반 무관, 인쇄실 상세 점검·배부물 헤더용, US-8).
 * `getStudentReport()`는 sectionId 가 유효해야 인적사항까지 반환하므로, 이번 학기
 * 수강 분반이 0개인 학생도 신원 확인이 가능하도록 별도 조회로 분리한다.
 * 미존재/타 owner 면 null.
 */
export async function getStudentProfileById(
  db: DB,
  ownerId: string,
  studentYearId: string,
): Promise<StudentReportProfile | null> {
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
    .where(and(eq(studentYears.id, studentYearId), eq(studentYears.ownerId, ownerId)))
    .limit(1);
  return profile ?? null;
}

/** 학생의 관찰·행특 기록 건수(카운트만 — 본문 미조회, 인쇄실 상세 점검 화면 전용). */
export interface StudentRecordCounts {
  observationCount: number;
  behaviorCount: number;
}

/**
 * 관찰(subject_observations)·행특(homeroom_behavior_notes) 건수 조회(US-8 인쇄실
 * 상세 점검 화면 "기록 현황" 섹션 전용). 본문(body)은 select 하지 않는다 — 매트릭스는
 * 건수만 필요.
 */
export async function getStudentRecordCounts(
  db: DB,
  ownerId: string,
  studentYearId: string,
): Promise<StudentRecordCounts> {
  const [obs, behavior] = await Promise.all([
    db
      .select({ id: subjectObservations.id })
      .from(subjectObservations)
      .where(
        and(
          eq(subjectObservations.ownerId, ownerId),
          eq(subjectObservations.studentYearId, studentYearId),
        ),
      ),
    db
      .select({ id: homeroomBehaviorNotes.id })
      .from(homeroomBehaviorNotes)
      .where(
        and(
          eq(homeroomBehaviorNotes.ownerId, ownerId),
          eq(homeroomBehaviorNotes.studentYearId, studentYearId),
        ),
      ),
  ]);
  return { observationCount: obs.length, behaviorCount: behavior.length };
}

/** 수행평가 항목별 실제 점수/배점(US-8 배부용 인쇄물 전용). */
export interface PerformanceItemDetail {
  name: string;
  /** 배점(performance_items.weight). 미설정이면 null. */
  weight: number | null;
  /** 학생 점수. 미입력이면 null. */
  score: number | null;
}

/**
 * 학생의 수행평가 항목별 점수/배점 상세(배부용 인쇄물, R8.5). `StudentReportGrades
 * .performanceItems`(hasScore 불리언만 제공)와 달리, 인쇄물은 실제 score/weight를
 * 표시해야 하므로 별도 조회. sectionId → subjectId 해석은 `getStudentReport`(108-125행)
 * 와 동일 방식. 분반 미존재 시 빈 배열.
 */
export async function getPerformanceDetail(
  db: DB,
  ownerId: string,
  studentYearId: string,
  sectionId: string,
): Promise<PerformanceItemDetail[]> {
  const [section] = await db
    .select({ subjectId: courseSections.subjectId })
    .from(courseSections)
    .where(and(eq(courseSections.id, sectionId), eq(courseSections.ownerId, ownerId)))
    .limit(1);
  if (!section) return [];
  const subjectId = section.subjectId;

  const [items, rows] = await Promise.all([
    db
      .select({ name: performanceItems.name, weight: performanceItems.weight })
      .from(performanceItems)
      .where(
        and(
          eq(performanceItems.ownerId, ownerId),
          eq(performanceItems.subjectId, subjectId),
        ),
      )
      .orderBy(asc(performanceItems.createdAt)),
    db
      .select({ name: performanceAssessments.name, score: performanceAssessments.score })
      .from(performanceAssessments)
      .where(
        and(
          eq(performanceAssessments.ownerId, ownerId),
          eq(performanceAssessments.subjectId, subjectId),
          eq(performanceAssessments.studentYearId, studentYearId),
        ),
      ),
  ]);
  const scoreByName = new Map(
    rows.map((r) => [r.name, r.score !== null ? Number(r.score) : null]),
  );
  return items.map((i) => ({
    name: i.name,
    weight: i.weight !== null ? Number(i.weight) : null,
    score: scoreByName.get(i.name) ?? null,
  }));
}
