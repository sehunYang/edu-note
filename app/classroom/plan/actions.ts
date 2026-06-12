"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  upsertLessonPlanEntry,
  deleteLessonPlanEntry,
  writeAudit,
} from "@/lib/db/queries";

/**
 * 수업 계획실 서버액션 (교실 2-2 단계2). getOwnerId 가드 + 페이지범위 revalidate + audit.
 * 핵심개념(keywords)은 콤마/공백 구분 입력을 배열로 정규화한다.
 */
function parseKeywords(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((k) => k.replace(/^#/, "").trim())
    .filter((k) => k.length > 0);
}

export async function saveLessonPlanAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const ordinal = Number(formData.get("ordinal"));
  const content = String(formData.get("content") ?? "");
  const keywords = parseKeywords(String(formData.get("keywords") ?? ""));
  if (!subjectId || !Number.isInteger(ordinal) || ordinal < 1) return;

  const db = getDb();
  await upsertLessonPlanEntry(db, ownerId, subjectId, ordinal, {
    content,
    keywords,
  });
  await writeAudit(db, ownerId, "lesson_plan_save", subjectId, {
    ordinal,
    keywords: keywords.length,
  });
  revalidatePath("/classroom/plan");
}

export async function deleteLessonPlanEntryAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const ordinal = Number(formData.get("ordinal"));
  if (!subjectId || !Number.isInteger(ordinal) || ordinal < 1) return;

  const db = getDb();
  await deleteLessonPlanEntry(db, ownerId, subjectId, ordinal);
  await writeAudit(db, ownerId, "lesson_plan_save", subjectId, {
    ordinal,
    deleted: true,
  });
  revalidatePath("/classroom/plan");
}
