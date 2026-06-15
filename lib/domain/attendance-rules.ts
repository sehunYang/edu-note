/**
 * 출결 신고서 필요 규칙 (QC v4 AC-4.1 — 판정기준 재정의).
 *
 * 신고서 필요 = (사유 질병 AND 종류 결석) OR (비고에 '생리통' 포함, 종류 무관).
 *  - 질병결석(illness+absent)만 신고서 필요. 질병의 지각/조퇴/결과는 불필요.
 *  - '생리통' 비고는 종류 무관 필요(의료성).
 *  - 미인정(무단)·인정·기타는 전부 불필요(기존 'absent 항상 필요' / '인정 항상 필요'
 *    규칙을 뒤집음 — QC v4 사용자 결정).
 *  - 교외체험학습은 별도(사후보고서) — 여기서 다루지 않음.
 *
 * 키워드/사유는 문자열 하드코딩 대신 상수 룰테이블로 고정.
 */
import type { AttendanceReason, AttendanceKind } from "./types";

/** 비고에 포함 시 신고서 필요한 키워드(의료성 사유, 종류 무관). */
export const REPORT_REQUIRED_NOTE_KEYWORDS: readonly string[] = ["생리통"];

/** 신고서 필요한 (사유, 종류) 조합 — 질병결석만. */
export const REPORT_REQUIRED_REASON: AttendanceReason = "illness";
export const REPORT_REQUIRED_KIND: AttendanceKind = "absent";

export interface AttendanceInput {
  kind: AttendanceKind;
  reason: AttendanceReason;
  noteField?: string | null;
}

export function isReportRequired({
  kind,
  reason,
  noteField,
}: AttendanceInput): boolean {
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
