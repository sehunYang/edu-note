import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { teacherProfile, calendarEvents } from "../schema/misc";

/**
 * 공지실 쿼리 계층 (계획 §4 Phase2-I). 공개 학생 페이지의 공통 안내를 관리한다.
 *  - 공통 '교사 한마디' = teacher_profile.public_notice (get_public_page commonNotice 소스, 0007)
 *  - 이번 주 할 일(weekTodos) = calendar_events(source=manual) (공개 페이지가 7일 내 표시)
 *
 * 모든 안내는 공개 페이지 allowlist DTO 를 통해서만 노출되므로, 민감 정보를 넣지 않는다.
 */
type DB = PostgresJsDatabase<typeof schema>;

/** 공통 교사 한마디 조회. */
export async function getPublicNotice(
  db: DB,
  ownerId: string,
): Promise<string | null> {
  const rows = await db
    .select({ publicNotice: teacherProfile.publicNotice })
    .from(teacherProfile)
    .where(eq(teacherProfile.ownerId, ownerId))
    .limit(1);
  return rows[0]?.publicNotice ?? null;
}

/** 공통 교사 한마디 설정(upsert). 빈 문자열은 null 로 저장(미표시). */
export async function setPublicNotice(
  db: DB,
  ownerId: string,
  notice: string | null,
): Promise<void> {
  const value = notice && notice.trim() ? notice.trim() : null;
  const existing = await db
    .select({ id: teacherProfile.id })
    .from(teacherProfile)
    .where(eq(teacherProfile.ownerId, ownerId))
    .limit(1);
  if (existing.length) {
    await db
      .update(teacherProfile)
      .set({ publicNotice: value, updatedAt: new Date() })
      .where(eq(teacherProfile.ownerId, ownerId));
  } else {
    await db.insert(teacherProfile).values({ ownerId, publicNotice: value });
  }
}

export interface NoticeEventRow {
  id: string;
  date: string;
  title: string;
}

/** 공지(할일) 추가 — calendar_events(source=manual). */
export async function addNoticeEvent(
  db: DB,
  ownerId: string,
  date: string,
  title: string,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(calendarEvents)
    .values({ ownerId, date, title, source: "manual" })
    .returning({ id: calendarEvents.id });
  return row;
}

/** 수동 공지 목록(날짜순). */
export async function listNoticeEvents(
  db: DB,
  ownerId: string,
): Promise<NoticeEventRow[]> {
  return db
    .select({
      id: calendarEvents.id,
      date: calendarEvents.date,
      title: calendarEvents.title,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.ownerId, ownerId),
        eq(calendarEvents.source, "manual"),
      ),
    )
    .orderBy(asc(calendarEvents.date));
}

/** 수동 공지 삭제(소유자 본인 + manual 소스만). */
export async function deleteNoticeEvent(
  db: DB,
  ownerId: string,
  id: string,
): Promise<void> {
  await db
    .delete(calendarEvents)
    .where(
      and(
        eq(calendarEvents.id, id),
        eq(calendarEvents.ownerId, ownerId),
        eq(calendarEvents.source, "manual"),
      ),
    );
}
