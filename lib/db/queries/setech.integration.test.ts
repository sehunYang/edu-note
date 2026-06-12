import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import {
  subjectObservations,
  studentActivityEntries,
  specialNoteDrafts,
  performanceAssessments,
  studentExtraNotes,
} from "../schema/records";
import { subjects, courseSections, enrollments } from "../schema/classes";
import { byteLength } from "@/lib/domain/byte-count";
import { buildSourceBundle, saveDraft, listDrafts } from "./setech";
import {
  buildBulkSetechSource,
} from "@/lib/setech";
import {
  listEnrolledStudentsForSubject,
  saveExtraNote,
  saveDraftsBulk,
} from "./setech";

/**
 * 세특 내보내기 실DB 통합. 원천 묶음 수집 + 검수 저장(차단/정상) + byteCount 일치 검증.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;
let studentYearId: string;

describe.skipIf(!RUN)("세특 내보내기 — 묶음/검수/저장", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
    const [p] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: "박세특" })
      .returning({ id: persons.id });
    [{ id: studentYearId }] = await db
      .insert(studentYears)
      .values({
        ownerId: owner,
        personId: p.id,
        schoolYear: YEAR,
        sid: "20703",
        grade: 2,
        classNo: 7,
        number: 3,
        name: "박세특",
      })
      .returning({ id: studentYears.id });
    await db.insert(subjectObservations).values({
      ownerId: owner,
      studentYearId,
      observedOn: "2099-03-02",
      body: "실험 데이터를 표로 정리하고 오차 원인을 분석함",
      keywords: ["탐구", "분석"],
    });
    await db.insert(studentActivityEntries).values({
      ownerId: owner,
      studentYearId,
      tag: "autonomy",
      placement: "autonomy",
      body: "학급 1인 1역 도서부장으로 학급문고를 관리함",
    });
  });

  afterAll(async () => {
    await db.delete(specialNoteDrafts).where(eq(specialNoteDrafts.ownerId, owner));
    await db.delete(subjectObservations).where(eq(subjectObservations.ownerId, owner));
    await db
      .delete(studentActivityEntries)
      .where(eq(studentActivityEntries.ownerId, owner));
    await db.delete(studentYears).where(eq(studentYears.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner));
    await sql.end();
  });

  it("교과 묶음은 관찰·키워드를 수집한다", async () => {
    const bundle = await buildSourceBundle(db, owner, studentYearId, "subject");
    expect(bundle.studentName).toBe("박세특");
    expect(bundle.observations.length).toBeGreaterThan(0);
    expect(bundle.keywords).toContain("탐구");
  });

  it("자율 묶음은 placement=autonomy 활동을 수집한다", async () => {
    const bundle = await buildSourceBundle(db, owner, studentYearId, "autonomy");
    expect(bundle.activities.some((a) => a.includes("도서부장"))).toBe(true);
  });

  it("정상 텍스트 저장 — byteCount 가 byteLength 와 일치", async () => {
    const text = "관찰한 사실을 바탕으로 탐구 역량을 보여 줌";
    const saved = await saveDraft(db, owner, {
      studentYearId,
      noteType: "subject",
      content: text,
    });
    expect(saved.byteCount).toBe(byteLength(text));
    const drafts = await listDrafts(db, owner, studentYearId);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].byteCount).toBe(byteLength(text));
  });

  it("상한 초과·빈 내용은 저장 거부(throw)", async () => {
    await expect(
      saveDraft(db, owner, {
        studentYearId,
        noteType: "subject",
        content: "a".repeat(3001), // limit 3000
      }),
    ).rejects.toThrow();
    await expect(
      saveDraft(db, owner, {
        studentYearId,
        noteType: "subject",
        content: "   ",
      }),
    ).rejects.toThrow();
  });
});

/**
 * 교실 2-2 단계7 일괄(bulk) — 점수 제외 원천 + 심각도 분할 저장 + 추가입력.
 */
describe.skipIf(!RUN)("세특 일괄(bulk) — 점수제외/심각도분할/추가입력", () => {
  const owner2 = randomUUID();
  let sql2: ReturnType<typeof postgres>;
  let db2: PostgresJsDatabase<typeof schema>;
  let syId: string;
  let subjectId: string;

  beforeAll(async () => {
    sql2 = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db2 = drizzle(sql2, { schema, casing: "snake_case" });
    const [p] = await db2
      .insert(persons)
      .values({ ownerId: owner2, displayName: "최일괄" })
      .returning({ id: persons.id });
    [{ id: syId }] = await db2
      .insert(studentYears)
      .values({
        ownerId: owner2,
        personId: p.id,
        schoolYear: YEAR,
        sid: "20101",
        grade: 2,
        classNo: 1,
        number: 1,
        name: "최일괄",
      })
      .returning({ id: studentYears.id });
    [{ id: subjectId }] = await db2
      .insert(subjects)
      .values({ ownerId: owner2, name: "물리학Ⅰ", schoolYear: YEAR, semester: 1 })
      .returning({ id: subjects.id });
    const [sec] = await db2
      .insert(courseSections)
      .values({ ownerId: owner2, subjectId, label: "2-1" })
      .returning({ id: courseSections.id });
    await db2
      .insert(enrollments)
      .values({ ownerId: owner2, sectionId: sec.id, studentYearId: syId });
    // 수행평가: 점수 + 서술 — 일괄 원천엔 서술만 들어가고 점수는 제외돼야 함.
    await db2.insert(performanceAssessments).values({
      ownerId: owner2,
      studentYearId: syId,
      subjectId,
      name: "실험보고서",
      score: "9.5",
      prose: "오차 원인을 정량적으로 분석하여 보고서를 작성함",
    });
    await db2.insert(subjectObservations).values({
      ownerId: owner2,
      studentYearId: syId,
      sectionId: sec.id,
      observedOn: "2099-03-02",
      body: "회로 실험에서 변인을 통제함",
      keywords: ["탐구"],
    });
  });

  afterAll(async () => {
    await db2.delete(specialNoteDrafts).where(eq(specialNoteDrafts.ownerId, owner2));
    await db2.delete(studentExtraNotes).where(eq(studentExtraNotes.ownerId, owner2));
    await db2.delete(performanceAssessments).where(eq(performanceAssessments.ownerId, owner2));
    await db2.delete(subjectObservations).where(eq(subjectObservations.ownerId, owner2));
    await db2.delete(enrollments).where(eq(enrollments.ownerId, owner2));
    await db2.delete(courseSections).where(eq(courseSections.ownerId, owner2));
    await db2.delete(subjects).where(eq(subjects.ownerId, owner2));
    await db2.delete(studentYears).where(eq(studentYears.ownerId, owner2));
    await db2.delete(persons).where(eq(persons.ownerId, owner2));
    await sql2.end();
  });

  it("일괄 원천은 수행 서술만 담고 점수는 제외한다(기재요령)", async () => {
    const bundle = await buildSourceBundle(db2, owner2, syId, "subject", subjectId);
    const src = buildBulkSetechSource(bundle);
    expect(src.performanceProse.some((p) => p.includes("오차 원인"))).toBe(true);
    // 점수(9.5)가 직렬화 어디에도 노출되지 않아야 한다.
    expect(JSON.stringify(src)).not.toContain("9.5");
    expect(src.observations.some((o) => o.includes("변인"))).toBe(true);
  });

  it("수강 학생 목록을 과목으로 조회한다", async () => {
    const students = await listEnrolledStudentsForSubject(db2, owner2, subjectId);
    expect(students).toHaveLength(1);
    expect(students[0].sid).toBe("20101");
  });

  it("심각도 분할: 비차단=저장+플래그, 차단(over_limit/empty)=거부", async () => {
    const result = await saveDraftsBulk(db2, owner2, [
      { studentYearId: syId, sid: "20101", subject: "물리학Ⅰ", noteType: "subject", subjectId, content: "관찰 사실에 근거하여 탐구 역량을 보여 줌" },
      { studentYearId: syId, sid: "20101", subject: "물리학Ⅰ", noteType: "subject", subjectId, content: "교내 과학 수상 경력을 바탕으로 탐구를 수행함" }, // prohibited(수상) 비차단
      { studentYearId: syId, sid: "20101", subject: "물리학Ⅰ", noteType: "subject", subjectId, content: "a".repeat(3001) }, // over_limit 차단
      { studentYearId: syId, sid: "20101", subject: "물리학Ⅰ", noteType: "subject", subjectId, content: "   " }, // empty 차단
    ]);
    expect(result.saved).toHaveLength(2);
    expect(result.rejected).toHaveLength(2);
    // 비차단 경고(기재금지)는 저장된 행에 플래그로 남는다.
    expect(result.saved.some((s) => s.warnings.length > 0)).toBe(true);
    const drafts = await listDrafts(db2, owner2, syId);
    expect(drafts.length).toBe(2);
  });

  it("학생×과목 추가 입력을 저장한다", async () => {
    await saveExtraNote(db2, owner2, syId, subjectId, "자율 탐구로 마찰력 실험을 추가 진행함");
    const rows = await db2
      .select({ body: studentExtraNotes.body })
      .from(studentExtraNotes)
      .where(eq(studentExtraNotes.ownerId, owner2));
    expect(rows.some((r) => r.body.includes("마찰력"))).toBe(true);
  });
});
