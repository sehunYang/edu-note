"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  addSubjectObservation,
  updateSubjectObservation,
  deleteSubjectObservation,
  listStudentsBySection,
  listSectionsForStudent,
  writeAudit,
  type SectionStudentRow,
  type StudentSectionRow,
} from "@/lib/db/queries";
import { activeSchoolYear, activeSemester } from "@/lib/domain/school-year";

/**
 * 교과 관찰 서버액션 (교실 2-2 단계5). getOwnerId 가드 + 페이지범위 revalidate + audit.
 * 분반은 **필수**(addSubjectObservation 가 null 거부, AC-O1). 키워드는 콤마 구분
 * 입력을 배열로 정규화한다(공백은 구분자가 아니므로 공백 포함 키워드도 하나로 유지).
 * loadSectionStudents/loadStudentSections 는 client 동적
 * 필터(분반→학생)·자동매칭(학생→수강분반) 토글 입력을 제공한다.
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
  const sectionId = String(formData.get("sectionId") ?? "").trim();
  const observedOn = String(formData.get("observedOn") ?? "").trim() || undefined;
  const body = String(formData.get("body") ?? "").trim();
  const keywords = parseKeywords(String(formData.get("keywords") ?? ""));
  if (!studentYearId || !sectionId || !body) return;

  const db = getDb();
  const row = await addSubjectObservation(db, ownerId, {
    studentYearId,
    sectionId,
    observedOn,
    body,
    keywords,
  });
  await writeAudit(db, ownerId, "observation_create", row.id, {
    studentYearId,
    sectionId,
  });
  revalidatePath("/classroom/observations");
}

export async function updateObservationAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  const observedOn = String(formData.get("observedOn") ?? "").trim() || undefined;
  const body = String(formData.get("body") ?? "").trim();
  const keywords = parseKeywords(String(formData.get("keywords") ?? ""));
  if (!id || !body) return;

  const db = getDb();
  await updateSubjectObservation(db, ownerId, id, { body, keywords, observedOn });
  await writeAudit(db, ownerId, "observation_update", id, null);
  revalidatePath("/classroom/observations");
}

export async function deleteObservationAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const db = getDb();
  await deleteSubjectObservation(db, ownerId, id);
  await writeAudit(db, ownerId, "observation_delete", id, null);
  revalidatePath("/classroom/observations");
}

/** 분반→학생 동적 필터(client 셀렉트 갱신용). */
export async function loadSectionStudentsAction(
  sectionId: string,
): Promise<SectionStudentRow[]> {
  const ownerId = await getOwnerId();
  if (!sectionId) return [];
  const db = getDb();
  return listStudentsBySection(db, ownerId, sectionId);
}

/** 학생→수강분반 자동매칭(client 토글용). 활성 학기로 한정. */
export async function loadStudentSectionsAction(
  studentYearId: string,
  semester?: 1 | 2,
): Promise<StudentSectionRow[]> {
  const ownerId = await getOwnerId();
  if (!studentYearId) return [];
  const now = new Date();
  const year = activeSchoolYear(now);
  const sem = semester ?? activeSemester(now);
  const db = getDb();
  return listSectionsForStudent(db, ownerId, studentYearId, year, sem);
}
