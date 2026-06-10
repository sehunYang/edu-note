"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  markSetupComplete,
  clearSetupComplete,
  deleteSchoolYear,
  upsertTeacherSettings,
  getTeacherNeisConfig,
  syncSchoolCalendar,
  updateEventAttributes,
  linkYearStudents,
  resolveInheritance,
  addClassRole,
  deleteClassRole,
  issuePublicPageForHomeroom,
  saveEvalSettings,
  bulkEnroll,
  materializeSubjectExams,
  addSectionRole,
  deleteSectionRole,
  writeAudit,
  SETTING_STAGES,
  type SettingStage,
} from "@/lib/db/queries";
import { resolveSchool, type SchoolResolution } from "@/lib/integrations/school-resolve";
import {
  fetchSchoolSchedule,
  fetchMealService,
} from "@/lib/integrations/neis-client";
import { activeSchoolYear, schoolYearRangeYmd } from "@/lib/domain/school-year";
import type { EventKind } from "@/lib/domain/calendar-keywords";

/**
 * 세팅실 단계 게이팅 서버액션 (AC-0.1). 각 단계 완료/해제를 setup_state 에 기록한다.
 * getOwnerId() 가 로그인+allowlist 를 강제하고 모든 변경은 audit_log 에 남긴다.
 */
function assertStage(value: string): SettingStage {
  if (!(SETTING_STAGES as readonly string[]).includes(value)) {
    throw new Error(`알 수 없는 단계: ${value}`);
  }
  return value as SettingStage;
}

export async function completeStageAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const stage = assertStage(String(formData.get("stage")));
  const db = getDb();
  await markSetupComplete(db, ownerId, stage);
  await writeAudit(db, ownerId, "setup_stage_complete", stage);
  revalidatePath("/setting", "layout");
}

export async function reopenStageAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const stage = assertStage(String(formData.get("stage")));
  const db = getDb();
  await clearSetupComplete(db, ownerId, stage);
  await writeAudit(db, ownerId, "setup_stage_reopen", stage);
  revalidatePath("/setting", "layout");
}

export type DeleteYearState =
  | { ok: true; year: number; removedStudentYears: number; preservedPersons: number }
  | { ok: false; message: string }
  | null;

/** 레거시 연도 단위 삭제(AC-1.4). 확인 입력으로 오삭제 방지. 참조 영속학생 보존. */
export async function deleteYearAction(
  _prev: DeleteYearState,
  formData: FormData,
): Promise<DeleteYearState> {
  try {
    const ownerId = await getOwnerId();
    const year = Number(formData.get("year"));
    const confirm = Number(formData.get("confirm"));
    if (!year) return { ok: false, message: "삭제할 학년도가 지정되지 않았습니다." };
    if (confirm !== year) {
      return { ok: false, message: "확인란에 삭제할 학년도를 정확히 입력하세요." };
    }
    const db = getDb();
    const res = await deleteSchoolYear(db, ownerId, year);
    await writeAudit(db, ownerId, "year_delete", String(year), {
      removedStudentYears: res.removedStudentYears,
      removedPersons: res.removedPersons,
      preservedPersons: res.preservedPersons,
    });
    revalidatePath("/setting", "layout");
    return {
      ok: true,
      year,
      removedStudentYears: res.removedStudentYears,
      preservedPersons: res.preservedPersons,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "삭제 실패" };
  }
}

// ── C2 교사 기본 설정 (AC-2.1~2.3) ──

function intOrNull(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return value != null && value !== "" && Number.isFinite(n) ? n : null;
}

function textOrNull(value: FormDataEntryValue | null): string | null {
  const s = value == null ? "" : String(value).trim();
  return s.length > 0 ? s : null;
}

export type SaveProfileState =
  | { ok: true }
  | { ok: false; message: string }
  | null;

/** 교사 기본 설정 저장(AC-2.1~2.2). isHomeroom=false 면 담임필드 null 강제(쿼리 계층). */
export async function saveProfileAction(
  _prev: SaveProfileState,
  formData: FormData,
): Promise<SaveProfileState> {
  try {
    const ownerId = await getOwnerId();
    const isHomeroom = formData.get("isHomeroom") === "on";
    const db = getDb();
    await upsertTeacherSettings(db, ownerId, {
      name: textOrNull(formData.get("name")),
      schoolName: textOrNull(formData.get("schoolName")),
      isHomeroom,
      homeroomGrade: intOrNull(formData.get("homeroomGrade")),
      homeroomClassNo: intOrNull(formData.get("homeroomClassNo")),
      neisOfficeCode: textOrNull(formData.get("neisOfficeCode")),
      neisSchoolCode: textOrNull(formData.get("neisSchoolCode")),
      neisSchoolName: textOrNull(formData.get("neisSchoolName")),
      comciganSchool: textOrNull(formData.get("comciganSchool")),
      comciganTeacher: textOrNull(formData.get("comciganTeacher")),
    });
    await writeAudit(db, ownerId, "profile_upsert", null, { isHomeroom });
    revalidatePath("/setting", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "저장 실패" };
  }
}

export type ResolveSchoolState =
  | { ok: true; name: string; resolution: SchoolResolution }
  | { ok: false; message: string }
  | null;

/**
 * 학교명 1회 입력 → NEIS·comcigan 동시 해석(AC-2.3). 비차단: 검색 자체 실패만 ok=false,
 * 0/다건은 ok=true 로 돌려 폼에서 picker/수동입력 fallback 을 보여준다.
 */
export async function resolveSchoolAction(
  _prev: ResolveSchoolState,
  formData: FormData,
): Promise<ResolveSchoolState> {
  try {
    await getOwnerId();
    const name = textOrNull(formData.get("schoolName"));
    if (!name) return { ok: false, message: "학교명을 입력하세요." };
    const resolution = await resolveSchool(name);
    return { ok: true, name, resolution };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "검색 실패" };
  }
}

// ── C3 학사일정 sync + 키워드 보정 (AC-3.1~3.4) ──

export type CalendarSyncState =
  | { ok: true; schoolDays: number; events: number }
  | { ok: false; message: string }
  | null;

/** 활성 학년도 범위로 NEIS 학사일정·급식 동기화(자동 키워드 분류 부여). */
export async function calendarSyncAction(
  _prev: CalendarSyncState,
  _formData: FormData,
): Promise<CalendarSyncState> {
  try {
    const ownerId = await getOwnerId();
    const db = getDb();
    const cfg = await getTeacherNeisConfig(db, ownerId);
    if (!cfg?.neisOfficeCode || !cfg?.neisSchoolCode) {
      return { ok: false, message: "교사 설정에서 NEIS 학교 코드를 먼저 해석하세요." };
    }
    const { from, to } = schoolYearRangeYmd(activeSchoolYear(new Date()));
    const q = { officeCode: cfg.neisOfficeCode, schoolCode: cfg.neisSchoolCode };
    const [sched, meal] = await Promise.all([
      fetchSchoolSchedule(q, from, to),
      fetchMealService(q, from, to),
    ]);
    if (!sched.ok) return { ok: false, message: `학사일정 조회 실패(${sched.error})` };
    const res = await syncSchoolCalendar(
      db,
      ownerId,
      from,
      to,
      sched.data,
      meal.ok ? meal.data : [],
    );
    await writeAudit(db, ownerId, "sync_neis", null, {
      schoolDays: res.schoolDays,
      events: res.events,
    });
    revalidatePath("/setting", "layout");
    return { ok: true, schoolDays: res.schoolDays, events: res.events };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "동기화 실패" };
  }
}

export type UpdateAttrsState =
  | { ok: true; eventId: string }
  | { ok: false; message: string }
  | null;

const EVENT_KINDS: readonly EventKind[] = [
  "exam",
  "vacation_start",
  "vacation_end",
  "club",
  "none",
];

/** 자동 분류 보정(AC-3.3). exam 아니면 학기/회차는 쿼리 계층에서 null 강제. */
export async function updateEventAttrsAction(
  _prev: UpdateAttrsState,
  formData: FormData,
): Promise<UpdateAttrsState> {
  try {
    const ownerId = await getOwnerId();
    const eventId = String(formData.get("eventId"));
    const kind = String(formData.get("eventKind"));
    if (!eventId) return { ok: false, message: "이벤트가 지정되지 않았습니다." };
    if (!EVENT_KINDS.includes(kind as EventKind)) {
      return { ok: false, message: `알 수 없는 분류: ${kind}` };
    }
    const db = getDb();
    await updateEventAttributes(db, ownerId, eventId, {
      eventKind: kind as EventKind,
      examSemester: intOrNull(formData.get("examSemester")),
      examOrdinal: intOrNull(formData.get("examOrdinal")),
    });
    await writeAudit(db, ownerId, "calendar_attr_update", eventId, { kind });
    revalidatePath("/setting", "layout");
    return { ok: true, eventId };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "보정 실패" };
  }
}

// ── C4 학생 명단: 매칭/상속/역할/공개링크 (AC-4.1~4.6) ──

export type LinkStudentsState =
  | { ok: true; autoLinked: number; pending: number; newPerson: number }
  | { ok: false; message: string }
  | null;

/** 활성 학년도 동명이인 매칭 실행(유일=즉시상속, 다건=pending 큐). */
export async function linkStudentsAction(
  _prev: LinkStudentsState,
  _formData: FormData,
): Promise<LinkStudentsState> {
  try {
    const ownerId = await getOwnerId();
    const db = getDb();
    const year = activeSchoolYear(new Date());
    const res = await linkYearStudents(db, ownerId, year);
    await writeAudit(db, ownerId, "inheritance_resolve", String(year), {
      bulk: true,
      ...res,
    });
    revalidatePath("/setting", "layout");
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "매칭 실패" };
  }
}

export type ResolveInheritanceState =
  | { ok: true }
  | { ok: false; message: string }
  | null;

/** 보류 동명이인 해소(후보 선택 → 상속 확정). */
export async function resolveInheritanceAction(
  _prev: ResolveInheritanceState,
  formData: FormData,
): Promise<ResolveInheritanceState> {
  try {
    const ownerId = await getOwnerId();
    const yearLinkId = String(formData.get("yearLinkId"));
    const personId = String(formData.get("personId"));
    if (!yearLinkId || !personId) {
      return { ok: false, message: "해소 대상/후보가 지정되지 않았습니다." };
    }
    const db = getDb();
    await resolveInheritance(db, ownerId, yearLinkId, personId);
    await writeAudit(db, ownerId, "inheritance_resolve", yearLinkId, { personId });
    revalidatePath("/setting", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "해소 실패" };
  }
}

export async function addClassRoleAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const studentYearId = String(formData.get("studentYearId"));
  const roleName = textOrNull(formData.get("roleName"));
  if (!studentYearId || !roleName) return;
  const db = getDb();
  await addClassRole(db, ownerId, studentYearId, roleName, textOrNull(formData.get("roleDesc")));
  await writeAudit(db, ownerId, "homeroom_role_upsert", studentYearId, { roleName });
  revalidatePath("/setting", "layout");
}

export async function deleteClassRoleAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const roleId = String(formData.get("roleId"));
  if (!roleId) return;
  const db = getDb();
  await deleteClassRole(db, ownerId, roleId);
  await writeAudit(db, ownerId, "homeroom_role_delete", roleId);
  revalidatePath("/setting", "layout");
}

export type IssueLinkState =
  | { ok: true; studentYearId: string; token: string }
  | { ok: false; message: string }
  | null;

/** 공개링크 발급(서버 게이팅 — 담임반 학생만, 비담임 거부). */
export async function issuePublicLinkAction(
  _prev: IssueLinkState,
  formData: FormData,
): Promise<IssueLinkState> {
  try {
    const ownerId = await getOwnerId();
    const studentYearId = String(formData.get("studentYearId"));
    if (!studentYearId) return { ok: false, message: "학생이 지정되지 않았습니다." };
    const db = getDb();
    const issued = await issuePublicPageForHomeroom(db, ownerId, studentYearId);
    await writeAudit(db, ownerId, "token_issue", studentYearId);
    revalidatePath("/setting", "layout");
    return { ok: true, studentYearId, token: issued.token };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "발급 실패" };
  }
}

// ── C5 수업 관리: 평가설정/일괄등록/시험일 파생/분반역할 (AC-5.1~5.8) ──

export type SaveEvalState =
  | { ok: true; subjectId: string }
  | { ok: false; message: string }
  | null;

/** 평가설정 저장(AC-5.1). 100% 검증 통과 시에만 저장(쿼리 계층이 실패 시 throw). */
export async function saveEvalAction(
  _prev: SaveEvalState,
  formData: FormData,
): Promise<SaveEvalState> {
  try {
    const ownerId = await getOwnerId();
    const subjectId = String(formData.get("subjectId"));
    if (!subjectId) return { ok: false, message: "과목이 지정되지 않았습니다." };
    // performance: "이름:비율" 줄바꿈 구분
    const raw = String(formData.get("performance") ?? "").trim();
    const performance = raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [name, w] = line.split(":");
        return { name: (name ?? "").trim(), weight: Number(w) };
      });
    const midEnabled = formData.get("midEnabled") === "on";
    const finalEnabled = formData.get("finalEnabled") === "on";
    const db = getDb();
    await saveEvalSettings(db, ownerId, subjectId, {
      performance,
      jipilMid: Number(formData.get("jipilMid") ?? 0),
      jipilFinal: Number(formData.get("jipilFinal") ?? 0),
      midEnabled,
      finalEnabled,
    });
    await writeAudit(db, ownerId, "eval_weights_save", subjectId);
    revalidatePath("/setting", "layout");
    return { ok: true, subjectId };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "저장 실패" };
  }
}

export type BulkEnrollState =
  | { ok: true; sectionId: string; count: number }
  | { ok: false; message: string }
  | null;

/** 일괄 수강 등록(AC-5.x). grade/classNo 컬럼 필터(빈 값=전체). */
export async function bulkEnrollAction(
  _prev: BulkEnrollState,
  formData: FormData,
): Promise<BulkEnrollState> {
  try {
    const ownerId = await getOwnerId();
    const sectionId = String(formData.get("sectionId"));
    if (!sectionId) return { ok: false, message: "분반이 지정되지 않았습니다." };
    const db = getDb();
    const count = await bulkEnroll(db, ownerId, sectionId, {
      schoolYear: activeSchoolYear(new Date()),
      grade: intOrNull(formData.get("grade")) ?? undefined,
      classNo: intOrNull(formData.get("classNo")) ?? undefined,
    });
    await writeAudit(db, ownerId, "enrollment_bulk", sectionId, { count });
    revalidatePath("/setting", "layout");
    return { ok: true, sectionId, count };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "등록 실패" };
  }
}

export type MaterializeExamsState =
  | { ok: true; count: number }
  | { ok: false; message: string }
  | null;

/** C3 태깅 calendarEvents → subject_exams 파생(AC-5.4). */
export async function materializeExamsAction(
  _prev: MaterializeExamsState,
  _formData: FormData,
): Promise<MaterializeExamsState> {
  try {
    const ownerId = await getOwnerId();
    const db = getDb();
    const count = await materializeSubjectExams(
      db,
      ownerId,
      activeSchoolYear(new Date()),
    );
    await writeAudit(db, ownerId, "subject_exam_materialize", null, { count });
    revalidatePath("/setting", "layout");
    return { ok: true, count };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "파생 실패" };
  }
}

export async function addSectionRoleAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const enrollmentId = String(formData.get("enrollmentId"));
  const title = textOrNull(formData.get("title"));
  if (!enrollmentId || !title) return;
  const db = getDb();
  await addSectionRole(db, ownerId, enrollmentId, title, textOrNull(formData.get("description")));
  await writeAudit(db, ownerId, "section_role_upsert", enrollmentId, { title });
  revalidatePath("/setting", "layout");
}

export async function deleteSectionRoleAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const roleId = String(formData.get("roleId"));
  if (!roleId) return;
  const db = getDb();
  await deleteSectionRole(db, ownerId, roleId);
  await writeAudit(db, ownerId, "section_role_delete", roleId);
  revalidatePath("/setting", "layout");
}
