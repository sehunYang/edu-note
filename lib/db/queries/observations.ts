import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  subjectObservations,
  homeroomBehaviorNotes,
} from "../schema/records";
import {
  courseSections,
  enrollments,
  subjects,
  homeroomClasses,
  homeroomMembers,
} from "../schema/classes";
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

/**
 * 교과 관찰기록 추가. 분반귀속 **필수**(앱레이어 강제 — DB 컬럼은 nullable 유지,
 * 레거시 null-section 행 무손상). sectionId 미지정 시 throw(Pre-mortem #2, AC-O1).
 * sessionId 는 교실 관찰(날짜+분반 스코프)에서 미사용 → null 유지.
 */
export async function addSubjectObservation(
  db: DB,
  ownerId: string,
  input: AddObservationInput,
): Promise<ObservationRow> {
  if (!input.sectionId) throw new Error("분반을 선택하세요.");
  const [row] = await db
    .insert(subjectObservations)
    .values({
      ownerId,
      studentYearId: input.studentYearId,
      sectionId: input.sectionId,
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

export interface UpdateObservationInput {
  body?: string;
  keywords?: string[];
  observedOn?: string;
}

/** 교과 관찰기록 수정(ownerId 가드). 전달된 필드만 갱신. */
export async function updateSubjectObservation(
  db: DB,
  ownerId: string,
  id: string,
  patch: UpdateObservationInput,
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.body !== undefined) set.body = patch.body;
  if (patch.keywords !== undefined)
    set.keywords = patch.keywords.length > 0 ? patch.keywords : null;
  if (patch.observedOn !== undefined) set.observedOn = patch.observedOn;
  await db
    .update(subjectObservations)
    .set(set)
    .where(
      and(
        eq(subjectObservations.id, id),
        eq(subjectObservations.ownerId, ownerId),
      ),
    );
}

/** 교과 관찰기록 삭제(ownerId 가드). */
export async function deleteSubjectObservation(
  db: DB,
  ownerId: string,
  id: string,
): Promise<void> {
  await db
    .delete(subjectObservations)
    .where(
      and(
        eq(subjectObservations.id, id),
        eq(subjectObservations.ownerId, ownerId),
      ),
    );
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

export interface UpdateBehaviorNoteInput {
  body?: string;
  keywords?: string[];
  notedOn?: string;
}

/** 행동특성 기록 수정(ownerId 가드). 전달된 필드만 갱신. */
export async function updateBehaviorNote(
  db: DB,
  ownerId: string,
  id: string,
  patch: UpdateBehaviorNoteInput,
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.body !== undefined) set.body = patch.body;
  if (patch.keywords !== undefined)
    set.keywords = patch.keywords.length > 0 ? patch.keywords : null;
  if (patch.notedOn !== undefined) set.notedOn = patch.notedOn;
  await db
    .update(homeroomBehaviorNotes)
    .set(set)
    .where(
      and(
        eq(homeroomBehaviorNotes.id, id),
        eq(homeroomBehaviorNotes.ownerId, ownerId),
      ),
    );
}

/** 행동특성 기록 삭제(ownerId 가드). */
export async function deleteBehaviorNote(
  db: DB,
  ownerId: string,
  id: string,
): Promise<void> {
  await db
    .delete(homeroomBehaviorNotes)
    .where(
      and(
        eq(homeroomBehaviorNotes.id, id),
        eq(homeroomBehaviorNotes.ownerId, ownerId),
      ),
    );
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

/** 담임반 학생별 행동특성 누적 기록수 + 표시명(가중랜덤 입력 행, QC v6 ⑥). */
export interface HomeroomBehaviorCountRow extends RecordCountItem {
  sid: string;
  name: string;
}

/**
 * 담임반 학생별 행동특성 누적 기록수 집계(넛지 가중랜덤 입력, QC v6 ⑥). 해당 학년도
 * 담임반 학생 전체를 0건 포함해 반환하므로, 행특 기록이 적은 학생일수록 가중치가 높아져
 * 누적되면 골고루 기록된다. 관찰기록 카운트와는 별개(행동특성 기록만 집계).
 */
export async function countHomeroomBehaviorByStudent(
  db: DB,
  ownerId: string,
  schoolYear: number,
): Promise<HomeroomBehaviorCountRow[]> {
  const rows = await db
    .select({
      id: studentYears.id,
      sid: studentYears.sid,
      name: studentYears.name,
      recordCount: sql<number>`count(${homeroomBehaviorNotes.id})::int`,
    })
    .from(homeroomMembers)
    .innerJoin(
      homeroomClasses,
      eq(homeroomClasses.id, homeroomMembers.homeroomId),
    )
    .innerJoin(studentYears, eq(studentYears.id, homeroomMembers.studentYearId))
    .leftJoin(
      homeroomBehaviorNotes,
      eq(homeroomBehaviorNotes.studentYearId, studentYears.id),
    )
    .where(
      and(
        eq(homeroomMembers.ownerId, ownerId),
        eq(homeroomClasses.schoolYear, schoolYear),
      ),
    )
    .groupBy(studentYears.id, studentYears.sid, studentYears.name);
  return rows.map((r) => ({
    id: r.id,
    sid: r.sid,
    name: r.name,
    recordCount: Number(r.recordCount),
  }));
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

export interface SectionStudentRow {
  id: string;
  sid: string;
  name: string;
}

/**
 * 분반 수강생 목록(학번순). 분반→학생 필터(AC-O3)용. enrollments→studentYears 조인,
 * ownerId 가드. 결과는 해당 분반에 등록된 학생만.
 */
export async function listStudentsBySection(
  db: DB,
  ownerId: string,
  sectionId: string,
): Promise<SectionStudentRow[]> {
  return db
    .select({
      id: studentYears.id,
      sid: studentYears.sid,
      name: studentYears.name,
    })
    .from(enrollments)
    .innerJoin(studentYears, eq(enrollments.studentYearId, studentYears.id))
    .where(
      and(
        eq(enrollments.ownerId, ownerId),
        eq(enrollments.sectionId, sectionId),
      ),
    )
    .orderBy(asc(studentYears.sid));
}

export interface StudentSectionRow {
  sectionId: string;
  label: string;
  subjectName: string;
}

/**
 * 학생이 수강 중인 분반 목록(학생→수강분반 자동매칭, AC-O2). 활성 학기 과목으로 한정해
 * (year, sem) 필터. 복수일 때 UI 토글 입력이 된다. ownerId 가드.
 */
export async function listSectionsForStudent(
  db: DB,
  ownerId: string,
  studentYearId: string,
  year: number,
  sem: number,
): Promise<StudentSectionRow[]> {
  return db
    .select({
      sectionId: courseSections.id,
      label: courseSections.label,
      subjectName: subjects.name,
    })
    .from(enrollments)
    .innerJoin(courseSections, eq(courseSections.id, enrollments.sectionId))
    .innerJoin(subjects, eq(subjects.id, courseSections.subjectId))
    .where(
      and(
        eq(enrollments.ownerId, ownerId),
        eq(enrollments.studentYearId, studentYearId),
        eq(subjects.schoolYear, year),
        eq(subjects.semester, sem),
      ),
    )
    .orderBy(asc(subjects.name), asc(courseSections.label));
}

/**
 * 담임반 학생 목록(학번순). 행특 기록 대상 제한(AC-O6)용. homeroomMembers→studentYears
 * 조인을 해당 학년도 담임반으로 한정. 담임반 미지정이면 빈 배열(UI 안내). ownerId 가드.
 */
export async function listHomeroomStudents(
  db: DB,
  ownerId: string,
  year: number,
): Promise<SectionStudentRow[]> {
  return db
    .select({
      id: studentYears.id,
      sid: studentYears.sid,
      name: studentYears.name,
    })
    .from(homeroomMembers)
    .innerJoin(
      homeroomClasses,
      eq(homeroomClasses.id, homeroomMembers.homeroomId),
    )
    .innerJoin(
      studentYears,
      eq(studentYears.id, homeroomMembers.studentYearId),
    )
    .where(
      and(
        eq(homeroomMembers.ownerId, ownerId),
        eq(homeroomClasses.schoolYear, year),
      ),
    )
    .orderBy(asc(studentYears.sid));
}
