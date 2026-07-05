import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { todayCalendarMemos } from "../schema/misc";

/**
 * 오늘의 학교 전용 일자별 메모 쿼리 계층 (QC v5 c7 B.4, 마이그 0039).
 * ownerId + date 단위 다건 CRUD. 오직 오늘의학교 캘린더에서만 노출(공개 페이지 등
 * 타 캘린더에는 전달하지 않는다 — 상위 호출부에서 보장).
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface TodayMemoRow {
  id: string;
  date: string; // YYYY-MM-DD
  content: string;
  startTime: string | null;
  endTime: string | null;
}

/** 특정 날짜의 메모 목록(생성순). */
export async function listTodayMemos(
  db: DB,
  ownerId: string,
  date: string,
): Promise<TodayMemoRow[]> {
  return db
    .select({
      id: todayCalendarMemos.id,
      date: todayCalendarMemos.date,
      content: todayCalendarMemos.content,
      startTime: todayCalendarMemos.startTime,
      endTime: todayCalendarMemos.endTime,
    })
    .from(todayCalendarMemos)
    .where(
      and(
        eq(todayCalendarMemos.ownerId, ownerId),
        eq(todayCalendarMemos.date, date),
      ),
    )
    .orderBy(asc(todayCalendarMemos.createdAt));
}

/** 특정 기간([fromDate, toDate])의 메모 전체(캘린더 월 표시용). */
export async function listTodayMemosInRange(
  db: DB,
  ownerId: string,
  fromDate: string,
  toDate: string,
): Promise<TodayMemoRow[]> {
  return db
    .select({
      id: todayCalendarMemos.id,
      date: todayCalendarMemos.date,
      content: todayCalendarMemos.content,
      startTime: todayCalendarMemos.startTime,
      endTime: todayCalendarMemos.endTime,
    })
    .from(todayCalendarMemos)
    .where(
      and(
        eq(todayCalendarMemos.ownerId, ownerId),
        gte(todayCalendarMemos.date, fromDate),
        lte(todayCalendarMemos.date, toDate),
      ),
    )
    .orderBy(asc(todayCalendarMemos.date), asc(todayCalendarMemos.createdAt));
}

/** 메모 생성. 생성된 행 id 반환. */
export async function createTodayMemo(
  db: DB,
  ownerId: string,
  date: string,
  content: string,
  startTime?: string | null,
  endTime?: string | null,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(todayCalendarMemos)
    .values({ ownerId, date, content, startTime: startTime ?? null, endTime: endTime ?? null })
    .returning({ id: todayCalendarMemos.id });
  return row;
}

/** 메모 본문 수정(소유자 본인 행만). */
export async function updateTodayMemo(
  db: DB,
  ownerId: string,
  id: string,
  content: string,
  startTime?: string | null,
  endTime?: string | null,
): Promise<void> {
  await db
    .update(todayCalendarMemos)
    .set({ content, startTime: startTime ?? null, endTime: endTime ?? null, updatedAt: new Date() })
    .where(
      and(eq(todayCalendarMemos.id, id), eq(todayCalendarMemos.ownerId, ownerId)),
    );
}

/** 메모 삭제(소유자 본인 행만). */
export async function deleteTodayMemo(
  db: DB,
  ownerId: string,
  id: string,
): Promise<void> {
  await db
    .delete(todayCalendarMemos)
    .where(
      and(eq(todayCalendarMemos.id, id), eq(todayCalendarMemos.ownerId, ownerId)),
    );
}
