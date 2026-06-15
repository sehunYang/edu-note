/**
 * 진척도(진도율) 도메인 (교실 진척도, QC v4 US-3). 순수 함수(네트워크·DB 없음).
 *
 * 진도율은 **둘 다 차시(ordinal) 수 기준**(스펙 R4, 날짜 환산 금지).
 *  - 목표 진도율 = 계획상 오늘까지 진행했어야 할 차시 ÷ 시험목표 총 차시 (AC-2.4)
 *  - 실제 진도율 = 실제 진행(done) 차시 ÷ 시험목표 총 차시 (AC-2.4)
 * 색상은 실제가 계획보다 2차시 이상 뒤지면 빨강, 그 미만이면 초록 (AC-2.5).
 * 결정론·타임존 무관(차시 카운트만 사용).
 */

/** 진도율 계산 입력(전부 차시 수). */
export interface ProgressRateInput {
  /** 계획상 오늘까지 진행했어야 할 차시 수. */
  plannedOrdinalsToToday: number;
  /** 실제 진행(done)된 차시 수. */
  actualDoneOrdinals: number;
  /** 시험목표 총 차시 수(분모). 0이면 0으로 가드. */
  examTargetTotalOrdinals: number;
}

/** 목표·실제 진도율(0..1). */
export interface ProgressRates {
  targetRate: number;
  actualRate: number;
}

/**
 * 목표·실제 진도율 산출(AC-2.4). 분모(시험목표 총 차시)가 0 이하면 0으로 가드한다.
 * 반환값은 0..1 비율(퍼센트 변환은 UI 책임).
 */
export function computeProgressRates({
  plannedOrdinalsToToday,
  actualDoneOrdinals,
  examTargetTotalOrdinals,
}: ProgressRateInput): ProgressRates {
  if (examTargetTotalOrdinals <= 0) {
    return { targetRate: 0, actualRate: 0 };
  }
  return {
    targetRate: plannedOrdinalsToToday / examTargetTotalOrdinals,
    actualRate: actualDoneOrdinals / examTargetTotalOrdinals,
  };
}

/** 진척도 색상(초록/빨강). */
export type ProgressColor = "green" | "red";

/**
 * 진척도 색상 판정(AC-2.5). 실제가 계획보다 2차시 이상 뒤지면 빨강, 그 미만이면 초록.
 * 즉 (계획 − 실제) >= 2 → 빨강. 앞서가거나 1차시 뒤짐 → 초록.
 */
export function progressColor({
  plannedOrdinalsToToday,
  actualDoneOrdinals,
}: {
  plannedOrdinalsToToday: number;
  actualDoneOrdinals: number;
}): ProgressColor {
  return plannedOrdinalsToToday - actualDoneOrdinals >= 2 ? "red" : "green";
}
