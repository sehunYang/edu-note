"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  addBehaviorNote,
  updateBehaviorNote,
  deleteBehaviorNote,
  listHomeroomStudents,
  writeAudit,
} from "@/lib/db/queries";
import { activeSchoolYear } from "@/lib/domain/school-year";

/**
 * 행동특성 기록 서버액션 (교실 2-2 단계5 인접보정). getOwnerId 가드 + 페이지범위
 * revalidate + audit. 학생은 **담임반 학생만** 허용(listHomeroomStudents 멤버십 검증) —
 * 담임 외 학생 기록 거부(AC-O6). 키워드는 콤마 구분 입력을 배열로 정규화한다(공백은
 * 구분자가 아니므로 "운동 에너지" 처럼 공백 포함 키워드도 하나로 유지된다).
 */
function parseKeywords(raw: string): string[] {
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/** 담임반 멤버십 검증(담임 외 학생 거부). */
async function assertHomeroomMember(
  db: ReturnType<typeof getDb>,
  ownerId: string,
  studentYearId: string,
): Promise<boolean> {
  const year = activeSchoolYear(new Date());
  const members = await listHomeroomStudents(db, ownerId, year);
  return members.some((m) => m.id === studentYearId);
}

export async function addBehaviorNoteAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const studentYearId = String(formData.get("studentYearId") ?? "").trim();
  const notedOn = String(formData.get("notedOn") ?? "").trim() || undefined;
  const body = String(formData.get("body") ?? "").trim();
  const keywords = parseKeywords(String(formData.get("keywords") ?? ""));
  if (!studentYearId || !body) return;

  const db = getDb();
  if (!(await assertHomeroomMember(db, ownerId, studentYearId))) {
    throw new Error("담임반 학생만 행동특성을 기록할 수 있습니다.");
  }
  const row = await addBehaviorNote(db, ownerId, {
    studentYearId,
    notedOn,
    body,
    keywords,
  });
  await writeAudit(db, ownerId, "behavior_note_create", row.id, { studentYearId });
  revalidatePath("/homeroom/behavior");
}

export async function updateBehaviorNoteAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  const notedOn = String(formData.get("notedOn") ?? "").trim() || undefined;
  const body = String(formData.get("body") ?? "").trim();
  const keywords = parseKeywords(String(formData.get("keywords") ?? ""));
  if (!id || !body) return;

  const db = getDb();
  await updateBehaviorNote(db, ownerId, id, { body, keywords, notedOn });
  await writeAudit(db, ownerId, "behavior_note_update", id, null);
  revalidatePath("/homeroom/behavior");
}

export async function deleteBehaviorNoteAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const db = getDb();
  await deleteBehaviorNote(db, ownerId, id);
  await writeAudit(db, ownerId, "behavior_note_delete", id, null);
  revalidatePath("/homeroom/behavior");
}
