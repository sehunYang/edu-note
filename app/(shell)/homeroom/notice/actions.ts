"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import { fetchTimetableBySchool } from "@/lib/integrations/comcigan-client";
import {
  setPublicNotice,
  listTeacherNotes,
  createTeacherNote,
  bulkCreateIndividualTeacherNotes,
  updateTeacherNote,
  deleteTeacherNote,
  moveTeacherNote,
  addNoticeEvent,
  updateNoticeEvent,
  deleteNoticeEvent,
  listGradeClasses,
  saveFixedClassSetting,
  getTeacherSettings,
  writeAudit,
  type TeacherNoteScope,
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

// ── 다중 교사 한마디 CRUD (전체/개별 입력칸 분리, QC v5 c5) ──

/** formData 에서 대상 범위·대상 학생 목록을 파싱. 'individual' + 학생 0명이면 'all' 로 강등. */
function parseTarget(formData: FormData): {
  scope: TeacherNoteScope;
  studentYearIds: string[];
} {
  const raw = String(formData.get("targetScope") ?? "all");
  const ids = formData
    .getAll("studentYearIds")
    .map((v) => String(v))
    .filter(Boolean);
  const scope: TeacherNoteScope =
    raw === "individual" && ids.length > 0 ? "individual" : "all";
  return { scope, studentYearIds: scope === "individual" ? ids : [] };
}

/**
 * 전체 공지란 — target_scope='all' 1건 생성(AC-5.2). 기존 단일 생성 패턴.
 */
export async function createAllTeacherNoteAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  const db = getDb();
  const n = await createTeacherNote(db, ownerId, body, undefined, "all", []);
  await writeAudit(db, ownerId, "teacher_note_create", n.id, {
    targetScope: "all",
    targets: 0,
  });
  revalidatePath(PATH);
}

/**
 * 개별 공지란 — 선택 학생 N명 각자에게 별도 개별공지 N개 생성(AC-5.3).
 * activities bulkSave 패턴 차용. 학생 미선택 또는 body 빈값이면 no-op.
 */
export async function bulkCreateIndividualNotesAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const body = String(formData.get("body") ?? "").trim();
  const studentYearIds = formData
    .getAll("studentYearIds")
    .map((v) => String(v))
    .filter(Boolean);
  if (!body || studentYearIds.length === 0) return;
  const db = getDb();
  const ids = await bulkCreateIndividualTeacherNotes(
    db,
    ownerId,
    body,
    studentYearIds,
  );
  await writeAudit(db, ownerId, "teacher_note_create", null, {
    targetScope: "individual",
    batch: ids.length,
    ids,
  });
  revalidatePath(PATH);
}

/**
 * (호환) 통합 생성 — 대상 범위 파싱 후 1건 생성. 수정 폼 등 기존 호출부 호환용.
 */
export async function createTeacherNoteAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  const { scope, studentYearIds } = parseTarget(formData);
  const db = getDb();
  const n = await createTeacherNote(
    db,
    ownerId,
    body,
    undefined,
    scope,
    studentYearIds,
  );
  await writeAudit(db, ownerId, "teacher_note_create", n.id, {
    targetScope: scope,
    targets: studentYearIds.length,
  });
  revalidatePath(PATH);
}

export async function updateTeacherNoteAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!id || !body) return;
  const { scope, studentYearIds } = parseTarget(formData);
  const db = getDb();
  await updateTeacherNote(db, ownerId, id, body, scope, studentYearIds);
  await writeAudit(db, ownerId, "teacher_note_update", id, {
    targetScope: scope,
    targets: studentYearIds.length,
  });
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

/** 교사 한마디 순서 변경(위/아래 한 칸 이동, AC-5.1). */
export async function reorderTeacherNoteAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  const direction = String(formData.get("direction") ?? "");
  if (!id || (direction !== "up" && direction !== "down")) return;
  const db = getDb();
  await moveTeacherNote(db, ownerId, id, direction);
  await writeAudit(db, ownerId, "teacher_note_reorder", id, { direction });
  revalidatePath(PATH);
}

// ── 할일(공지) — 추가/수정/삭제 (내용 content + 학생 공개 여부 isPublic) ──
export async function addNoticeEventAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const date = String(formData.get("date") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const isPublic = formData.get("isPublic") === "on"; // 체크박스 — 해제 시 학생 비공개
  if (!date || !title) return;
  const db = getDb();
  const e = await addNoticeEvent(db, ownerId, date, title, content, isPublic);
  await writeAudit(db, ownerId, "notice_upsert", e.id, { date, isPublic });
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
  const isPublic = formData.get("isPublic") === "on";
  if (!id || !date || !title) return;
  const db = getDb();
  await updateNoticeEvent(db, ownerId, id, date, title, content, isPublic);
  await writeAudit(db, ownerId, "notice_upsert", id, {
    date,
    kind: "edit",
    isPublic,
  });
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
