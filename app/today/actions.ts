"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  listTodayMemos,
  listTodayMemosInRange,
  createTodayMemo,
  updateTodayMemo,
  deleteTodayMemo,
  getEventsInRange,
  listHomeroomReservationsInRange,
  writeAudit,
  type TodayMemoRow,
} from "@/lib/db/queries";

/**
 * 오늘의 학교 서버액션 (QC v5 c7 B.3/B.4). 패턴: getOwnerId → 쿼리 → writeAudit →
 * revalidatePath (homeroom/activities/actions.ts 동형). 메모는 오늘의학교 전용이라
 * 공개 페이지/타 캘린더에는 노출하지 않는다.
 */

export interface CalendarRangeData {
  events: { date: string; title: string }[];
  counsel: { date: string; studentLabel: string }[];
  memos: TodayMemoRow[];
}

/** 월 네비게이션 시 해당 월 범위([from, to])의 학사일정·상담·메모를 재조회(B.3/B.4). */
export async function fetchCalendarRange(
  from: string,
  to: string,
): Promise<CalendarRangeData> {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = new Date().getFullYear();
  const [events, reservations, memos] = await Promise.all([
    getEventsInRange(db, ownerId, from, to),
    listHomeroomReservationsInRange(db, ownerId, year, from, to),
    listTodayMemosInRange(db, ownerId, from, to),
  ]);
  return {
    events: events.map((e) => ({ date: e.date, title: e.title })),
    counsel: reservations.map((c) => ({
      date: c.date,
      studentLabel: c.studentLabel,
    })),
    memos,
  };
}

/** 특정 날짜의 메모 목록 조회(날짜 클릭 모달, B.4). */
export async function listMemosForDate(date: string): Promise<TodayMemoRow[]> {
  const ownerId = await getOwnerId();
  const db = getDb();
  return listTodayMemos(db, ownerId, date);
}

/** 메모 추가("일정 추가하기", B.4). */
export async function createMemoAction(
  date: string,
  content: string,
): Promise<TodayMemoRow[]> {
  const ownerId = await getOwnerId();
  const trimmed = content.trim();
  if (!date || !trimmed) return [];
  const db = getDb();
  const { id } = await createTodayMemo(db, ownerId, date, trimmed);
  await writeAudit(db, ownerId, "today_memo_create", id, { date });
  revalidatePath("/today");
  return listTodayMemos(db, ownerId, date);
}

/** 메모 수정(B.4). */
export async function updateMemoAction(
  id: string,
  date: string,
  content: string,
): Promise<TodayMemoRow[]> {
  const ownerId = await getOwnerId();
  const trimmed = content.trim();
  if (!id || !trimmed) return listMemosForDate(date);
  const db = getDb();
  await updateTodayMemo(db, ownerId, id, trimmed);
  await writeAudit(db, ownerId, "today_memo_update", id, null);
  revalidatePath("/today");
  return listTodayMemos(db, ownerId, date);
}

/** 메모 삭제(B.4). */
export async function deleteMemoAction(
  id: string,
  date: string,
): Promise<TodayMemoRow[]> {
  const ownerId = await getOwnerId();
  if (!id) return listMemosForDate(date);
  const db = getDb();
  await deleteTodayMemo(db, ownerId, id);
  await writeAudit(db, ownerId, "today_memo_delete", id, null);
  revalidatePath("/today");
  return listTodayMemos(db, ownerId, date);
}
