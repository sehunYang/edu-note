import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { auditLog } from "../schema/misc";

/**
 * 감사 로그 기록 (계획 §3.2 audit_log — 공개접근·AI생성·CSV임포트·토큰발급/폐기·
 * 에스컬레이션 전이·동기화 성공/실패). 모든 owner-scoped 쓰기 경로에서 호출.
 */
type DB = PostgresJsDatabase<typeof schema>;

export type AuditEvent =
  | "csv_import"
  | "token_issue"
  | "token_revoke"
  | "token_reissue"
  | "public_access"
  | "setech_generate"
  | "setech_save"
  | "escalation_transition"
  | "escalation_recompute"
  | "sync_comcigan"
  | "sync_neis"
  | "session_generate"
  | "activity_create"
  | "activity_update"
  | "activity_delete"
  | "observation_create"
  | "behavior_note_create"
  | "attendance_record"
  | "report_submit"
  | "field_trip_record"
  | "backup_export"
  | "club_create"
  | "club_delete"
  | "club_member_add"
  | "club_member_remove"
  | "counseling_create"
  | "counseling_delete"
  | "task_upsert"
  | "task_delete"
  | "budget_upsert"
  | "budget_delete"
  | "expense_add"
  | "expense_delete"
  | "notice_upsert"
  | "notice_delete"
  | "public_message_set"
  // QC v1 세팅실
  | "setup_stage_complete"
  | "setup_stage_reopen"
  | "year_delete"
  | "profile_upsert"
  | "calendar_attr_update"
  | "inheritance_resolve"
  | "homeroom_role_upsert"
  | "homeroom_role_delete"
  | "eval_weights_save"
  | "enrollment_bulk"
  | "section_role_upsert"
  | "section_role_delete"
  | "subject_exam_materialize"
  // QC v2 세팅실 재수정 (2-1)
  | "calendar_bulk_save"
  | "enrollment_add"
  | "enrollment_remove"
  | "student_delete"
  | "student_update"
  // QC v2 교실 허브 (2-2)
  | "lesson_plan_save"
  | "progress_record"
  | "grade_upload"
  | "setech_bulk_export"
  | "setech_bulk_import"
  | "observation_update"
  | "observation_delete"
  | "behavior_note_update"
  | "behavior_note_delete"
  // QC v3 세특 추가입력 CRUD
  | "extra_note_save"
  | "extra_note_update"
  | "extra_note_delete"
  // QC v3 Part B (담임 교실 허브)
  | "attendance_period_record"
  | "counsel_slot_open"
  | "counsel_slot_close"
  | "counsel_reserve"
  | "counsel_cancel"
  | "counsel_cancel_request"
  | "counsel_cancel_approve"
  | "counsel_record_update"
  | "teacher_note_create"
  | "teacher_note_update"
  | "teacher_note_delete"
  | "fixed_class_save"
  | "elective_map_save"
  | "homeroom_record_save"
  | "homeroom_backfill"
  // QC v4 수업계획 학기계획 단계 (US-2)
  | "lesson_unit_save"
  | "lesson_unit_delete"
  | "exam_target_save"
  // QC v4 출결 (US-4)
  | "field_trip_add"
  | "attendance_update"
  // QC v4 공지실 (US-5)
  | "teacher_note_reorder";

export async function writeAudit(
  db: DB,
  ownerId: string,
  eventType: AuditEvent,
  ref?: string | null,
  detail?: Record<string, unknown> | null,
): Promise<void> {
  await db.insert(auditLog).values({
    ownerId,
    eventType,
    ref: ref ?? null,
    detail: detail ?? null,
  });
}
