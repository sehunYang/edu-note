/**
 * 출결 신고서 필요 규칙 (QC v4 AC-4.1 — 판정기준 재정의).
 *
 * 신고서 필요 = (사유 인정, 종류 무관 — 교외체험 자동 생성분 제외)
 *   OR (사유 질병 AND 종류 결석) OR (비고에 '생리통' 포함, 종류 무관).
 *  - 인정은 종류 무관 필요(0065 — QC v4 의 '인정 불필요'를 다시 뒤집은 사용자 결정).
 *  - 교외체험이 만든 인정결석은 체험 1건당 사후보고서로 받으므로 날짜별 신고서는 없음.
 *  - 질병은 결석만 필요. 질병의 지각/조퇴/결과는 불필요.
 *  - '생리통' 비고는 종류 무관 필요(의료성).
 *  - 미인정(무단)·기타는 불필요.
 *
 * 키워드/사유는 문자열 하드코딩 대신 상수 룰테이블로 고정.
 */
import type { AttendanceReason, AttendanceKind } from "./types";

/** 비고에 포함 시 신고서 필요한 키워드(의료성 사유, 종류 무관). */
export const REPORT_REQUIRED_NOTE_KEYWORDS: readonly string[] = ["생리통"];

/** 종류 무관 신고서 필요한 사유. */
export const REPORT_REQUIRED_ANY_KIND_REASON: AttendanceReason = "accepted";

/** 신고서 필요한 (사유, 종류) 조합 — 질병결석. */
export const REPORT_REQUIRED_REASON: AttendanceReason = "illness";
export const REPORT_REQUIRED_KIND: AttendanceKind = "absent";

export interface AttendanceInput {
  kind: AttendanceKind;
  reason: AttendanceReason;
  noteField?: string | null;
  /** 이 출결을 만든 교외체험(0064). 있으면 인정 사유의 서류는 사후보고서가 맡는다. */
  fieldTripId?: string | null;
}

export function isReportRequired({
  kind,
  reason,
  noteField,
  fieldTripId,
}: AttendanceInput): boolean {
  // 인정 → 종류 무관 필요(교외체험 자동 생성분은 사후보고서로 받는다).
  if (reason === REPORT_REQUIRED_ANY_KIND_REASON && !fieldTripId) {
    return true;
  }
  // 질병결석 → 필요.
  if (reason === REPORT_REQUIRED_REASON && kind === REPORT_REQUIRED_KIND) {
    return true;
  }
  // 비고 '생리통' → 종류 무관 필요.
  if (
    noteField &&
    REPORT_REQUIRED_NOTE_KEYWORDS.some((kw) => noteField.includes(kw))
  ) {
    return true;
  }
  return false;
}
