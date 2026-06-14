import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { studentYears } from "../schema/identity";
import { homeroomClasses, homeroomMembers } from "../schema/classes";
import {
  studentActivityEntries,
  homeroomBehaviorNotes,
  studentExtraNotes,
  classRoles,
  specialNoteDrafts,
} from "../schema/records";
import { byteLength, BYTE_LIMITS } from "@/lib/domain/byte-count";

/**
 * 생기부 작성 코워크 쿼리 계층 (QC v3 Part B US-B12, AC-11.x).
 *
 * 담임반 학생별로 자율(autonomy)·진로(career)·행동발달 및 특기사항(behavior)
 * 세 영역의 **원천자료**를 모아 CSV 내보내기용 구조로 묶고, 코워크 결과 텍스트를
 * special_note_drafts(type=영역, subjectId=null, source=cowork)로 upsert 한다.
 * 세특(setech.ts)과 독립이며 학기 구분 없음(연말 1회).
 *
 * 원천 매핑:
 * - 자율   = studentActivityEntries placement='autonomy' body
 * - 진로   = studentActivityEntries placement='career' body
 * - 행발   = homeroomBehaviorNotes body + studentExtraNotes(subjectId null) body
 *            + class_roles(roleName/roleDesc)
 */
type DB = PostgresJsDatabase<typeof schema>;

/** 생기부 작성 영역(자율/진로/행발). specialNoteType 의 부분집합이라 BYTE_LIMITS 재사용. */
export type HomeroomRecordArea = "autonomy" | "career" | "behavior";

/** 한 학생의 3영역 원천자료 묶음(CSV 내보내기 한 행). */
export interface HomeroomRecordSource {
  studentYearId: string;
  sid: string;
  name: string;
  /** 자율활동 원천(활동 기입 body). */
  autonomy: string[];
  /** 진로활동 원천(활동 기입 body). */
  career: string[];
  /** 행동발달 및 특기사항 원천(행특 + 추가메모 + 학급역할). */
  behavior: string[];
}

/**
 * AC-11.1 — 담임반 학생별 3영역 원천자료 수집. 학생 1명당 한 묶음.
 * 담임반 미지정이면 빈 배열. ownerId 가드. 학생 집합 단위 배치 조회(N+1 회피).
 */
export async function collectRecordSources(
  db: DB,
  ownerId: string,
  year: number,
): Promise<HomeroomRecordSource[]> {
  const students = await db
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
    .innerJoin(studentYears, eq(studentYears.id, homeroomMembers.studentYearId))
    .where(
      and(
        eq(homeroomMembers.ownerId, ownerId),
        eq(homeroomClasses.schoolYear, year),
      ),
    )
    .orderBy(asc(studentYears.sid));

  if (students.length === 0) return [];
  const ids = students.map((s) => s.id);

  // 자율/진로 활동 기입(placement 별).
  const activities = await db
    .select({
      studentYearId: studentActivityEntries.studentYearId,
      placement: studentActivityEntries.placement,
      body: studentActivityEntries.body,
    })
    .from(studentActivityEntries)
    .where(
      and(
        eq(studentActivityEntries.ownerId, ownerId),
        inArray(studentActivityEntries.studentYearId, ids),
      ),
    )
    .orderBy(desc(studentActivityEntries.createdAt));

  // 행특 기록.
  const behaviorNotes = await db
    .select({
      studentYearId: homeroomBehaviorNotes.studentYearId,
      body: homeroomBehaviorNotes.body,
    })
    .from(homeroomBehaviorNotes)
    .where(
      and(
        eq(homeroomBehaviorNotes.ownerId, ownerId),
        inArray(homeroomBehaviorNotes.studentYearId, ids),
      ),
    )
    .orderBy(desc(homeroomBehaviorNotes.notedOn));

  // 추가메모(subjectId null = 담임 상담 코워크 업로드 등 공통 메모).
  const extraNotes = await db
    .select({
      studentYearId: studentExtraNotes.studentYearId,
      body: studentExtraNotes.body,
    })
    .from(studentExtraNotes)
    .where(
      and(
        eq(studentExtraNotes.ownerId, ownerId),
        inArray(studentExtraNotes.studentYearId, ids),
      ),
    );

  // 학급역할.
  const roles = await db
    .select({
      studentYearId: classRoles.studentYearId,
      roleName: classRoles.roleName,
      roleDesc: classRoles.roleDesc,
    })
    .from(classRoles)
    .where(
      and(
        eq(classRoles.ownerId, ownerId),
        inArray(classRoles.studentYearId, ids),
      ),
    )
    .orderBy(asc(classRoles.createdAt));

  const bucket = new Map<string, HomeroomRecordSource>();
  for (const s of students) {
    bucket.set(s.id, {
      studentYearId: s.id,
      sid: s.sid,
      name: s.name,
      autonomy: [],
      career: [],
      behavior: [],
    });
  }
  for (const a of activities) {
    const row = bucket.get(a.studentYearId);
    if (!row) continue;
    const body = a.body.trim();
    if (!body) continue;
    if (a.placement === "autonomy") row.autonomy.push(body);
    else if (a.placement === "career") row.career.push(body);
  }
  for (const n of behaviorNotes) {
    const row = bucket.get(n.studentYearId);
    if (!row) continue;
    const body = n.body.trim();
    if (body) row.behavior.push(body);
  }
  for (const e of extraNotes) {
    const row = bucket.get(e.studentYearId);
    if (!row) continue;
    const body = e.body.trim();
    if (body) row.behavior.push(body);
  }
  for (const r of roles) {
    const row = bucket.get(r.studentYearId);
    if (!row) continue;
    const label = r.roleDesc?.trim()
      ? `${r.roleName} — ${r.roleDesc.trim()}`
      : r.roleName.trim();
    if (label) row.behavior.push(`[학급역할] ${label}`);
  }

  return students.map((s) => bucket.get(s.id)!);
}

export interface SaveHomeroomRecordDraftResult {
  id: string;
  byteCount: number;
  byteLimit: number;
}

/**
 * AC-11.2 — 코워크 결과 1건 저장. special_note_drafts(type=area, subjectId=null,
 * source='cowork')로 insert. byteLimit 은 영역별 NEIS 상한(BYTE_LIMITS) 재사용.
 * setech.saveDraft 와 달리 byte 검수만 하고 verifyPastedDraft 는 적용하지 않는다
 * (생기부 영역은 과목 세특 기재금지 규칙과 검수 대상이 다름 — 단순 저장 경로).
 */
export async function saveHomeroomRecordDraft(
  db: DB,
  ownerId: string,
  studentYearId: string,
  area: HomeroomRecordArea,
  content: string,
): Promise<SaveHomeroomRecordDraftResult> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("내용이 비어 있습니다.");
  const byteCount = byteLength(content);
  const byteLimit = BYTE_LIMITS[area];
  if (byteCount > byteLimit) {
    throw new Error(`바이트 상한 초과(${byteCount}/${byteLimit}).`);
  }
  const [row] = await db
    .insert(specialNoteDrafts)
    .values({
      ownerId,
      studentYearId,
      type: area,
      subjectId: null,
      content,
      byteCount,
      byteLimit,
      status: "draft",
      source: "cowork",
      generatedAt: new Date(),
    })
    .returning({ id: specialNoteDrafts.id });
  return { id: row.id, byteCount, byteLimit };
}

export interface HomeroomRecordDraftRow {
  id: string;
  studentYearId: string;
  area: HomeroomRecordArea;
  content: string;
  byteCount: number;
  byteLimit: number;
  createdAt: Date;
}

/**
 * AC-11.3 — 저장된 생기부 초안 목록(담임반 학생 한정, 영역 필터 선택). 최신순.
 * subjectId null + type ∈ {autonomy, career, behavior} 만 반환(세특/동아리 제외).
 */
export async function listHomeroomRecordDrafts(
  db: DB,
  ownerId: string,
  year: number,
  area?: HomeroomRecordArea,
): Promise<HomeroomRecordDraftRow[]> {
  const members = await db
    .select({ id: studentYears.id })
    .from(homeroomMembers)
    .innerJoin(
      homeroomClasses,
      eq(homeroomClasses.id, homeroomMembers.homeroomId),
    )
    .innerJoin(studentYears, eq(studentYears.id, homeroomMembers.studentYearId))
    .where(
      and(
        eq(homeroomMembers.ownerId, ownerId),
        eq(homeroomClasses.schoolYear, year),
      ),
    );
  if (members.length === 0) return [];
  const ids = members.map((m) => m.id);

  const areas: HomeroomRecordArea[] = area
    ? [area]
    : ["autonomy", "career", "behavior"];
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
    .where(
      and(
        eq(specialNoteDrafts.ownerId, ownerId),
        inArray(specialNoteDrafts.studentYearId, ids),
        inArray(specialNoteDrafts.type, areas),
      ),
    )
    .orderBy(desc(specialNoteDrafts.createdAt));

  return rows.map((r) => ({
    id: r.id,
    studentYearId: r.studentYearId,
    area: r.type as HomeroomRecordArea,
    content: r.content,
    byteCount: r.byteCount,
    byteLimit: r.byteLimit,
    createdAt: r.createdAt,
  }));
}
