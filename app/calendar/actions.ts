"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  searchSchoolInfo,
  fetchSchoolSchedule,
  fetchMealService,
} from "@/lib/integrations/neis-client";
import {
  syncSchoolCalendar,
  upsertTeacherNeisConfig,
  writeAudit,
} from "@/lib/db/queries";

/**
 * NEIS 캘린더 동기화 서버액션 (계획 §3.3 E, §6 — 읽기전용 외부·비차단).
 * 학교검색 → 학사일정(학년도 전체)·급식(±한달) → school_day_calendar 등 sync.
 */
export type CalSyncState =
  | { ok: true; schoolDays: number; events: number; meals: number; school: string }
  | { ok: false; message: string }
  | null;

function ymd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** 학년도 범위(3월~익년 2월). */
function academicYear(now = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  const startYear = now.getMonth() + 1 >= 3 ? y : y - 1;
  return { from: `${startYear}0301`, to: `${startYear + 1}0228` };
}

export async function syncCalendarAction(
  _prev: CalSyncState,
  formData: FormData,
): Promise<CalSyncState> {
  try {
    const ownerId = await getOwnerId();
    const name = String(formData.get("school") ?? "").trim();
    if (!name) return { ok: false, message: "학교명을 입력하세요." };

    const found = await searchSchoolInfo(name);
    if (!found.ok) return { ok: false, message: `NEIS 조회 실패: ${found.error}` };
    if (found.data.length === 0) {
      return { ok: false, message: `'${name}' 학교를 NEIS에서 찾지 못했습니다.` };
    }
    const school =
      found.data.find((s) => s.name === name) ?? found.data[0];

    const now = new Date();
    const yr = academicYear(now);
    const mealFrom = new Date(now);
    mealFrom.setDate(mealFrom.getDate() - 7);
    const mealTo = new Date(now);
    mealTo.setDate(mealTo.getDate() + 31);

    const q = { officeCode: school.officeCode, schoolCode: school.schoolCode };
    const [sched, meal] = await Promise.all([
      fetchSchoolSchedule(q, yr.from, yr.to),
      fetchMealService(q, ymd(mealFrom), ymd(mealTo)),
    ]);
    if (!sched.ok) return { ok: false, message: `학사일정 조회 실패: ${sched.error}` };
    if (!meal.ok) return { ok: false, message: `급식 조회 실패: ${meal.error}` };

    const db = getDb();
    const res = await syncSchoolCalendar(
      db,
      ownerId,
      yr.from,
      yr.to,
      sched.data,
      meal.data,
    );
    await upsertTeacherNeisConfig(
      db,
      ownerId,
      school.officeCode,
      school.schoolCode,
      school.name,
      now,
    );
    await writeAudit(db, ownerId, "sync_neis", null, {
      school: school.name,
      ...res,
    });
    revalidatePath("/calendar");
    return { ok: true, school: school.name, ...res };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "동기화 실패" };
  }
}
