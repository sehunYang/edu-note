"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  createStudentActivityEntry,
  deleteStudentActivityEntry,
  writeAudit,
} from "@/lib/db/queries";
import type { ActivityTag } from "@/lib/domain/types";

/**
 * 학생 활동 기입 서버액션 (계획 §4 C, AC-E). getOwnerId 가드 + audit.
 * tag=both 는 쿼리 계층에서 placement 1곳으로 확정된다.
 */
const VALID_TAGS: readonly ActivityTag[] = ["autonomy", "career", "both"];

export async function createActivityAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const studentYearId = String(formData.get("studentYearId") ?? "").trim();
  const tag = String(formData.get("tag") ?? "") as ActivityTag;
  const body = String(formData.get("body") ?? "").trim();
  if (!studentYearId || !VALID_TAGS.includes(tag) || !body) return;

  const db = getDb();
  const row = await createStudentActivityEntry(db, ownerId, {
    studentYearId,
    tag,
    body,
  });
  await writeAudit(db, ownerId, "activity_create", row.id, {
    studentYearId,
    tag,
    placement: row.placement,
  });
  revalidatePath("/activities");
}

export async function deleteActivityAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const db = getDb();
  await deleteStudentActivityEntry(db, ownerId, id);
  revalidatePath("/activities");
}
