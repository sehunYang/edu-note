"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  getOwnerClub,
  reconcileClubActivitySessions,
  updateClubActivityPlan,
  writeAudit,
} from "@/lib/db/queries";

/**
 * 활동 계획 서버액션 (QC v5 c9 D.4, AC-9.5). 차시 동기화(club 캘린더 이벤트 →
 * (clubId,date) 키 upsert, plannedActivity 보존) + 차시별 예정활동 저장.
 * getOwnerId 가드 + audit + revalidate.
 */

export async function reconcileAction(): Promise<void> {
  const ownerId = await getOwnerId();
  const db = getDb();
  const club = await getOwnerClub(db, ownerId);
  if (!club) return;
  await reconcileClubActivitySessions(db, ownerId, club.id);
  await writeAudit(db, ownerId, "club_plan_reconcile", club.id);
  revalidatePath("/clubroom/plan");
}

export async function updatePlanAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  if (!sessionId) return;
  const plannedActivity =
    String(formData.get("plannedActivity") ?? "").trim() || null;
  const db = getDb();
  await updateClubActivityPlan(db, ownerId, sessionId, plannedActivity);
  await writeAudit(db, ownerId, "club_plan_update", sessionId);
  revalidatePath("/clubroom/plan");
}
