import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { tasks } from "../schema/misc";

/**
 * 업무(to-do) 쿼리 계층 (계획 §3.3 tasks, §4 Phase2-H).
 * 제목·마감일·진척(0~100). 마감 임박순 정렬.
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface TaskRow {
  id: string;
  title: string;
  deadline: string | null; // YYYY-MM-DD
  progress: number; // 0~100
  createdAt: Date;
}

export interface CreateTaskInput {
  title: string;
  deadline?: string | null;
  progress?: number;
}

/** 진척률을 0~100 정수로 클램프. */
function clampProgress(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** 업무 생성. */
export async function createTask(
  db: DB,
  ownerId: string,
  input: CreateTaskInput,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(tasks)
    .values({
      ownerId,
      title: input.title,
      deadline: input.deadline ?? null,
      progress: clampProgress(input.progress ?? 0),
    })
    .returning({ id: tasks.id });
  return row;
}

/** 업무 목록. 마감일 오름차순(미설정은 뒤로), 그다음 최신순. */
export async function listTasks(db: DB, ownerId: string): Promise<TaskRow[]> {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      deadline: tasks.deadline,
      progress: tasks.progress,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .where(eq(tasks.ownerId, ownerId))
    .orderBy(asc(tasks.deadline), asc(tasks.createdAt));
  // deadline null 은 SQL 에서 마지막으로 가도록 보정(asc nulls 동작은 드라이버 기본에 의존).
  return rows.sort((a, b) => {
    if (a.deadline === b.deadline) return 0;
    if (a.deadline === null) return 1;
    if (b.deadline === null) return -1;
    return a.deadline < b.deadline ? -1 : 1;
  });
}

/** 업무 진척 갱신(소유자 본인 행만). */
export async function updateTaskProgress(
  db: DB,
  ownerId: string,
  id: string,
  progress: number,
): Promise<void> {
  await db
    .update(tasks)
    .set({ progress: clampProgress(progress), updatedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)));
}

/** 업무 삭제(소유자 본인 행만). */
export async function deleteTask(
  db: DB,
  ownerId: string,
  id: string,
): Promise<void> {
  await db
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)));
}
