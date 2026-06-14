"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import { fetchTimetableBySchool } from "@/lib/integrations/comcigan-client";
import {
  setPublicNotice,
  listTeacherNotes,
  createTeacherNote,
  updateTeacherNote,
  deleteTeacherNote,
  addNoticeEvent,
  updateNoticeEvent,
  deleteNoticeEvent,
  listGradeClasses,
  saveFixedClassSetting,
  getTeacherSettings,
  writeAudit,
} from "@/lib/db/queries";

/**
 * 공지실 서버액션 (계획 §4 Phase2-I + QC v3 Part B US-B10). getOwnerId 가드 + audit.
 * 다중 교사 한마디 CRUD, 할일(제목·날짜·내용) 추가/수정/삭제, 고정반 설정 패널을 처리한다.
 * 여기서 설정한 공통 한마디·할일은 모든 학생 공개 페이지의 allowlist DTO 로 노출된다.
 */

const PATH = "/homeroom/notice";

// ── 교사 한마디(공통 단일 — backward-compat) ──
export async function setNoticeAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const notice = String(formData.get("notice") ?? "");
  const db = getDb();
  await setPublicNotice(db, ownerId, notice);
  await writeAudit(db, ownerId, "notice_upsert", null, {
    kind: "common_notice",
  });
  revalidatePath(PATH);
}

// ── 다중 교사 한마디 CRUD ──
export async function createTeacherNoteAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  const db = getDb();
  const n = await createTeacherNote(db, ownerId, body);
  await writeAudit(db, ownerId, "teacher_note_create", n.id);
  revalidatePath(PATH);
}

export async function updateTeacherNoteAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!id || !body) return;
  const db = getDb();
  await updateTeacherNote(db, ownerId, id, body);
  await writeAudit(db, ownerId, "teacher_note_update", id);
  revalidatePath(PATH);
}

export async function deleteTeacherNoteAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const db = getDb();
  await deleteTeacherNote(db, ownerId, id);
  await writeAudit(db, ownerId, "teacher_note_delete", id);
  revalidatePath(PATH);
}

// ── 할일(공지) — 추가/수정/삭제 (내용 content 포함) ──
export async function addNoticeEventAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const date = String(formData.get("date") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!date || !title) return;
  const db = getDb();
  const e = await addNoticeEvent(db, ownerId, date, title, content);
  await writeAudit(db, ownerId, "notice_upsert", e.id, { date });
  revalidatePath(PATH);
}

export async function updateNoticeEventAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!id || !date || !title) return;
  const db = getDb();
  await updateNoticeEvent(db, ownerId, id, date, title, content);
  await writeAudit(db, ownerId, "notice_upsert", id, { date, kind: "edit" });
  revalidatePath(PATH);
}

export async function deleteNoticeEventAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const db = getDb();
  await deleteNoticeEvent(db, ownerId, id);
  await writeAudit(db, ownerId, "notice_delete", id);
  revalidatePath(PATH);
}

// ── 고정반 설정 패널 ──
export type FixedClassState =
  | { ok: true; saved: number }
  | { ok: false; message: string }
  | null;

/**
 * 담임 학년 시간표를 컴시간에서 읽어 (반,과목) 제공목록을 도출하고, 체크된 과목만
 * 고정반(isFixed=true), 나머지는 선택과목(isFixed=false)으로 일괄 저장한다.
 * 컴시간 조회/파싱 실패는 비차단으로 message 반환(페이지가 "동기화 실패, 수기" 안내).
 */
export async function saveFixedClassesAction(
  _prev: FixedClassState,
  formData: FormData,
): Promise<FixedClassState> {
  try {
    const ownerId = await getOwnerId();
    const db = getDb();
    const settings = await getTeacherSettings(db, ownerId);
    const grade = settings?.homeroomGrade;
    const school = settings?.comciganSchool;
    if (!grade) {
      return { ok: false, message: "담임 학년이 설정되어 있지 않습니다." };
    }
    if (!school) {
      return {
        ok: false,
        message: "컴시간 학교 설정이 없습니다. 세팅실에서 시간표를 먼저 동기화하세요.",
      };
    }
    const res = await fetchTimetableBySchool(school);
    if (!res.ok) {
      return {
        ok: false,
        message: `동기화 실패: ${res.error}. 시간표를 수기로 확인하세요.`,
      };
    }
    const offerings = listGradeClasses(res.data, grade);
    const checked = new Set(formData.getAll("fixed").map((v) => String(v)));
    let saved = 0;
    for (const o of offerings) {
      const key = `${o.classNo}::${o.subjectName}`;
      await saveFixedClassSetting(
        db,
        ownerId,
        grade,
        o.classNo,
        o.subjectName,
        checked.has(key),
      );
      saved += 1;
    }
    await writeAudit(db, ownerId, "fixed_class_save", null, { grade, saved });
    revalidatePath(PATH);
    return { ok: true, saved };
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error
          ? `동기화 실패: ${e.message}. 시간표를 수기로 확인하세요.`
          : "동기화 실패, 수기로 확인하세요.",
    };
  }
}
