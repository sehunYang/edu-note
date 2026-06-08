"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  setPublicNotice,
  addNoticeEvent,
  deleteNoticeEvent,
  writeAudit,
} from "@/lib/db/queries";

/**
 * 공지실 서버액션 (계획 §4 Phase2-I). getOwnerId 가드 + audit.
 * 여기서 설정한 공통 한마디·할일은 모든 학생 공개 페이지의 allowlist DTO 로 노출된다.
 */

export async function setNoticeAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const notice = String(formData.get("notice") ?? "");
  const db = getDb();
  await setPublicNotice(db, ownerId, notice);
  await writeAudit(db, ownerId, "notice_upsert", null, {
    kind: "common_notice",
  });
  revalidatePath("/notice");
}

export async function addNoticeEventAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const date = String(formData.get("date") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!date || !title) return;
  const db = getDb();
  const e = await addNoticeEvent(db, ownerId, date, title);
  await writeAudit(db, ownerId, "notice_upsert", e.id, { date });
  revalidatePath("/notice");
}

export async function deleteNoticeEventAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const db = getDb();
  await deleteNoticeEvent(db, ownerId, id);
  await writeAudit(db, ownerId, "notice_delete", id);
  revalidatePath("/notice");
}
