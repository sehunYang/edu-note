"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  createCounselingLog,
  deleteCounselingLog,
  writeAudit,
  type CounselTarget,
} from "@/lib/db/queries";

/**
 * 상담일지 서버액션 (계획 §4 Phase2-G). getOwnerId 가드 + audit.
 * 상담 본문은 민감 정보이므로 audit detail 에는 본문을 남기지 않는다.
 */
const VALID_TARGETS: readonly CounselTarget[] = ["student", "parent"];

export async function createCounselingAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const studentYearId = String(formData.get("studentYearId") ?? "").trim();
  const target = String(formData.get("target") ?? "") as CounselTarget;
  const date =
    String(formData.get("date") ?? "").trim() ||
    new Date().toISOString().slice(0, 10);
  const body = String(formData.get("body") ?? "").trim();
  if (!studentYearId || !VALID_TARGETS.includes(target) || !body) return;

  const db = getDb();
  const row = await createCounselingLog(db, ownerId, {
    studentYearId,
    date,
    target,
    body,
  });
  // 본문(민감)은 audit 에 미기록 — 메타데이터만.
  await writeAudit(db, ownerId, "counseling_create", row.id, {
    studentYearId,
    target,
    date,
  });
  revalidatePath("/counsel");
}

export async function deleteCounselingAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const db = getDb();
  await deleteCounselingLog(db, ownerId, id);
  await writeAudit(db, ownerId, "counseling_delete", id);
  revalidatePath("/counsel");
}
