import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { teacherProfile, calendarEvents, teacherNotes } from "../schema/misc";

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

// ── 다중 교사 한마디 (teacher_notes, 0022). 공개 페이지 스와이프. ──

export interface TeacherNoteRow {
  id: string;
  body: string;
  sortOrder: number;
}

/** 교사 한마디 목록(sortOrder 오름차순). */
export async function listTeacherNotes(
  db: DB,
  ownerId: string,
): Promise<TeacherNoteRow[]> {
  return db
    .select({
      id: teacherNotes.id,
      body: teacherNotes.body,
      sortOrder: teacherNotes.sortOrder,
    })
    .from(teacherNotes)
    .where(eq(teacherNotes.ownerId, ownerId))
    .orderBy(asc(teacherNotes.sortOrder), asc(teacherNotes.createdAt));
}

/** 교사 한마디 추가. sortOrder 미지정 시 현재 최대값+1 로 말미에 추가. */
export async function createTeacherNote(
  db: DB,
  ownerId: string,
  body: string,
  sortOrder?: number,
): Promise<{ id: string }> {
  const order =
    sortOrder ??
    (await listTeacherNotes(db, ownerId)).reduce(
      (m, n) => Math.max(m, n.sortOrder + 1),
      0,
    );
  const [row] = await db
    .insert(teacherNotes)
    .values({ ownerId, body: body.trim(), sortOrder: order })
    .returning({ id: teacherNotes.id });
  return row;
}

/** 교사 한마디 내용 수정(본인 소유만). */
export async function updateTeacherNote(
  db: DB,
  ownerId: string,
  id: string,
  body: string,
): Promise<void> {
  await db
    .update(teacherNotes)
    .set({ body: body.trim(), updatedAt: new Date() })
    .where(and(eq(teacherNotes.id, id), eq(teacherNotes.ownerId, ownerId)));
}

/** 교사 한마디 순서 변경(본인 소유만). */
export async function reorderTeacherNote(
  db: DB,
  ownerId: string,
  id: string,
  sortOrder: number,
): Promise<void> {
  await db
    .update(teacherNotes)
    .set({ sortOrder, updatedAt: new Date() })
    .where(and(eq(teacherNotes.id, id), eq(teacherNotes.ownerId, ownerId)));
}

/** 교사 한마디 삭제(본인 소유만). */
export async function deleteTeacherNote(
  db: DB,
  ownerId: string,
  id: string,
): Promise<void> {
  await db
    .delete(teacherNotes)
    .where(and(eq(teacherNotes.id, id), eq(teacherNotes.ownerId, ownerId)));
}

export interface NoticeEventRow {
  id: string;
  date: string;
  title: string;
  content: string | null;
}

/** 공지(할일) 추가 — calendar_events(source=manual). */
export async function addNoticeEvent(
  db: DB,
  ownerId: string,
  date: string,
  title: string,
  content?: string | null,
): Promise<{ id: string }> {
  const body = content && content.trim() ? content.trim() : null;
  const [row] = await db
    .insert(calendarEvents)
    .values({ ownerId, date, title, content: body, source: "manual" })
    .returning({ id: calendarEvents.id });
  return row;
}

/** 수동 공지 수정 — 제목·날짜·내용(content). 본인 소유 + manual 소스만. */
export async function updateNoticeEvent(
  db: DB,
  ownerId: string,
  id: string,
  date: string,
  title: string,
  content?: string | null,
): Promise<void> {
  const body = content && content.trim() ? content.trim() : null;
  await db
    .update(calendarEvents)
    .set({ date, title, content: body, updatedAt: new Date() })
    .where(
      and(
        eq(calendarEvents.id, id),
        eq(calendarEvents.ownerId, ownerId),
        eq(calendarEvents.source, "manual"),
      ),
    );
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
      content: calendarEvents.content,
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
