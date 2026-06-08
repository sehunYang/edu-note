/**
 * 도메인 규칙에서 쓰는 리터럴 타입 (DB enum 과 동일한 ascii 식별자).
 * 순수 모듈이라 drizzle 에 의존하지 않고 자체 정의한다.
 */
export type SpecialNoteType =
  | "autonomy"
  | "club"
  | "career"
  | "subject"
  | "behavior";

export type AttendanceReason = "illness" | "accepted" | "unaccepted" | "etc";
export type AttendanceKind = "late" | "early_leave" | "absent_period" | "absent";

export type ReportTier = "normal" | "warning" | "critical";

export type ActivityTag = "autonomy" | "career" | "both";
export type ActivityPlacement = "autonomy" | "career";

export type EvalMethod = "rel_abs" | "abs" | "ach3";

export type SessionStatus = "planned" | "done" | "not_held";
