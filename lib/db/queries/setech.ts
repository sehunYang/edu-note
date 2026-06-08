import { and, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { studentYears } from "../schema/identity";
import { courseSections } from "../schema/classes";
import {
  subjectObservations,
  homeroomBehaviorNotes,
  performanceAssessments,
  studentActivityEntries,
  studentExtraNotes,
  specialNoteDrafts,
} from "../schema/records";
import { byteLength, BYTE_LIMITS } from "@/lib/domain/byte-count";
import { verifyPastedDraft } from "@/lib/setech";
import type { SetechSourceBundle } from "@/lib/setech";
import type { SpecialNoteType } from "@/lib/domain/types";

/**
 * 세특 코워크 내보내기 쿼리 계층 (계획 §3.3 결정2, §4 C, AC-C).
 * 원천 데이터를 모아 SetechSourceBundle 로 묶고(→ buildSetechPrompt 로 번들 생성),
 * 코워크 결과를 붙여넣어 검수(verifyPastedDraft) 통과 시 special_note_drafts 저장.
 */
type DB = PostgresJsDatabase<typeof schema>;

/**
 * 한 학생·한 유형의 세특 원천 묶음 수집.
 * - subject: 해당 과목 분반의 관찰 + 수행평가
 * - behavior: 행동특성 기록
 * - autonomy/career: 해당 배치(placement)의 활동 기입
 * - club: 활동 기입 없음(동아리 기록은 Phase 2)
 */
export async function buildSourceBundle(
  db: DB,
  ownerId: string,
  studentYearId: string,
  noteType: SpecialNoteType,
  subjectId?: string | null,
): Promise<SetechSourceBundle> {
  const [student] = await db
    .select({ name: studentYears.name })
    .from(studentYears)
    .where(
      and(eq(studentYears.id, studentYearId), eq(studentYears.ownerId, ownerId)),
    )
    .limit(1);

  const observations: string[] = [];
  const keywords: string[] = [];
  const performances: SetechSourceBundle["performances"] = [];
  const activities: string[] = [];

  if (noteType === "behavior") {
    const notes = await db
      .select({
        body: homeroomBehaviorNotes.body,
        keywords: homeroomBehaviorNotes.keywords,
      })
      .from(homeroomBehaviorNotes)
      .where(
        and(
          eq(homeroomBehaviorNotes.ownerId, ownerId),
          eq(homeroomBehaviorNotes.studentYearId, studentYearId),
        ),
      )
      .orderBy(desc(homeroomBehaviorNotes.notedOn));
    for (const n of notes) {
      observations.push(n.body);
      if (n.keywords) keywords.push(...n.keywords);
    }
  } else if (noteType === "subject") {
    // 과목 분반의 관찰만(subjectId 지정 시). 미지정이면 학생 전체 교과 관찰.
    const obs = await db
      .select({
        body: subjectObservations.body,
        keywords: subjectObservations.keywords,
        sectionSubjectId: courseSections.subjectId,
      })
      .from(subjectObservations)
      .leftJoin(
        courseSections,
        eq(subjectObservations.sectionId, courseSections.id),
      )
      .where(
        and(
          eq(subjectObservations.ownerId, ownerId),
          eq(subjectObservations.studentYearId, studentYearId),
        ),
      )
      .orderBy(desc(subjectObservations.observedOn));
    for (const o of obs) {
      if (subjectId && o.sectionSubjectId && o.sectionSubjectId !== subjectId) continue;
      observations.push(o.body);
      if (o.keywords) keywords.push(...o.keywords);
    }

    const perfConds = [
      eq(performanceAssessments.ownerId, ownerId),
      eq(performanceAssessments.studentYearId, studentYearId),
    ];
    if (subjectId) perfConds.push(eq(performanceAssessments.subjectId, subjectId));
    const perf = await db
      .select({
        name: performanceAssessments.name,
        score: performanceAssessments.score,
        prose: performanceAssessments.prose,
      })
      .from(performanceAssessments)
      .where(and(...perfConds));
    for (const p of perf) {
      performances.push({ name: p.name, score: p.score, prose: p.prose });
    }
  } else if (noteType === "autonomy" || noteType === "career") {
    const acts = await db
      .select({ body: studentActivityEntries.body })
      .from(studentActivityEntries)
      .where(
        and(
          eq(studentActivityEntries.ownerId, ownerId),
          eq(studentActivityEntries.studentYearId, studentYearId),
          eq(studentActivityEntries.placement, noteType),
        ),
      )
      .orderBy(desc(studentActivityEntries.createdAt));
    activities.push(...acts.map((a) => a.body));
  }

  // 추가 메모는 모든 유형에 공통으로 합류.
  const extras = await db
    .select({ body: studentExtraNotes.body })
    .from(studentExtraNotes)
    .where(
      and(
        eq(studentExtraNotes.ownerId, ownerId),
        eq(studentExtraNotes.studentYearId, studentYearId),
      ),
    );

  return {
    studentName: student?.name ?? "",
    noteType,
    subjectName: null,
    observations,
    performances,
    activities,
    extraNotes: extras.map((e) => e.body),
    keywords: [...new Set(keywords)],
  };
}

export interface SaveDraftInput {
  studentYearId: string;
  noteType: SpecialNoteType;
  subjectId?: string | null;
  content: string;
  studentName?: string;
}

export interface SaveDraftResult {
  id: string;
  byteCount: number;
  byteLimit: number;
}

/**
 * 검수 통과한 세특 초안 저장(source=cowork). 차단성 경고(상한 초과·빈 내용)이면 throw.
 */
export async function saveDraft(
  db: DB,
  ownerId: string,
  input: SaveDraftInput,
): Promise<SaveDraftResult> {
  const verdict = verifyPastedDraft(input.content, input.noteType, input.studentName);
  if (!verdict.ok) {
    const blocking = verdict.warnings.find((w) => w.blocking);
    throw new Error(blocking?.message ?? "저장할 수 없는 초안입니다.");
  }
  const byteCount = byteLength(input.content);
  const [row] = await db
    .insert(specialNoteDrafts)
    .values({
      ownerId,
      studentYearId: input.studentYearId,
      type: input.noteType,
      subjectId: input.subjectId ?? null,
      content: input.content,
      byteCount,
      byteLimit: BYTE_LIMITS[input.noteType],
      status: "draft",
      source: "cowork",
      generatedAt: new Date(),
    })
    .returning({ id: specialNoteDrafts.id });
  return { id: row.id, byteCount, byteLimit: BYTE_LIMITS[input.noteType] };
}

export interface DraftRow {
  id: string;
  studentYearId: string;
  type: SpecialNoteType;
  content: string;
  byteCount: number;
  byteLimit: number;
  createdAt: Date;
}

/** 세특 초안 목록(학생 필터, 최신순). */
export async function listDrafts(
  db: DB,
  ownerId: string,
  studentYearId?: string,
): Promise<DraftRow[]> {
  const conds = [eq(specialNoteDrafts.ownerId, ownerId)];
  if (studentYearId) conds.push(eq(specialNoteDrafts.studentYearId, studentYearId));
  const rows = await db
    .select({
      id: specialNoteDrafts.id,
      studentYearId: specialNoteDrafts.studentYearId,
      type: specialNoteDrafts.type,
      content: specialNoteDrafts.content,
      byteCount: specialNoteDrafts.byteCount,
      byteLimit: specialNoteDrafts.byteLimit,
      createdAt: specialNoteDrafts.createdAt,
    })
    .from(specialNoteDrafts)
    .where(and(...conds))
    .orderBy(desc(specialNoteDrafts.createdAt));
  return rows.map((r) => ({ ...r, type: r.type as SpecialNoteType }));
}
