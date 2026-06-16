"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  addClubMember,
  removeClubMember,
  getOwnerClub,
  writeAudit,
} from "@/lib/db/queries";

/**
 * 부원 배정 서버액션 (QC v5 c9 D.3, AC-9.4). 연도 전체 명단에서 선택한 학생을
 * 단일 동아리에 배정/제거한다. getOwnerId 가드 + 단일 동아리 확인 + audit +
 * revalidate. addClubMember 는 (club, student) 유니크로 멱등.
 */

export async function addClubMemberAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const raw = formData.get("studentYearIds");
  const studentYearIds: string[] =
    typeof raw === "string" && raw.trim()
      ? raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  if (studentYearIds.length === 0) return;

  const db = getDb();
  const club = await getOwnerClub(db, ownerId);
  if (!club) return;

  const ids: string[] = [];
  for (const studentYearId of studentYearIds) {
    const m = await addClubMember(db, ownerId, {
      clubId: club.id,
      studentYearId,
    });
    ids.push(m.id);
  }
  await writeAudit(db, ownerId, "club_member_add", club.id, {
    ids,
    studentYearIds,
  });
  revalidatePath("/clubroom/assign");
}

export async function removeClubMemberAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const memberId = String(formData.get("memberId") ?? "").trim();
  if (!memberId) return;
  const db = getDb();
  await removeClubMember(db, ownerId, memberId);
  await writeAudit(db, ownerId, "club_member_remove", memberId);
  revalidatePath("/clubroom/assign");
}
