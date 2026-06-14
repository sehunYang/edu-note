/**
 * 출결 교시 산정 + 제출 티어 (QC v3 Part B, AC-7.x). 순수 함수.
 *
 * - 교시 목록은 조회(roll-call)를 0교시로 표현하고, 1..N 교시가 뒤따른다.
 * - 지각(late): 조회(0)부터 기점(pivot)까지 포함.
 * - 조퇴(early_leave): 기점(pivot)부터 끝까지 포함.
 * - 결과(absent_period): 선택 교시 그대로(다중·비연속 허용).
 * - 결석(absent): 전체 교시 목록.
 *
 * 제출 티어는 '남은 수업일' 기준이다(경과 수업일이 아님).
 */
import type { AttendanceKind, ReportTier } from "./types";

/** 조회(roll-call)를 나타내는 교시 마커. */
export const ROLL_CALL_PERIOD = 0;

/** 출결 성격에 따라 영향받은 교시 배열을 산정한다. */
export function absentPeriods(
  kind: AttendanceKind,
  pivotPeriod: number,
  selectedPeriods: number[],
  periodList: number[],
): number[] {
  switch (kind) {
    case "late":
      // 조회(0)부터 기점까지 포함.
      return periodList.filter((p) => p <= pivotPeriod);
    case "early_leave":
      // 기점부터 끝까지 포함.
      return periodList.filter((p) => p >= pivotPeriod);
    case "absent_period":
      // 선택한 교시만(다중·비연속 허용), periodList 순서로 정규화.
      return periodList.filter((p) => selectedPeriods.includes(p));
    case "absent":
      // 전체 교시.
      return [...periodList];
    default:
      return [];
  }
}

/**
 * 남은 수업일 수 → 제출 티어.
 * ≥3 → normal, <3 && ≥0 → warning, <0 → critical.
 */
export function submissionTier(remainingSchoolDays: number): ReportTier {
  if (remainingSchoolDays >= 3) return "normal";
  if (remainingSchoolDays >= 0) return "warning";
  return "critical";
}
