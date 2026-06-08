"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import { fetchTimetableBySchool } from "@/lib/integrations/comcigan-client";
import { teacherSlots } from "@/lib/integrations/comcigan";
import {
  syncTeacherTimetable,
  upsertTeacherComciganConfig,
  writeAudit,
} from "@/lib/db/queries";

/**
 * 컴시간 시간표 동기화 서버액션 (계획 §3.3 B, §6 — 읽기전용 외부·비차단).
 * getOwnerId() 가드 → 컴시간 조회(실패 Result) → 교사 슬롯 sync → 설정·감사 기록.
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
    const year = Number(formData.get("year")) || new Date().getFullYear();
    if (!school || !teacher) {
      return { ok: false, message: "학교명과 교사명을 입력하세요." };
    }

    const res = await fetchTimetableBySchool(school);
    if (!res.ok) {
      return { ok: false, message: `컴시간 조회 실패: ${res.error}` };
    }
    const slots = teacherSlots(res.data, teacher);
    if (slots.length === 0) {
      return {
        ok: false,
        message: `'${teacher}' 교사의 수업을 찾지 못했습니다. 이름/학교명을 확인하세요.`,
      };
    }

    const db = getDb();
    const sync = await syncTeacherTimetable(db, ownerId, year, slots);
    const now = new Date();
    await upsertTeacherComciganConfig(db, ownerId, school, teacher, now);
    await writeAudit(db, ownerId, "sync_comcigan", null, {
      school,
      teacher,
      year,
      ...sync,
    });
    revalidatePath("/timetable");
    return { ok: true, teacher, ...sync };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "동기화 실패" };
  }
}
