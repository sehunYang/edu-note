"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import { fetchTimetableBySchool } from "@/lib/integrations/comcigan-client";
import { teacherSlots } from "@/lib/integrations/comcigan";
import {
  syncTeacherTimetable,
  upsertTeacherComciganConfig,
  getTeacherSettings,
  decodedToHomeroomSlots,
  replaceHomeroomTimetable,
  writeAudit,
} from "@/lib/db/queries";
import { activeSchoolYear, activeSemester } from "@/lib/domain/school-year";

/**
 * 컴시간 시간표 동기화 서버액션 (C5 세팅실로 이관, 읽기전용 외부·비차단).
 * 학교/교사명으로 시간표를 가져와 subjects→course_sections→timetable_slots 로 sync.
 */
export type SyncState =
  | { ok: true; subjects: number; sections: number; slots: number; teacher: string }
  | { ok: false; message: string }
  | null;

export async function syncTimetableAction(
  _prev: SyncState,
  formData: FormData,
): Promise<SyncState> {
  try {
    const ownerId = await getOwnerId();
    const school = String(formData.get("school") ?? "").trim();
    const teacher = String(formData.get("teacher") ?? "").trim();
    const now = new Date();
    const year = activeSchoolYear(now);
    const semester = activeSemester(now);
    if (!school || !teacher) {
      return { ok: false, message: "학교명과 교사명을 입력하세요." };
    }

    const res = await fetchTimetableBySchool(school);
    if (!res.ok) return { ok: false, message: `컴시간 조회 실패: ${res.error}` };
    const slots = teacherSlots(res.data, teacher);
    if (slots.length === 0) {
      return {
        ok: false,
        message: `'${teacher}' 교사의 수업을 찾지 못했습니다. 이름/학교명을 확인하세요.`,
      };
    }

    const db = getDb();
    const sync = await syncTeacherTimetable(db, ownerId, year, semester, slots);
    await upsertTeacherComciganConfig(db, ownerId, school, teacher, new Date());
    await writeAudit(db, ownerId, "sync_comcigan", null, {
      school,
      teacher,
      year,
      ...sync,
    });
    revalidatePath("/setting/courses");
    return { ok: true, teacher, ...sync };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "동기화 실패" };
  }
}

/**
 * 담임반 시간표 컴시간 동기화 서버액션 (QC v4 US-5 AC-5.4 — 공지실에서 세팅실 컴시간
 * 시간표 동기화 섹션으로 이관). 교사 기본설정의 컴시간 학교 + 담임 학년/반으로 학년
 * 시간표를 파싱해 homeroom_timetable_slots 를 교체한다. 공개(학생 안내) 페이지 시간표 소스.
 * 컴시간은 비공식·변동 → 실패 시 throw 하지 않고 안내 메시지(수기 fallback) 반환.
 */
export type HomeroomSyncState =
  | { ok: true; slots: number; grade: number; classNo: number }
  | { ok: false; message: string }
  | null;

export async function syncHomeroomTimetableAction(
  _prev: HomeroomSyncState,
  _formData: FormData,
): Promise<HomeroomSyncState> {
  try {
    const ownerId = await getOwnerId();
    const db = getDb();
    const settings = await getTeacherSettings(db, ownerId);

    if (
      !settings?.isHomeroom ||
      settings.homeroomGrade == null ||
      settings.homeroomClassNo == null
    ) {
      return {
        ok: false,
        message: "담임 학년/반이 설정되어 있지 않습니다. 교사 기본설정에서 설정하세요.",
      };
    }
    const school = (settings.comciganSchool ?? "").trim();
    if (!school) {
      return {
        ok: false,
        message:
          "컴시간 학교가 설정되어 있지 않습니다. 위 본인 시간표 동기화를 먼저 하세요.",
      };
    }

    const grade = settings.homeroomGrade;
    const classNo = settings.homeroomClassNo;

    const res = await fetchTimetableBySchool(school);
    if (!res.ok) return { ok: false, message: `컴시간 조회 실패: ${res.error}` };

    let slots;
    try {
      slots = decodedToHomeroomSlots(res.data, grade, classNo);
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "담임반 시간표 파싱 실패",
      };
    }

    const { count } = await replaceHomeroomTimetable(
      db,
      ownerId,
      grade,
      classNo,
      slots,
    );
    await writeAudit(db, ownerId, "sync_comcigan", null, {
      scope: "homeroom_timetable",
      grade,
      classNo,
      slots: count,
    });
    revalidatePath("/setting/courses");
    return { ok: true, slots: count, grade, classNo };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "동기화 실패" };
  }
}
