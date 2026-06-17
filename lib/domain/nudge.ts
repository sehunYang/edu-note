/**
 * 넛지 — 가중 랜덤 선택 (계획 §3.4 nudgeEngine, AC-C).
 *
 * 미기록 수업 팝업의 2명 중 1명은 "기록량이 적은 학생 우선" 가중 랜덤으로 고른다
 * (나머지 1명은 교사 직접 선택). rng 를 주입해 결정론적으로 테스트한다.
 *
 * 가중치 = (최대기록수 − 본인기록수 + 1) → 기록이 적을수록 가중치 ↑(항상 ≥1).
 */
export interface RecordCountItem {
  id: string;
  recordCount: number;
}

/** 각 후보의 선택 가중치. */
export function selectionWeights(
  students: RecordCountItem[],
): { id: string; weight: number }[] {
  if (students.length === 0) return [];
  const max = Math.max(...students.map((s) => s.recordCount));
  return students.map((s) => ({
    id: s.id,
    weight: max - s.recordCount + 1,
  }));
}

/**
 * 기록 최소 우선 가중 랜덤으로 1명 선택. rng()=[0,1).
 * 후보가 없으면 null. exclude 로 이미 선택된(직접 선택) 학생 제외 가능.
 */
export function weightedPickLeastRecorded(
  students: RecordCountItem[],
  rng: () => number = Math.random,
  exclude: readonly string[] = [],
): string | null {
  const pool = students.filter((s) => !exclude.includes(s.id));
  if (pool.length === 0) return null;

  const weights = selectionWeights(pool);
  const total = weights.reduce((acc, w) => acc + w.weight, 0);
  let threshold = rng() * total;
  for (const w of weights) {
    threshold -= w.weight;
    if (threshold < 0) return w.id;
  }
  // 부동소수 누적 오차 보호: 마지막 후보 반환.
  return weights[weights.length - 1].id;
}

/**
 * 강제 팝업 넛지 조립 (계획 §3.4 nudgeEngine, AC-C / QC v4 AC-7.2~7.5).
 *
 * 4종 넛지를 결정론적으로 조립한다(clock·rng 주입). DB 조회는 상위(queries)에서
 * 하고, 이 함수는 순수 규칙만 적용한다.
 * ① 미기록 수업: **오늘 진행하는 분반 수업당 1개**. 각 분반에서 관찰 부족 학생 우선
 *    가중랜덤으로 1명 확정. 이미 오늘 관찰이 기록된 분반은 상위에서 제외하여 전달한다
 *    (resolved-on-record). (AC-7.2/7.4)
 * ② 행특: 오늘 행특 미작성 학생이 있으면 **종일**(16시 게이트 제거, AC-7.5).
 * ④ 미제출 신고서: 티어별 집계.
 * (③ 동아리 활동일 −7d 넛지는 동아리 데이터 도입 후 — 입력 없으면 미노출.)
 */
import type { ReportTier } from "./types";

/** 오늘 진행하는 한 분반 수업 + 그 분반 수강생의 관찰 기록수(가중랜덤 입력). */
export interface SectionObservationInput {
  /** 분반 식별 키(sectionId). 넛지 해결·딥링크용. */
  sectionKey: string;
  /** 화면 표시용 라벨(예: "수학 3-1"). */
  sectionLabel: string;
  /** 이 분반 수강생들의 관찰 기록수(0건 포함). 비면 추천 후보 없음. */
  studentCounts: RecordCountItem[];
  /** id→표시명(학번 이름) 매핑(선택). 추천 학생명 표기에 사용. */
  studentNames?: Record<string, string>;
}

/**
 * 예약 슬롯 시각이 경과했으나 상담일지(createCounselingLog)가 아직 작성되지 않은
 * 예약(QC v5 c8 AC-8.1). 상담실 딥링크로 작성을 유도한다.
 */
export interface PendingCounselLogInput {
  reservationId: string;
  studentYearId: string;
  studentLabel: string;
  /** 예약 슬롯 날짜(YYYY-MM-DD). 경과 판정은 상위 쿼리에서 clock 기준으로 끝낸 뒤 전달. */
  date: string;
}

export interface NudgeInput {
  /** 오늘 진행하는 분반 수업 목록(이미 관찰된 분반은 상위에서 제외). */
  sectionObservations: SectionObservationInput[];
  /** 오늘 행특 미작성 학생 id. */
  behaviorPendingStudentIds: readonly string[];
  /**
   * 담임반 학생별 행동특성 누적 기록수(가중랜덤 입력, QC v6 ⑥). 기록이 적은 학생일수록
   * 가중치 ↑ → 누적되면 골고루 기록. 미전달 시 추천 학생 없이 pendingCount만 노출.
   */
  behaviorStudentCounts?: readonly RecordCountItem[];
  /** id→표시명(학번 이름). 추천 학생명 표기용(선택). */
  behaviorStudentNames?: Record<string, string>;
  /** 미제출 신고서 각각의 현재 티어. */
  pendingReportTiers: readonly ReportTier[];
  /** 시각 경과 + 상담일지 미작성 예약(c8). 미전달 시 빈 배열로 취급. */
  pendingCounselLogs?: readonly PendingCounselLogInput[];
}

/** 분반 수업당 1개의 교과 관찰 넛지(추천 1명 확정). */
export interface UnrecordedObservationNudge {
  sectionKey: string;
  sectionLabel: string;
  suggestedStudentId: string;
  suggestedStudentName?: string;
  candidateCount: number;
}

/** 시각 경과 + 상담일지 미작성 예약 1건(c8 AC-8.1). */
export interface PendingCounselLogNudge {
  reservationId: string;
  studentYearId: string;
  studentLabel: string;
  date: string;
}

export interface NudgeResult {
  /** 오늘 분반 수업당 1개의 교과 관찰 넛지(AC-7.2). 빈 배열이면 없음. */
  unrecordedObservations: UnrecordedObservationNudge[];
  /**
   * 행동특성 넛지(QC v6 ⑥). pendingCount=오늘 미작성 학생 수. suggestedStudentId=
   * 누적 기록 적은 학생 우선 가중랜덤 1명(딥링크 사전선택용, 입력 없으면 null).
   */
  behaviorNotes: {
    pendingCount: number;
    suggestedStudentId: string | null;
    suggestedStudentName?: string;
  } | null;
  pendingReports: {
    total: number;
    warning: number;
    critical: number;
  } | null;
  /** 시각 경과 + 상담일지 미작성 예약(c8 AC-8.1). 빈 배열이면 없음. */
  pendingCounselLogs: PendingCounselLogNudge[];
  /** 노출할 넛지가 하나라도 있으면 true. */
  hasAny: boolean;
}

export interface NudgeOptions {
  now?: Date;
  rng?: () => number;
}

export function assembleNudges(
  input: NudgeInput,
  options: NudgeOptions = {},
): NudgeResult {
  const rng = options.rng ?? Math.random;

  // ① 오늘 분반 수업당 1개 — 관찰 부족 학생 우선 가중랜덤 1명 확정(AC-7.2).
  const unrecordedObservations: UnrecordedObservationNudge[] = [];
  for (const sec of input.sectionObservations) {
    if (sec.studentCounts.length === 0) continue;
    const suggested = weightedPickLeastRecorded(sec.studentCounts, rng);
    if (suggested === null) continue;
    unrecordedObservations.push({
      sectionKey: sec.sectionKey,
      sectionLabel: sec.sectionLabel,
      suggestedStudentId: suggested,
      suggestedStudentName: sec.studentNames?.[suggested],
      candidateCount: sec.studentCounts.length,
    });
  }

  // ② 행특 미작성 — 종일 표시(16시 게이트 제거, AC-7.5). QC v6 ⑥: 누적 기록 적은
  //    담임반 학생 1명을 가중랜덤으로 추천(관찰 넛지와 동일 메커니즘, 별도 카운트).
  const behaviorPick =
    input.behaviorPendingStudentIds.length > 0
      ? weightedPickLeastRecorded([...(input.behaviorStudentCounts ?? [])], rng)
      : null;
  const behaviorNotes =
    input.behaviorPendingStudentIds.length > 0
      ? {
          pendingCount: input.behaviorPendingStudentIds.length,
          suggestedStudentId: behaviorPick,
          suggestedStudentName: behaviorPick
            ? input.behaviorStudentNames?.[behaviorPick]
            : undefined,
        }
      : null;

  // ④ 미제출 신고서 티어별 집계
  const tiers = input.pendingReportTiers;
  const pendingReports =
    tiers.length > 0
      ? {
          total: tiers.length,
          warning: tiers.filter((t) => t === "warning").length,
          critical: tiers.filter((t) => t === "critical").length,
        }
      : null;

  // ⑤ 시각 경과 + 상담일지 미작성 예약(c8 AC-8.1). 경과 판정은 상위(쿼리)에서
  //    clock 기준으로 끝낸 입력만 전달되므로 여기서는 그대로 매핑한다(순수 규칙).
  const pendingCounselLogs: PendingCounselLogNudge[] = (
    input.pendingCounselLogs ?? []
  ).map((c) => ({
    reservationId: c.reservationId,
    studentYearId: c.studentYearId,
    studentLabel: c.studentLabel,
    date: c.date,
  }));

  return {
    unrecordedObservations,
    behaviorNotes,
    pendingReports,
    pendingCounselLogs,
    hasAny: Boolean(
      unrecordedObservations.length > 0 ||
        behaviorNotes ||
        pendingReports ||
        pendingCounselLogs.length > 0,
    ),
  };
}
