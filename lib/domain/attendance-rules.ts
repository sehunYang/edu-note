/**
 * 출결 신고서 필요 규칙 (계획 §3.4 attendanceRules, AC-F).
 *
 * - 결석(absent) = 항상 신고서 필요.
 * - 조퇴/지각/결과(early_leave/late/absent_period) = 사유가 '인정'이거나
 *   비고(note_field)에 '생리통' 키워드가 포함될 때만.
 * - 교외체험학습은 별도(사후보고서) — 여기서 다루지 않음.
 *
 * 키워드/사유는 문자열 하드코딩 대신 상수 룰테이블로 고정.
 */
import type { AttendanceReason, AttendanceKind } from "./types";

/** 인정 사유는 신고서 필요. */
export const REPORT_REQUIRED_REASONS: readonly AttendanceReason[] = ["accepted"];

/** 비고에 포함 시 신고서 필요한 키워드(의료성 사유). */
export const REPORT_REQUIRED_NOTE_KEYWORDS: readonly string[] = ["생리통"];

/** 성격상 무조건 신고서 필요. */
export const ALWAYS_REQUIRED_KINDS: readonly AttendanceKind[] = ["absent"];

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
  if (ALWAYS_REQUIRED_KINDS.includes(kind)) return true;
  if (REPORT_REQUIRED_REASONS.includes(reason)) return true;
  if (
    noteField &&
    REPORT_REQUIRED_NOTE_KEYWORDS.some((kw) => noteField.includes(kw))
  ) {
    return true;
  }
  return false;
}
