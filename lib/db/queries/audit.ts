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
  | "public_message_set";

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
