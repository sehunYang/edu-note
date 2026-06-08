import { and, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  subjectObservations,
  homeroomBehaviorNotes,
} from "../schema/records";
import { studentYears } from "../schema/identity";
import type { RecordCountItem } from "@/lib/domain/nudge";

/**
 * 기록(관찰/행특) 쿼리 계층 (계획 §3.3 records C, §4 C).
 * - 교과 관찰기록(subject_observations): 수업 단위, 교과 키워드.
 * - 행동특성 기록(homeroom_behavior_notes): 담임 매일, 행특 키워드.
 * 학생별 기록수 집계는 넛지(미기록 수업 2명 가중랜덤)의 입력이 된다.
 */
type DB = PostgresJsDatabase<typeof schema>;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface AddObservationInput {
  studentYearId: string;
  sectionId?: string | null;
  observedOn?: string;
  body: string;
  keywords?: string[];
}

export interface ObservationRow {
  id: string;
  studentYearId: string;
  sectionId: string | null;
  observedOn: string;
  body: string;
  keywords: string[] | null;
  createdAt: Date;
}

/** 교과 관찰기록 추가. */
export async function addSubjectObservation(
  db: DB,
  ownerId: string,
  input: AddObservationInput,
): Promise<ObservationRow> {
  const [row] = await db
    .insert(subjectObservations)
    .values({
      ownerId,
      studentYearId: input.studentYearId,
      sectionId: input.sectionId ?? null,
      observedOn: input.observedOn ?? todayStr(),
      body: input.body,
      keywords: input.keywords && input.keywords.length > 0 ? input.keywords : null,
    })
    .returning({
      id: subjectObservations.id,
      studentYearId: subjectObservations.studentYearId,
      sectionId: subjectObservations.sectionId,
      observedOn: subjectObservations.observedOn,
      body: subjectObservations.body,
      keywords: subjectObservations.keywords,
      createdAt: subjectObservations.createdAt,
    });
  return row;
}

/** 교과 관찰기록 목록. 학생·분반 필터, 최신순. */
export async function listSubjectObservations(
  db: DB,
  ownerId: string,
  opts: { studentYearId?: string; sectionId?: string; limit?: number } = {},
): Promise<ObservationRow[]> {
  const conds = [eq(subjectObservations.ownerId, ownerId)];
  if (opts.studentYearId)
    conds.push(eq(subjectObservations.studentYearId, opts.studentYearId));
  if (opts.sectionId) conds.push(eq(subjectObservations.sectionId, opts.sectionId));

  const q = db
    .select({
      id: subjectObservations.id,
      studentYearId: subjectObservations.studentYearId,
      sectionId: subjectObservations.sectionId,
      observedOn: subjectObservations.observedOn,
      body: subjectObservations.body,
      keywords: subjectObservations.keywords,
      createdAt: subjectObservations.createdAt,
    })
    .from(subjectObservations)
    .where(and(...conds))
    .orderBy(desc(subjectObservations.observedOn), desc(subjectObservations.createdAt));

  return opts.limit ? q.limit(opts.limit) : q;
}

export interface AddBehaviorNoteInput {
  studentYearId: string;
  notedOn?: string;
  body: string;
  keywords?: string[];
}

export interface BehaviorNoteRow {
  id: string;
  studentYearId: string;
  notedOn: string;
  body: string;
  keywords: string[] | null;
  createdAt: Date;
}

/** 행동특성 기록 추가. */
export async function addBehaviorNote(
  db: DB,
  ownerId: string,
  input: AddBehaviorNoteInput,
): Promise<BehaviorNoteRow> {
  const [row] = await db
    .insert(homeroomBehaviorNotes)
    .values({
      ownerId,
      studentYearId: input.studentYearId,
      notedOn: input.notedOn ?? todayStr(),
      body: input.body,
      keywords: input.keywords && input.keywords.length > 0 ? input.keywords : null,
    })
    .returning({
      id: homeroomBehaviorNotes.id,
      studentYearId: homeroomBehaviorNotes.studentYearId,
      notedOn: homeroomBehaviorNotes.notedOn,
      body: homeroomBehaviorNotes.body,
      keywords: homeroomBehaviorNotes.keywords,
      createdAt: homeroomBehaviorNotes.createdAt,
    });
  return row;
}

/** 행동특성 기록 목록. 학생 필터, 최신순. */
export async function listBehaviorNotes(
  db: DB,
  ownerId: string,
  opts: { studentYearId?: string; limit?: number } = {},
): Promise<BehaviorNoteRow[]> {
  const conds = [eq(homeroomBehaviorNotes.ownerId, ownerId)];
  if (opts.studentYearId)
    conds.push(eq(homeroomBehaviorNotes.studentYearId, opts.studentYearId));

  const q = db
    .select({
      id: homeroomBehaviorNotes.id,
      studentYearId: homeroomBehaviorNotes.studentYearId,
      notedOn: homeroomBehaviorNotes.notedOn,
      body: homeroomBehaviorNotes.body,
      keywords: homeroomBehaviorNotes.keywords,
      createdAt: homeroomBehaviorNotes.createdAt,
    })
    .from(homeroomBehaviorNotes)
    .where(and(...conds))
    .orderBy(desc(homeroomBehaviorNotes.notedOn), desc(homeroomBehaviorNotes.createdAt));

  return opts.limit ? q.limit(opts.limit) : q;
}

/**
 * 학생별 교과 관찰기록 수 집계(넛지 가중랜덤 입력). 해당 연도 등록 학생 전체를
 * 0건 포함해 반환하므로, 기록이 적은 학생일수록 가중치가 높아진다.
 */
export async function countSubjectObservationsByStudent(
  db: DB,
  ownerId: string,
  schoolYear: number,
): Promise<RecordCountItem[]> {
  const rows = await db
    .select({
      id: studentYears.id,
      recordCount: sql<number>`count(${subjectObservations.id})::int`,
    })
    .from(studentYears)
    .leftJoin(
      subjectObservations,
      eq(subjectObservations.studentYearId, studentYears.id),
    )
    .where(
      and(eq(studentYears.ownerId, ownerId), eq(studentYears.schoolYear, schoolYear)),
    )
    .groupBy(studentYears.id);
  return rows.map((r) => ({ id: r.id, recordCount: Number(r.recordCount) }));
}

/** 오늘 행특을 기록하지 않은 학생 id 집합(16시 후 넛지용). */
export async function studentsWithoutBehaviorNoteToday(
  db: DB,
  ownerId: string,
  schoolYear: number,
  onDate: string = todayStr(),
): Promise<string[]> {
  const all = await db
    .select({ id: studentYears.id })
    .from(studentYears)
    .where(
      and(eq(studentYears.ownerId, ownerId), eq(studentYears.schoolYear, schoolYear)),
    );
  const noted = await db
    .select({ id: homeroomBehaviorNotes.studentYearId })
    .from(homeroomBehaviorNotes)
    .where(
      and(
        eq(homeroomBehaviorNotes.ownerId, ownerId),
        eq(homeroomBehaviorNotes.notedOn, onDate),
      ),
    );
  const notedSet = new Set(noted.map((n) => n.id));
  return all.map((a) => a.id).filter((id) => !notedSet.has(id));
}
