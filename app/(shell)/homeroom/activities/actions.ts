"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  bulkCreateStudentActivityEntries,
  updateStudentActivityEntry,
  deleteStudentActivityEntry,
  listHomeroomStudents,
  writeAudit,
} from "@/lib/db/queries";
import { activeSchoolYear } from "@/lib/domain/school-year";
import type { ActivityTag } from "@/lib/domain/types";

/**
 * 자율·진로활동 서버액션 (US-B11). getOwnerId 가드 + 담임반 멤버십 검증 +
 * revalidate + audit. 일괄 저장은 체크된 학생 수만큼 행 삽입.
 */

/** 담임반 멤버십 검증. */
async function assertHomeroomMembers(
  db: ReturnType<typeof getDb>,
  ownerId: string,
  studentYearIds: string[],
): Promise<boolean> {
  const year = activeSchoolYear(new Date());
  const members = await listHomeroomStudents(db, ownerId, year);
  const memberSet = new Set(members.map((m) => m.id));
  return studentYearIds.every((id) => memberSet.has(id));
}

function parseTag(raw: string): ActivityTag {
  if (raw === "career") return "career";
  if (raw === "both") return "both";
  return "autonomy";
}

/**
 * 일괄 저장 — 체크된 학생 목록 × body × tag. 학생 1명당 row 1개 삽입.
 * audit: activity_create (배치 id 목록을 detail 에 기록).
 */
export async function bulkSaveActivityAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const raw = formData.get("studentYearIds");
  const studentYearIds: string[] =
    typeof raw === "string" && raw.trim()
      ? raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  const body = String(formData.get("body") ?? "").trim();
  const tag = parseTag(String(formData.get("tag") ?? "autonomy"));
  if (studentYearIds.length === 0 || !body) return;

  const db = getDb();
  if (!(await assertHomeroomMembers(db, ownerId, studentYearIds))) {
    throw new Error("담임반 학생만 활동을 기입할 수 있습니다.");
  }
  const ids = await bulkCreateStudentActivityEntries(db, ownerId, studentYearIds, tag, body);
  await writeAudit(db, ownerId, "activity_create", null, { ids, studentYearIds });
  revalidatePath("/homeroom/activities");
}

/** 활동 기입 수정. */
export async function updateActivityAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const tagRaw = String(formData.get("tag") ?? "").trim();
  if (!id || !body) return;

  const db = getDb();
  await updateStudentActivityEntry(db, ownerId, id, {
    body,
    tag: tagRaw ? parseTag(tagRaw) : undefined,
  });
  await writeAudit(db, ownerId, "activity_update", id, null);
  revalidatePath("/homeroom/activities");
}

/** 활동 기입 삭제. */
export async function deleteActivityAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const db = getDb();
  await deleteStudentActivityEntry(db, ownerId, id);
  await writeAudit(db, ownerId, "activity_delete", id, null);
  revalidatePath("/homeroom/activities");
}
