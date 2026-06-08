import { and, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { counselingLogs } from "../schema/misc";

/**
 * 상담일지 쿼리 계층 (계획 §3.3 counseling_logs, §4 Phase2-G).
 *
 * 학생/학부모 상담 기록(줄글). AI 분석 컬럼은 추후 — Phase 2 는 목업 UI 만 제공한다.
 */
type DB = PostgresJsDatabase<typeof schema>;

export type CounselTarget = "student" | "parent";

export interface CreateCounselingInput {
  studentYearId: string;
  date: string; // YYYY-MM-DD
  target: CounselTarget;
  body: string;
}

export interface CounselingRow {
  id: string;
  studentYearId: string;
  date: string;
  target: CounselTarget;
  body: string;
  createdAt: Date;
}

/** 상담일지 작성. 생성된 행 반환. */
export async function createCounselingLog(
  db: DB,
  ownerId: string,
  input: CreateCounselingInput,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(counselingLogs)
    .values({
      ownerId,
      studentYearId: input.studentYearId,
      date: input.date,
      target: input.target,
      body: input.body,
    })
    .returning({ id: counselingLogs.id });
  return row;
}

/** 상담일지 목록(학생별 또는 전체). 최신 상담일순. */
export async function listCounselingLogs(
  db: DB,
  ownerId: string,
  studentYearId?: string,
): Promise<CounselingRow[]> {
  const where = studentYearId
    ? and(
        eq(counselingLogs.ownerId, ownerId),
        eq(counselingLogs.studentYearId, studentYearId),
      )
    : eq(counselingLogs.ownerId, ownerId);

  const rows = await db
    .select({
      id: counselingLogs.id,
      studentYearId: counselingLogs.studentYearId,
      date: counselingLogs.date,
      target: counselingLogs.target,
      body: counselingLogs.body,
      createdAt: counselingLogs.createdAt,
    })
    .from(counselingLogs)
    .where(where)
    .orderBy(desc(counselingLogs.date), desc(counselingLogs.createdAt));

  return rows.map((r) => ({ ...r, target: r.target as CounselTarget }));
}

/** 상담일지 삭제(소유자 본인 행만). */
export async function deleteCounselingLog(
  db: DB,
  ownerId: string,
  id: string,
): Promise<void> {
  await db
    .delete(counselingLogs)
    .where(
      and(eq(counselingLogs.id, id), eq(counselingLogs.ownerId, ownerId)),
    );
}
