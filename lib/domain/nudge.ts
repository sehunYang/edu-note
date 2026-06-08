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
 * 강제 팝업 넛지 조립 (계획 §3.4 nudgeEngine, AC-C).
 *
 * 4종 넛지를 결정론적으로 조립한다(clock·rng 주입). DB 조회는 상위(queries)에서
 * 하고, 이 함수는 순수 규칙만 적용한다.
 * ① 미기록 수업: 기록 최소 우선 가중랜덤 1명 추천(+ 직접 선택용 후보 수).
 * ② 16시 후 행특: 오늘 행특 미작성 학생이 있으면.
 * ④ 미제출 신고서: 티어별 집계.
 * (③ 동아리 활동일 −7d 넛지는 동아리 데이터 도입 후 — 입력 없으면 미노출.)
 */
import type { ReportTier } from "./types";

export interface NudgeInput {
  /** 관찰 기록수(넛지 가중랜덤 입력). 해당 연도 학생 전체(0건 포함). */
  observationCounts: RecordCountItem[];
  /** 이미 충분히 기록됐거나 직접 선택된 제외 대상. */
  excludeStudentIds?: readonly string[];
  /** 오늘 행특 미작성 학생 id. */
  behaviorPendingStudentIds: readonly string[];
  /** 미제출 신고서 각각의 현재 티어. */
  pendingReportTiers: readonly ReportTier[];
}

export interface NudgeResult {
  unrecordedObservation: {
    suggestedStudentId: string | null;
    candidateCount: number;
  } | null;
  behaviorNotes: { pendingCount: number } | null;
  pendingReports: {
    total: number;
    warning: number;
    critical: number;
  } | null;
  /** 노출할 넛지가 하나라도 있으면 true. */
  hasAny: boolean;
}

export interface NudgeOptions {
  now?: Date;
  rng?: () => number;
  /** 행특 넛지가 켜지는 시각(기본 16시). */
  behaviorHour?: number;
  /** 현재 '시'를 명시(서버 UTC→KST 변환 등). 주면 now.getHours() 대신 사용. */
  currentHour?: number;
}

export function assembleNudges(
  input: NudgeInput,
  options: NudgeOptions = {},
): NudgeResult {
  const now = options.now ?? new Date();
  const rng = options.rng ?? Math.random;
  const behaviorHour = options.behaviorHour ?? 16;
  const hour = options.currentHour ?? now.getHours();

  // ① 미기록 수업 추천 1명(가중랜덤) + 직접 선택용 후보 수
  const exclude = input.excludeStudentIds ?? [];
  const pool = input.observationCounts.filter((s) => !exclude.includes(s.id));
  const suggested = weightedPickLeastRecorded(input.observationCounts, rng, exclude);
  const unrecordedObservation =
    pool.length > 0
      ? { suggestedStudentId: suggested, candidateCount: pool.length }
      : null;

  // ② 16시 후 행특 미작성
  const behaviorNotes =
    hour >= behaviorHour && input.behaviorPendingStudentIds.length > 0
      ? { pendingCount: input.behaviorPendingStudentIds.length }
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

  return {
    unrecordedObservation,
    behaviorNotes,
    pendingReports,
    hasAny: Boolean(unrecordedObservation || behaviorNotes || pendingReports),
  };
}
