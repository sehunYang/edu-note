"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  getOwnerClub,
  listClubMembers,
  saveClubRecordDraft,
  writeAudit,
} from "@/lib/db/queries";

/**
 * 생기부 작성 서버액션 (QC v5 c9 D.6, AC-9.7). 부원별 동아리 생기부 초안 1건 저장
 * (specialNoteDrafts type='club', byteLimit=3000). getOwnerId 가드 + 부원 멤버십
 * 검증 + audit + revalidate.
 */
export async function saveRecordDraftAction(
  input: { studentYearId: string; content: string },
): Promise<{ ok: true; byteCount: number; byteLimit: number } | { ok: false; message: string }> {
  const ownerId = await getOwnerId();
  const studentYearId = input.studentYearId.trim();
  const content = input.content;
  if (!studentYearId || !content.trim()) {
    return { ok: false, message: "내용이 비어 있습니다." };
  }
  const db = getDb();
  const club = await getOwnerClub(db, ownerId);
  if (!club) return { ok: false, message: "동아리가 없습니다." };
  const members = await listClubMembers(db, ownerId, club.id);
  if (!members.some((m) => m.studentYearId === studentYearId)) {
    return { ok: false, message: "부원만 생기부를 작성할 수 있습니다." };
  }
  try {
    const r = await saveClubRecordDraft(db, ownerId, studentYearId, content);
    await writeAudit(db, ownerId, "club_record_save", r.id, { studentYearId });
    revalidatePath("/clubroom/record");
    return { ok: true, byteCount: r.byteCount, byteLimit: r.byteLimit };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "저장 실패" };
  }
}
