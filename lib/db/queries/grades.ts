import { and, asc, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  subjects,
  courseSections,
  enrollments,
  performanceItems,
} from "../schema/classes";
import { studentYears } from "../schema/identity";
import { performanceAssessments, jipilScores } from "../schema/records";

/**
 * 성적 기록 쿼리 계층 (교실 2-2 단계4, ownerId 인자 규약).
 *
 * - 원점수만 저장(읽기시점 환산) — getGradeView 가 환산값을 산출하되 저장 금지.
 * - 학번(sid)→studentYearId 매핑은 해당 과목의 분반 수강생 기준. 미매칭 sid 는 스킵+리포트.
 * - 수행 weight 검증은 performanceItems 를 (subjectId, name) 문자열 조인(FK 없음 —
 *   항목명 변경 시 조인 실패 → weight 검증 skip, ADR Follow-up). 점수>weight 는 비차단 경고.
 * - 수행은 과목단위 1행(분반 무관). 한 학생이 같은 과목 2분반 수강 시
 *   (studentYearId, subjectId, name) upsert 가 정상(과목 평가).
 */
type DB = PostgresJsDatabase<typeof schema>;

/** 한 행의 sid 매핑 실패 리포트. */
export interface SkippedRow {
  sid: string;
  reason: string;
}

export interface PerformanceUpsertInput {
  sid: string;
  score: number | null;
  prose: string | null;
}

export interface UpsertResult {
  saved: number;
  skipped: SkippedRow[];
  /** 비차단 경고(점수 > weight 등). 저장은 진행. */
  warnings: string[];
}

export interface JipilUpsertInput {
  sid: string;
  rawScore: number | null;
}

export interface JipilUpsertResult {
  saved: number;
  skipped: SkippedRow[];
}

/**
 * 과목 수강생 학번→studentYearId 맵. 과목의 모든 분반(enrollments) 학생 union.
 * 동일 학생이 2분반이어도 studentYearId 는 동일하므로 맵 키 충돌 무해.
 */
async function sidToStudentYearId(
  db: DB,
  ownerId: string,
  subjectId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ sid: studentYears.sid, studentYearId: studentYears.id })
    .from(enrollments)
    .innerJoin(courseSections, eq(enrollments.sectionId, courseSections.id))
    .innerJoin(studentYears, eq(enrollments.studentYearId, studentYears.id))
    .where(
      and(
        eq(enrollments.ownerId, ownerId),
        eq(courseSections.subjectId, subjectId),
      ),
    );
  const map = new Map<string, string>();
  for (const r of rows) map.set(r.sid, r.studentYearId);
  return map;
}

/**
 * 수행평가 점수 upsert(항목별). 충돌 키 (studentYearId, subjectId, name=itemName).
 * 미매칭 sid 는 skipped. 점수>weight 는 비차단 경고(저장 진행). weight 미발견 시 검증 skip.
 */
export async function upsertPerformanceScores(
  db: DB,
  ownerId: string,
  subjectId: string,
  itemName: string,
  rows: PerformanceUpsertInput[],
): Promise<UpsertResult> {
  const sidMap = await sidToStudentYearId(db, ownerId, subjectId);

  // weight 조회: (subjectId, name) 조인(FK 없음). 미발견이면 검증 skip.
  const [item] = await db
    .select({ weight: performanceItems.weight })
    .from(performanceItems)
    .where(
      and(
        eq(performanceItems.ownerId, ownerId),
        eq(performanceItems.subjectId, subjectId),
        eq(performanceItems.name, itemName),
      ),
    )
    .limit(1);
  const weight =
    item && item.weight !== null ? Number(item.weight) : null;

  const skipped: SkippedRow[] = [];
  const warnings: string[] = [];
  let saved = 0;

  for (const row of rows) {
    const studentYearId = sidMap.get(row.sid);
    if (!studentYearId) {
      skipped.push({ sid: row.sid, reason: "수강생 명단에 없는 학번" });
      continue;
    }

    if (
      weight !== null &&
      row.score !== null &&
      Number.isFinite(weight) &&
      row.score > weight
    ) {
      warnings.push(
        `학번 ${row.sid}: 점수(${row.score})가 반영비율(${weight})을 초과`,
      );
    }

    const score = row.score === null ? null : String(row.score);
    const prose = row.prose?.trim() ? row.prose.trim() : null;
    // performance_assessments 에 (studentYearId,subjectId,name) 유니크 제약이 없으므로
    // ON CONFLICT 대신 수동 upsert(select→update/insert). 단일 교사 순차 업로드라 경합 무관.
    const [existing] = await db
      .select({ id: performanceAssessments.id })
      .from(performanceAssessments)
      .where(
        and(
          eq(performanceAssessments.ownerId, ownerId),
          eq(performanceAssessments.studentYearId, studentYearId),
          eq(performanceAssessments.subjectId, subjectId),
          eq(performanceAssessments.name, itemName),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(performanceAssessments)
        .set({ score, prose, updatedAt: new Date() })
        .where(eq(performanceAssessments.id, existing.id));
    } else {
      await db
        .insert(performanceAssessments)
        .values({ ownerId, studentYearId, subjectId, name: itemName, score, prose });
    }
    saved++;
  }

  return { saved, skipped, warnings };
}

/**
 * 지필 원점수 upsert(과목×회차). ordinal 1=중간 2=기말. 충돌 키
 * (studentYearId, subjectId, ordinal). 미시행 회차(subjects.jipil*Enabled=false)는
 * 업로드 거부(throw). 미매칭 sid 는 skipped.
 */
export async function upsertJipilScores(
  db: DB,
  ownerId: string,
  subjectId: string,
  ordinal: 1 | 2,
  rows: JipilUpsertInput[],
): Promise<JipilUpsertResult> {
  // 활성 회차 검사.
  const [sub] = await db
    .select({
      midEnabled: subjects.jipilMidEnabled,
      finalEnabled: subjects.jipilFinalEnabled,
    })
    .from(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.ownerId, ownerId)))
    .limit(1);
  if (!sub) throw new Error("과목을 찾을 수 없습니다.");
  const enabled = ordinal === 1 ? sub.midEnabled : sub.finalEnabled;
  if (!enabled) {
    throw new Error(
      `${ordinal === 1 ? "중간" : "기말"}고사 미시행 과목입니다. 업로드할 수 없습니다.`,
    );
  }

  const sidMap = await sidToStudentYearId(db, ownerId, subjectId);
  const skipped: SkippedRow[] = [];
  let saved = 0;

  for (const row of rows) {
    const studentYearId = sidMap.get(row.sid);
    if (!studentYearId) {
      skipped.push({ sid: row.sid, reason: "수강생 명단에 없는 학번" });
      continue;
    }
    const rawScore = row.rawScore === null ? null : String(row.rawScore);
    await db
      .insert(jipilScores)
      .values({ ownerId, studentYearId, subjectId, ordinal, rawScore })
      .onConflictDoUpdate({
        target: [
          jipilScores.studentYearId,
          jipilScores.subjectId,
          jipilScores.ordinal,
        ],
        set: { rawScore, updatedAt: new Date() },
      });
    saved++;
  }

  return { saved, skipped };
}

export interface GradeViewRow {
  studentYearId: string;
  sid: string;
  name: string;
  /** 지필 환산 합(활성 회차만). 원점수 × (가중치/100). */
  jipilConverted: number;
  /** 수행 점수 합. */
  performanceTotal: number;
  /** 지필 + 수행 합. */
  total: number;
}

/**
 * 읽기시점 환산 성적 뷰(저장 금지). 지필 rawScore × (가중치/100) — ord1=중간,
 * ord2=기말, 각 회차 활성(jipil*Enabled)일 때만 합산. 수행 score 단순 합.
 * 과목 수강생(분반 union) 전원을 학번순으로 반환(점수 없는 학생은 0).
 */
export async function getGradeView(
  db: DB,
  ownerId: string,
  subjectId: string,
): Promise<GradeViewRow[]> {
  // 과목 가중치·활성 플래그.
  const [sub] = await db
    .select({
      midWeight: subjects.jipilMidWeight,
      finalWeight: subjects.jipilFinalWeight,
      midEnabled: subjects.jipilMidEnabled,
      finalEnabled: subjects.jipilFinalEnabled,
    })
    .from(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.ownerId, ownerId)))
    .limit(1);
  if (!sub) return [];
  const midW = sub.midEnabled ? Number(sub.midWeight ?? 0) : 0;
  const finalW = sub.finalEnabled ? Number(sub.finalWeight ?? 0) : 0;

  // 과목 수강생(학번순, 분반 union — 중복 학생 1행).
  const students = await db
    .select({
      studentYearId: studentYears.id,
      sid: studentYears.sid,
      name: studentYears.name,
    })
    .from(enrollments)
    .innerJoin(courseSections, eq(enrollments.sectionId, courseSections.id))
    .innerJoin(studentYears, eq(enrollments.studentYearId, studentYears.id))
    .where(
      and(
        eq(enrollments.ownerId, ownerId),
        eq(courseSections.subjectId, subjectId),
      ),
    )
    .orderBy(asc(studentYears.sid));

  const byId = new Map<string, GradeViewRow>();
  for (const s of students) {
    if (byId.has(s.studentYearId)) continue; // 2분반 중복 제거
    byId.set(s.studentYearId, {
      studentYearId: s.studentYearId,
      sid: s.sid,
      name: s.name,
      jipilConverted: 0,
      performanceTotal: 0,
      total: 0,
    });
  }
  const ids = [...byId.keys()];
  if (ids.length === 0) return [];

  // 지필 원점수 → 회차별 환산.
  const jipil = await db
    .select({
      studentYearId: jipilScores.studentYearId,
      ordinal: jipilScores.ordinal,
      rawScore: jipilScores.rawScore,
    })
    .from(jipilScores)
    .where(
      and(
        eq(jipilScores.ownerId, ownerId),
        eq(jipilScores.subjectId, subjectId),
        inArray(jipilScores.studentYearId, ids),
      ),
    );
  for (const j of jipil) {
    const row = byId.get(j.studentYearId);
    if (!row || j.rawScore === null) continue;
    const raw = Number(j.rawScore);
    const w = j.ordinal === 1 ? midW : j.ordinal === 2 ? finalW : 0;
    row.jipilConverted += (raw * w) / 100;
  }

  // 수행 점수 합.
  const perf = await db
    .select({
      studentYearId: performanceAssessments.studentYearId,
      score: performanceAssessments.score,
    })
    .from(performanceAssessments)
    .where(
      and(
        eq(performanceAssessments.ownerId, ownerId),
        eq(performanceAssessments.subjectId, subjectId),
        inArray(performanceAssessments.studentYearId, ids),
      ),
    );
  for (const p of perf) {
    const row = byId.get(p.studentYearId);
    if (!row || p.score === null) continue;
    row.performanceTotal += Number(p.score);
  }

  for (const row of byId.values()) {
    row.total = row.jipilConverted + row.performanceTotal;
  }
  return [...byId.values()];
}
