/**
 * 평가 비율 검증 (QC v1 C5, AC-5.x). 수행평가 비율들 + 지필(중간/기말)의 합이 정확히
 * 100 이어야 하고, 미시행 지필은 비율 0 강제, 수행평가는 최대 5개로 제한한다. 순수 함수.
 */
export interface EvalWeightInput {
  /** 각 수행평가 요소의 반영 비율(%). */
  performance: number[];
  jipilMid: number;
  jipilFinal: number;
  midEnabled: boolean;
  finalEnabled: boolean;
}

export interface EvalWeightValidation {
  ok: boolean;
  total: number;
  errors: string[];
}

const MAX_PERFORMANCE = 5;

export function validateEvalWeights(
  input: EvalWeightInput,
): EvalWeightValidation {
  const { performance, jipilMid, jipilFinal, midEnabled, finalEnabled } = input;
  const errors: string[] = [];

  if (performance.length > MAX_PERFORMANCE) {
    errors.push(`수행평가는 최대 ${MAX_PERFORMANCE}개까지 가능합니다.`);
  }
  if (performance.some((w) => w < 0)) {
    errors.push("수행평가 비율은 음수일 수 없습니다.");
  }
  // 미시행 지필은 0 강제
  if (!midEnabled && jipilMid !== 0) {
    errors.push("미시행 중간지필의 비율은 0이어야 합니다.");
  }
  if (!finalEnabled && jipilFinal !== 0) {
    errors.push("미시행 기말지필의 비율은 0이어야 합니다.");
  }

  const total =
    performance.reduce((a, b) => a + b, 0) + jipilMid + jipilFinal;
  if (total !== 100) {
    errors.push(`반영 비율 합계가 100이 아닙니다(현재 ${total}).`);
  }

  return { ok: errors.length === 0, total, errors };
}
