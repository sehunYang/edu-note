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
 * 미제출 화면 티어. DB report_tier(3단)와 달리 마감 경과 = 제출불가(expired)를
 * 별도 상태로 가진다 — 결석계는 마감(5수업일)을 넘기면 미인정 전환 대상이라
 * "심각"으로 계속 보여줄 일이 아니라 제출 자체가 불가하기 때문.
 */
export type SubmissionTier = ReportTier | "expired";

/**
 * 남은 수업일 수 → 제출 티어. 결석계 마감이 사건 후 5수업일이므로, 경과 수업일로
 * 읽으면 1·2일째=정상, 3일째=위험, 4·5일째=심각, 5일 초과=제출불가다.
 * ≥3 → normal, 2 → warning, 1~0 → critical, <0 → expired.
 */
export function submissionTier(remainingSchoolDays: number): SubmissionTier {
  if (remainingSchoolDays >= 3) return "normal";
  if (remainingSchoolDays >= 2) return "warning";
  if (remainingSchoolDays >= 0) return "critical";
  return "expired";
}
