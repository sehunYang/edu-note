"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  addSubjectObservation,
  addBehaviorNote,
  writeAudit,
} from "@/lib/db/queries";

/**
 * 관찰/행특 기록 서버액션 (계획 §4 C). getOwnerId 가드 + audit.
 * 키워드는 콤마 구분 입력을 배열로 정규화한다(공백은 구분자가 아니므로 공백 포함
 * 키워드도 하나로 유지된다).
 */
function parseKeywords(raw: string): string[] {
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

export async function addObservationAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const studentYearId = String(formData.get("studentYearId") ?? "").trim();
  const sectionId = String(formData.get("sectionId") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "").trim();
  const keywords = parseKeywords(String(formData.get("keywords") ?? ""));
  if (!studentYearId || !body) return;

  const db = getDb();
  const row = await addSubjectObservation(db, ownerId, {
    studentYearId,
    sectionId,
    body,
    keywords,
  });
  await writeAudit(db, ownerId, "observation_create", row.id, {
    studentYearId,
    sectionId,
  });
  revalidatePath("/observations");
}

export async function addBehaviorNoteAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const studentYearId = String(formData.get("studentYearId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const keywords = parseKeywords(String(formData.get("keywords") ?? ""));
  if (!studentYearId || !body) return;

  const db = getDb();
  const row = await addBehaviorNote(db, ownerId, {
    studentYearId,
    body,
    keywords,
  });
  await writeAudit(db, ownerId, "behavior_note_create", row.id, { studentYearId });
  revalidatePath("/observations");
}
