import { and, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { studentActivityEntries } from "../schema/records";
import { resolvePlacement } from "@/lib/domain/activity-placement";
import type { ActivityTag, ActivityPlacement } from "@/lib/domain/types";

/**
 * 학생 활동 기입 쿼리 계층 (계획 §3.3 records, §3.4 activityPlacement, AC-E).
 *
 * tag=both(자율·진로 둘 다) 활동은 생성 시 placement 를 **1곳으로 확정**해
 * 양쪽 세특에 중복 투입되지 않게 한다(도메인 규칙 resolvePlacement).
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface CreateActivityInput {
  studentYearId: string;
  tag: ActivityTag;
  body: string;
}

export interface ActivityRow {
  id: string;
  studentYearId: string;
  tag: ActivityTag;
  placement: ActivityPlacement;
  body: string;
  createdAt: Date;
}

/** 활동 기입 생성. tag→placement 1곳 확정 후 저장. 생성된 행 반환. */
export async function createStudentActivityEntry(
  db: DB,
  ownerId: string,
  input: CreateActivityInput,
): Promise<ActivityRow> {
  const placement = resolvePlacement(input.tag);
  const [row] = await db
    .insert(studentActivityEntries)
    .values({
      ownerId,
      studentYearId: input.studentYearId,
      tag: input.tag,
      placement,
      body: input.body,
    })
    .returning({
      id: studentActivityEntries.id,
      studentYearId: studentActivityEntries.studentYearId,
      tag: studentActivityEntries.tag,
      placement: studentActivityEntries.placement,
      body: studentActivityEntries.body,
      createdAt: studentActivityEntries.createdAt,
    });
  // placement 컬럼은 nullable 이지만 생성 시 항상 채운다(non-null 단언).
  return { ...row, placement: row.placement as ActivityPlacement };
}

/** 학생별(또는 전체) 활동 기입 목록. 최신순. */
export async function listStudentActivities(
  db: DB,
  ownerId: string,
  studentYearId?: string,
): Promise<ActivityRow[]> {
  const where = studentYearId
    ? and(
        eq(studentActivityEntries.ownerId, ownerId),
        eq(studentActivityEntries.studentYearId, studentYearId),
      )
    : eq(studentActivityEntries.ownerId, ownerId);

  const rows = await db
    .select({
      id: studentActivityEntries.id,
      studentYearId: studentActivityEntries.studentYearId,
      tag: studentActivityEntries.tag,
      placement: studentActivityEntries.placement,
      body: studentActivityEntries.body,
      createdAt: studentActivityEntries.createdAt,
    })
    .from(studentActivityEntries)
    .where(where)
    .orderBy(desc(studentActivityEntries.createdAt));

  return rows.map((r) => ({ ...r, placement: r.placement as ActivityPlacement }));
}

/** 활동 기입 삭제(소유자 본인 행만). */
export async function deleteStudentActivityEntry(
  db: DB,
  ownerId: string,
  id: string,
): Promise<void> {
  await db
    .delete(studentActivityEntries)
    .where(
      and(
        eq(studentActivityEntries.id, id),
        eq(studentActivityEntries.ownerId, ownerId),
      ),
    );
}
