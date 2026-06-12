import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import {
  subjects,
  courseSections,
  enrollments,
  performanceItems,
} from "../schema/classes";
import {
  subjectObservations,
  performanceAssessments,
  jipilScores,
} from "../schema/records";
import { addSubjectObservation } from "./observations";
import { upsertPerformanceScores, upsertJipilScores } from "./grades";
import { getStudentReport } from "./student-report";

/**
 * 학생 분석 보고서 실DB 통합 테스트 (교실 2-2 단계6).
 * 한 과목·한 분반에 점수가 다른 3학생을 등록 → sectionRank 가 최고점=high·최저점=low
 * 분류, observationShortage 가 시드 관찰 건수 반영, performanceMissing 이 미입력 항목을
 * 나열함을 단언. harness 패턴(observations/grades integration test와 동일).
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;

async function mkStudent(sid: string, name: string): Promise<string> {
  const [p] = await db
    .insert(persons)
    .values({ ownerId: owner, displayName: name })
    .returning({ id: persons.id });
  const [sy] = await db
    .insert(studentYears)
    .values({
      ownerId: owner,
      personId: p.id,
      schoolYear: YEAR,
      sid,
      grade: Number(sid.slice(0, 1)),
      classNo: Number(sid.slice(1, 3)),
      number: Number(sid.slice(3, 5)),
      name,
      phone: "010-0000-0000",
      career: "연구원",
    })
    .returning({ id: studentYears.id });
  return sy.id;
}

describe.skipIf(!RUN)("학생 분석 보고서", () => {
  let subjectId: string;
  let sectionId: string;
  let sHigh: string;
  let sMid: string;
  let sLow: string;

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });

    // 지필 중간·기말 시행(각 40%) 과목 + 분반.
    const [subj] = await db
      .insert(subjects)
      .values({
        ownerId: owner,
        name: "통합과학",
        schoolYear: YEAR,
        semester: 1,
        jipilMidWeight: "40",
        jipilFinalWeight: "40",
        jipilMidEnabled: true,
        jipilFinalEnabled: true,
      })
      .returning({ id: subjects.id });
    subjectId = subj.id;
    const [sec] = await db
      .insert(courseSections)
      .values({ ownerId: owner, subjectId, label: "2-1" })
      .returning({ id: courseSections.id });
    sectionId = sec.id;

    sHigh = await mkStudent("20701", "김최고");
    sMid = await mkStudent("20702", "이중간");
    sLow = await mkStudent("20703", "박최저");
    for (const id of [sHigh, sMid, sLow]) {
      await db.insert(enrollments).values({ ownerId: owner, sectionId, studentYearId: id });
    }

    // 수행항목 2개 — "실험"만 입력, "발표"는 미입력(performanceMissing 검증).
    await db
      .insert(performanceItems)
      .values({ ownerId: owner, subjectId, name: "실험", weight: "20" });
    await db
      .insert(performanceItems)
      .values({ ownerId: owner, subjectId, name: "발표", weight: "10" });

    // 지필 원점수: high>mid>low (중간·기말). 환산 총점이 분명히 분리되도록.
    await upsertJipilScores(db, owner, subjectId, 1, [
      { sid: "20701", rawScore: 95 },
      { sid: "20702", rawScore: 75 },
      { sid: "20703", rawScore: 50 },
    ]);
    await upsertJipilScores(db, owner, subjectId, 2, [
      { sid: "20701", rawScore: 98 }, // high: 기말 > 중간 → up
      { sid: "20702", rawScore: 70 },
      { sid: "20703", rawScore: 45 },
    ]);
    // 수행 "실험"만 입력(발표는 미입력으로 남김).
    await upsertPerformanceScores(db, owner, subjectId, "실험", [
      { sid: "20701", score: 18, prose: "정밀함" },
      { sid: "20702", score: 14, prose: null },
      { sid: "20703", score: 9, prose: null },
    ]);

    // 관찰: high 학생만 2건(관찰부족 아님), low 학생은 0건(관찰부족).
    await addSubjectObservation(db, owner, {
      studentYearId: sHigh,
      sectionId,
      observedOn: "2099-05-01",
      body: "탐구 설계 우수",
      keywords: ["탐구"],
    });
    await addSubjectObservation(db, owner, {
      studentYearId: sHigh,
      sectionId,
      observedOn: "2099-05-08",
      body: "토론 적극 참여",
      keywords: ["토론"],
    });
  });

  afterAll(async () => {
    await db.delete(subjectObservations).where(eq(subjectObservations.ownerId, owner));
    await db.delete(jipilScores).where(eq(jipilScores.ownerId, owner));
    await db
      .delete(performanceAssessments)
      .where(eq(performanceAssessments.ownerId, owner));
    await db.delete(enrollments).where(eq(enrollments.ownerId, owner));
    await db.delete(performanceItems).where(eq(performanceItems.ownerId, owner));
    await db.delete(courseSections).where(eq(courseSections.ownerId, owner));
    await db.delete(subjects).where(eq(subjects.ownerId, owner));
    await db.delete(studentYears).where(eq(studentYears.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner));
    await sql.end();
  });

  it("최고점 학생 — sectionRank high · 관찰충분 · 지필상승 · 발표 미입력", async () => {
    const r = await getStudentReport(db, owner, sHigh, sectionId, YEAR, 1);
    expect(r).not.toBeNull();
    expect(r!.profile.sid).toBe("20701");
    expect(r!.observationCount).toBe(2);
    expect(r!.flags.observationShortage).toBe(false); // 2건 > 임계 1
    expect(r!.flags.sectionRank).toBe("high");
    expect(r!.flags.jipilTrend).toBe("up"); // 기말 환산 > 중간 환산
    expect(r!.flags.performanceMissing).toEqual(["발표"]);
  });

  it("최저점 학생 — sectionRank low · 관찰부족 경고", async () => {
    const r = await getStudentReport(db, owner, sLow, sectionId, YEAR, 1);
    expect(r).not.toBeNull();
    expect(r!.flags.sectionRank).toBe("low");
    expect(r!.observationCount).toBe(0);
    expect(r!.flags.observationShortage).toBe(true); // 0건 ≤ 임계 1
    expect(r!.flags.performanceMissing).toEqual(["발표"]);
  });

  it("중간점 학생 — sectionRank mid", async () => {
    const r = await getStudentReport(db, owner, sMid, sectionId, YEAR, 1);
    expect(r).not.toBeNull();
    expect(r!.flags.sectionRank).toBe("mid");
  });

  it("미존재 학생/분반 → null", async () => {
    const bad = await getStudentReport(db, owner, randomUUID(), sectionId, YEAR, 1);
    expect(bad).toBeNull();
  });
});
