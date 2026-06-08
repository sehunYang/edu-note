/**
 * 평가방식별 표기 (계획 §3.4 evalMethodDisplay, AC-K).
 *
 * 상대위치 표기 = 석차 + 등급(2022개정 5등급) + 성취도(A~E). 단, 과목 평가방식에
 * 따라 표기 항목이 달라진다(석차등급 산출 여부).
 *  - rel_abs(상대+절대): 석차·5등급·성취도 모두.
 *  - abs(절대만): 석차/등급 없음, 성취도(A~E)만.
 *  - ach3(성취도 3단계): 성취도(A~C)만.
 */
import type { EvalMethod } from "./types";

export interface EvalDisplay {
  showRank: boolean;
  showGrade5: boolean;
  showAchievement: boolean;
  /** 성취도 단계 수(A~E=5, A~C=3). showAchievement=false 면 0. */
  achievementLevels: 0 | 3 | 5;
}

const TABLE: Record<EvalMethod, EvalDisplay> = {
  rel_abs: {
    showRank: true,
    showGrade5: true,
    showAchievement: true,
    achievementLevels: 5,
  },
  abs: {
    showRank: false,
    showGrade5: false,
    showAchievement: true,
    achievementLevels: 5,
  },
  ach3: {
    showRank: false,
    showGrade5: false,
    showAchievement: true,
    achievementLevels: 3,
  },
};

export function evalMethodDisplay(method: EvalMethod): EvalDisplay {
  return TABLE[method];
}
