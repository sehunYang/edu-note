import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  teacherProfile,
  calendarEvents,
  teacherNotes,
  teacherNoteTargets,
} from "../schema/misc";

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

export type TeacherNoteScope = "all" | "individual";

export interface TeacherNoteRow {
  id: string;
  body: string;
  sortOrder: number;
  targetScope: TeacherNoteScope;
  /** targetScope='individual' 일 때 대상 student_year_id 목록(전체 공개면 빈 배열). */
  targetStudentYearIds: string[];
}

/** 한 owner 의 모든 한마디 대상 매핑을 noteId→student_year_id[] 로 묶는다. */
async function loadNoteTargets(
  db: DB,
  ownerId: string,
): Promise<Map<string, string[]>> {
  const rows = await db
    .select({
      noteId: teacherNoteTargets.noteId,
      studentYearId: teacherNoteTargets.studentYearId,
    })
    .from(teacherNoteTargets)
    .where(eq(teacherNoteTargets.ownerId, ownerId));
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.noteId) ?? [];
    list.push(r.studentYearId);
    map.set(r.noteId, list);
  }
  return map;
}

/** 단일 한마디의 개별 대상 매핑을 교체(delete-all → insert). */
async function replaceNoteTargets(
  db: DB,
  ownerId: string,
  noteId: string,
  studentYearIds: string[],
): Promise<void> {
  await db
    .delete(teacherNoteTargets)
    .where(
      and(
        eq(teacherNoteTargets.ownerId, ownerId),
        eq(teacherNoteTargets.noteId, noteId),
      ),
    );
  const unique = [...new Set(studentYearIds.filter((s) => s))];
  if (unique.length) {
    await db.insert(teacherNoteTargets).values(
      unique.map((studentYearId) => ({ ownerId, noteId, studentYearId })),
    );
  }
}

/** 교사 한마디 목록(sortOrder 오름차순) + 개별 대상 매핑 포함. */
export async function listTeacherNotes(
  db: DB,
  ownerId: string,
): Promise<TeacherNoteRow[]> {
  const [notes, targets] = await Promise.all([
    db
      .select({
        id: teacherNotes.id,
        body: teacherNotes.body,
        sortOrder: teacherNotes.sortOrder,
        targetScope: teacherNotes.targetScope,
      })
      .from(teacherNotes)
      .where(eq(teacherNotes.ownerId, ownerId))
      .orderBy(asc(teacherNotes.sortOrder), asc(teacherNotes.createdAt)),
    loadNoteTargets(db, ownerId),
  ]);
  return notes.map((n) => ({
    id: n.id,
    body: n.body,
    sortOrder: n.sortOrder,
    targetScope: (n.targetScope === "individual" ? "individual" : "all"),
    targetStudentYearIds: targets.get(n.id) ?? [],
  }));
}

/**
 * 교사 한마디 추가. sortOrder 미지정 시 현재 최대값+1 로 말미에 추가.
 * targetScope='individual' 면 studentYearIds 를 teacher_note_targets 에 매핑.
 */
export async function createTeacherNote(
  db: DB,
  ownerId: string,
  body: string,
  sortOrder?: number,
  targetScope: TeacherNoteScope = "all",
  studentYearIds: string[] = [],
): Promise<{ id: string }> {
  const order =
    sortOrder ??
    (await listTeacherNotes(db, ownerId)).reduce(
      (m, n) => Math.max(m, n.sortOrder + 1),
      0,
    );
  const [row] = await db
    .insert(teacherNotes)
    .values({ ownerId, body: body.trim(), sortOrder: order, targetScope })
    .returning({ id: teacherNotes.id });
  if (targetScope === "individual") {
    await replaceNoteTargets(db, ownerId, row.id, studentYearIds);
  }
  return row;
}

/**
 * 개별 공지 일괄 생성 (QC v5 c5, AC-5.3). 선택 학생 N명 각자에게 **별도 개별공지 N개**를
 * 생성한다(공통 body 공유, 각 note 는 단일 대상 1학생). activities bulkSave 패턴 차용 —
 * 학생 1명당 row 1개. 각 row 는 독립 id 로 이후 개별 수정/삭제 가능.
 * sortOrder 는 현재 최대값+1 부터 학생 순서대로 1씩 증가시켜 말미에 추가한다.
 * 생성된 noteId 목록 반환.
 */
export async function bulkCreateIndividualTeacherNotes(
  db: DB,
  ownerId: string,
  body: string,
  studentYearIds: string[],
): Promise<string[]> {
  const unique = [...new Set(studentYearIds.filter((s) => s))];
  if (unique.length === 0) return [];
  const trimmed = body.trim();
  if (!trimmed) return [];
  const baseOrder = (await listTeacherNotes(db, ownerId)).reduce(
    (m, n) => Math.max(m, n.sortOrder + 1),
    0,
  );
  const rows = await db
    .insert(teacherNotes)
    .values(
      unique.map((_studentYearId, i) => ({
        ownerId,
        body: trimmed,
        sortOrder: baseOrder + i,
        targetScope: "individual" as TeacherNoteScope,
      })),
    )
    .returning({ id: teacherNotes.id });
  // 각 note 에 학생 1명씩 단일 대상 매핑.
  await db.insert(teacherNoteTargets).values(
    rows.map((r, i) => ({ ownerId, noteId: r.id, studentYearId: unique[i] })),
  );
  return rows.map((r) => r.id);
}

/**
 * 교사 한마디 내용 수정(본인 소유만). targetScope 지정 시 대상 범위/매핑도 갱신.
 * 'all' 로 바꾸면 기존 개별 대상 매핑을 비운다.
 */
export async function updateTeacherNote(
  db: DB,
  ownerId: string,
  id: string,
  body: string,
  targetScope?: TeacherNoteScope,
  studentYearIds: string[] = [],
): Promise<void> {
  await db
    .update(teacherNotes)
    .set({
      body: body.trim(),
      ...(targetScope ? { targetScope } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(teacherNotes.id, id), eq(teacherNotes.ownerId, ownerId)));
  if (targetScope === "individual") {
    await replaceNoteTargets(db, ownerId, id, studentYearIds);
  } else if (targetScope === "all") {
    await replaceNoteTargets(db, ownerId, id, []);
  }
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

/**
 * 교사 한마디를 한 칸 위/아래로 이동(AC-5.1). 현재 목록에서 인접 항목과 sortOrder 를
 * 교환(swap)하여 안정적으로 재정렬한다. 본인 소유만. 경계(맨 위에서 up 등)는 무시.
 */
export async function moveTeacherNote(
  db: DB,
  ownerId: string,
  id: string,
  direction: "up" | "down",
): Promise<void> {
  const notes = await listTeacherNotes(db, ownerId);
  const idx = notes.findIndex((n) => n.id === id);
  if (idx < 0) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= notes.length) return;
  const a = notes[idx];
  const b = notes[swapIdx];
  // sortOrder 값이 같을 수 있으므로(기본 0) 순서 인덱스 기반으로 명확히 교환한다.
  await reorderTeacherNote(db, ownerId, a.id, b.sortOrder);
  await reorderTeacherNote(db, ownerId, b.id, a.sortOrder);
  if (a.sortOrder === b.sortOrder) {
    // 동률이면 swap 만으로 순서가 안 바뀌므로 a 를 한 단계 밀어 분리한다.
    await reorderTeacherNote(
      db,
      ownerId,
      direction === "up" ? a.id : b.id,
      a.sortOrder - 1,
    );
  }
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
  isPublic: boolean; // 학생 공개 페이지(weekTodos) 노출 여부 (0045)
}

/** 공지(할일) 추가 — calendar_events(source=manual). isPublic=false 면 학생 페이지 비노출. */
export async function addNoticeEvent(
  db: DB,
  ownerId: string,
  date: string,
  title: string,
  content?: string | null,
  isPublic: boolean = true,
): Promise<{ id: string }> {
  const body = content && content.trim() ? content.trim() : null;
  const [row] = await db
    .insert(calendarEvents)
    .values({ ownerId, date, title, content: body, source: "manual", isPublic })
    .returning({ id: calendarEvents.id });
  return row;
}

/** 수동 공지 수정 — 제목·날짜·내용(content)·학생 공개 여부. 본인 소유 + manual 소스만. */
export async function updateNoticeEvent(
  db: DB,
  ownerId: string,
  id: string,
  date: string,
  title: string,
  content?: string | null,
  isPublic: boolean = true,
): Promise<void> {
  const body = content && content.trim() ? content.trim() : null;
  await db
    .update(calendarEvents)
    .set({ date, title, content: body, isPublic, updatedAt: new Date() })
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
      isPublic: calendarEvents.isPublic,
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
