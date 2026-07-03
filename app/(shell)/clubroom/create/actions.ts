"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import { createClub, deleteClub, getOwnerClub, writeAudit } from "@/lib/db/queries";

/**
 * 동아리 개설 서버액션 (QC v5 c9 D.2). 교사 단일 동아리 전제 — 이미 동아리가
 * 있으면 신규 생성을 막는다. getOwnerId 가드 + audit + revalidate.
 */

export async function createClubAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const db = getDb();
  // 단일 동아리 전제: 이미 있으면 무시(중복 개설 방지).
  const existing = await getOwnerClub(db, ownerId);
  if (existing) return;
  const club = await createClub(db, ownerId, name);
  await writeAudit(db, ownerId, "club_create", club.id, { name });
  revalidatePath("/clubroom/create");
}

export async function deleteClubAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const db = getDb();
  await deleteClub(db, ownerId, id);
  await writeAudit(db, ownerId, "club_delete", id);
  revalidatePath("/clubroom/create");
}
