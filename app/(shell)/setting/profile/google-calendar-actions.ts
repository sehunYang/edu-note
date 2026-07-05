"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import { getGoogleConnection, deleteGoogleConnection } from "@/lib/db/queries";

/**
 * 세팅실 프로필 "구글 캘린더" 카드용 서버액션(계획 6단계). 연결 상태 조회는
 * `{connected, lastError}` 만 반환 — 토큰 원문·암호문은 절대 클라이언트로 내려가지 않는다(AC-8).
 */
export async function getGoogleConnectionStatusAction(): Promise<{
  connected: boolean;
  lastError: string | null;
}> {
  const ownerId = await getOwnerId();
  const db = getDb();
  const row = await getGoogleConnection(db, ownerId);
  return { connected: !!row, lastError: row?.lastError ?? null };
}

export async function disconnectGoogleAction(): Promise<void> {
  const ownerId = await getOwnerId();
  const db = getDb();
  await deleteGoogleConnection(db, ownerId);
  revalidatePath("/setting/profile");
}
