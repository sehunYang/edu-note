"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  createClub,
  deleteClub,
  addClubMember,
  removeClubMember,
  writeAudit,
} from "@/lib/db/queries";

/**
 * 동아리 서버액션 (계획 §4 Phase2-D). 전부 getOwnerId 가드 + audit.
 */

export async function createClubAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const db = getDb();
  const club = await createClub(db, ownerId, name);
  await writeAudit(db, ownerId, "club_create", club.id, { name });
  revalidatePath("/club");
}

export async function deleteClubAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const db = getDb();
  await deleteClub(db, ownerId, id);
  await writeAudit(db, ownerId, "club_delete", id);
  revalidatePath("/club");
}

export async function addMemberAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const clubId = String(formData.get("clubId") ?? "").trim();
  const studentYearId = String(formData.get("studentYearId") ?? "").trim();
  const desiredCareer =
    String(formData.get("desiredCareer") ?? "").trim() || null;
  if (!clubId || !studentYearId) return;
  const db = getDb();
  const m = await addClubMember(db, ownerId, {
    clubId,
    studentYearId,
    desiredCareer,
  });
  await writeAudit(db, ownerId, "club_member_add", m.id, {
    clubId,
    studentYearId,
  });
  revalidatePath("/club");
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const memberId = String(formData.get("memberId") ?? "").trim();
  if (!memberId) return;
  const db = getDb();
  await removeClubMember(db, ownerId, memberId);
  await writeAudit(db, ownerId, "club_member_remove", memberId);
  revalidatePath("/club");
}
