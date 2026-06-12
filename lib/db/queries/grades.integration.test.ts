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
import { performanceAssessments, jipilScores } from "../schema/records";
import {
  upsertPerformanceScores,
  upsertJipilScores,
  getGradeView,
} from "./grades";

/**
 * 성적 기록 실DB 통합 테스트 (교실 2-2 단계4).
 * 수행 upsert(저장+weight초과경고)·미매칭 sid 스킵·지필 미시행회차 거부·활성회차 저장·
 * getGradeView 환산(중간만/기말만/둘다/미시행).
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
    })
    .returning({ id: studentYears.id });
  return sy.id;
}

async function mkSubject(opts: {
  midW?: number;
  finalW?: number;
  midEnabled?: boolean;
  finalEnabled?: boolean;
}): Promise<string> {
  const [s] = await db
    .insert(subjects)
    .values({
      ownerId: owner,
      name: "통합과학",
      schoolYear: YEAR,
      semester: 1,
      jipilMidWeight: opts.midW !== undefined ? String(opts.midW) : null,
      jipilFinalWeight: opts.finalW !== undefined ? String(opts.finalW) : null,
      jipilMidEnabled: opts.midEnabled ?? true,
      jipilFinalEnabled: opts.finalEnabled ?? true,
    })
    .returning({ id: subjects.id });
  return s.id;
}

async function mkSection(subjectId: string, label: string): Promise<string> {
  const [c] = await db
    .insert(courseSections)
    .values({ ownerId: owner, subjectId, label })
    .returning({ id: courseSections.id });
  return c.id;
}

async function enroll(sectionId: string, studentYearId: string): Promise<void> {
  await db.insert(enrollments).values({ ownerId: owner, sectionId, studentYearId });
}

describe.skipIf(!RUN)("성적 기록 쿼리", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
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

  it("upsertPerformanceScores — 저장 + weight 초과 경고 + 미매칭 스킵", async () => {
    const subj = await mkSubject({});
    const sec = await mkSection(subj, "2-1");
    const s1 = await mkStudent("20701", "김하나");
    const s2 = await mkStudent("20702", "이두리");
    await enroll(sec, s1);
    await enroll(sec, s2);
    // weight 20 항목.
    await db
      .insert(performanceItems)
      .values({ ownerId: owner, subjectId: subj, name: "실험보고서", weight: "20" });

    const res = await upsertPerformanceScores(db, owner, subj, "실험보고서", [
      { sid: "20701", score: 18, prose: "정상" },
      { sid: "20702", score: 25, prose: "초과" }, // 25 > weight 20 → 경고(저장 진행)
      { sid: "29999", score: 10, prose: "미매칭" }, // 수강생 아님 → 스킵
    ]);

    expect(res.saved).toBe(2);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0].sid).toBe("29999");
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain("20702");

    // 저장 확인 + 재업로드 upsert(중복 행 없음).
    const rows = await db
      .select({ studentYearId: performanceAssessments.studentYearId })
      .from(performanceAssessments)
      .where(eq(performanceAssessments.subjectId, subj));
    expect(rows).toHaveLength(2);

    const res2 = await upsertPerformanceScores(db, owner, subj, "실험보고서", [
      { sid: "20701", score: 19, prose: "수정" },
    ]);
    expect(res2.saved).toBe(1);
    const rows2 = await db
      .select({ score: performanceAssessments.score })
      .from(performanceAssessments)
      .where(
        eq(performanceAssessments.studentYearId, s1),
      );
    expect(rows2).toHaveLength(1);
    expect(Number(rows2[0].score)).toBe(19);
  });

  it("upsertJipilScores — 미시행 회차 거부 + 활성 회차 저장", async () => {
    const subj = await mkSubject({ midEnabled: true, finalEnabled: false });
    const sec = await mkSection(subj, "2-2");
    const s1 = await mkStudent("20711", "박세찬");
    await enroll(sec, s1);

    // 기말 미시행 → ordinal 2 거부.
    await expect(
      upsertJipilScores(db, owner, subj, 2, [{ sid: "20711", rawScore: 80 }]),
    ).rejects.toThrow();

    // 중간 활성 → 저장.
    const res = await upsertJipilScores(db, owner, subj, 1, [
      { sid: "20711", rawScore: 88 },
      { sid: "29999", rawScore: 50 }, // 미매칭 스킵
    ]);
    expect(res.saved).toBe(1);
    expect(res.skipped).toHaveLength(1);

    const rows = await db
      .select({ rawScore: jipilScores.rawScore, ordinal: jipilScores.ordinal })
      .from(jipilScores)
      .where(eq(jipilScores.studentYearId, s1));
    expect(rows).toHaveLength(1);
    expect(rows[0].ordinal).toBe(1);
    expect(Number(rows[0].rawScore)).toBe(88);
  });

  it("getGradeView — 환산(중간만/기말만/둘다/미시행)", async () => {
    // 둘다: mid 40%, final 40%.
    const both = await mkSubject({
      midW: 40,
      finalW: 40,
      midEnabled: true,
      finalEnabled: true,
    });
    const secB = await mkSection(both, "2-3");
    const sb = await mkStudent("20721", "최둘다");
    await enroll(secB, sb);
    await upsertJipilScores(db, owner, both, 1, [{ sid: "20721", rawScore: 90 }]);
    await upsertJipilScores(db, owner, both, 2, [{ sid: "20721", rawScore: 80 }]);
    await db
      .insert(performanceItems)
      .values({ ownerId: owner, subjectId: both, name: "수행", weight: "20" });
    await upsertPerformanceScores(db, owner, both, "수행", [
      { sid: "20721", score: 15, prose: null },
    ]);

    const viewBoth = await getGradeView(db, owner, both);
    expect(viewBoth).toHaveLength(1);
    // 90*0.4 + 80*0.4 = 36 + 32 = 68. 수행 15. 합 83.
    expect(viewBoth[0].jipilConverted).toBeCloseTo(68, 5);
    expect(viewBoth[0].performanceTotal).toBeCloseTo(15, 5);
    expect(viewBoth[0].total).toBeCloseTo(83, 5);

    // 중간만: final 미시행이면 final 가중치 0.
    const midOnly = await mkSubject({
      midW: 50,
      finalW: 50,
      midEnabled: true,
      finalEnabled: false,
    });
    const secM = await mkSection(midOnly, "2-4");
    const sm = await mkStudent("20731", "정중간");
    await enroll(secM, sm);
    await upsertJipilScores(db, owner, midOnly, 1, [{ sid: "20731", rawScore: 80 }]);
    const viewMid = await getGradeView(db, owner, midOnly);
    // 80*0.5 = 40, final 미시행이라 제외.
    expect(viewMid[0].jipilConverted).toBeCloseTo(40, 5);

    // 기말만.
    const finalOnly = await mkSubject({
      midW: 50,
      finalW: 50,
      midEnabled: false,
      finalEnabled: true,
    });
    const secF = await mkSection(finalOnly, "2-5");
    const sf = await mkStudent("20741", "한기말");
    await enroll(secF, sf);
    await upsertJipilScores(db, owner, finalOnly, 2, [{ sid: "20741", rawScore: 60 }]);
    const viewFinal = await getGradeView(db, owner, finalOnly);
    // 60*0.5 = 30.
    expect(viewFinal[0].jipilConverted).toBeCloseTo(30, 5);

    // 미시행(둘다 비활성): 지필 환산 0.
    const none = await mkSubject({
      midW: 50,
      finalW: 50,
      midEnabled: false,
      finalEnabled: false,
    });
    const secN = await mkSection(none, "2-6");
    const sn = await mkStudent("20751", "무지필");
    await enroll(secN, sn);
    const viewNone = await getGradeView(db, owner, none);
    expect(viewNone[0].jipilConverted).toBe(0);
    expect(viewNone[0].total).toBe(0);
  });
});
