import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import {
  homeroomClasses,
  homeroomMembers,
  subjects,
  courseSections,
  enrollments,
  performanceItems,
  classSessions,
} from "../schema/classes";
import {
  subjectObservations,
  homeroomBehaviorNotes,
  specialNoteDrafts,
  creativeActivityRecords,
  creativeActivityStudentOverrides,
  performanceAssessments,
  jipilScores,
  lessonPlans,
} from "../schema/records";
import { attendanceRecords } from "../schema/attendance";
import { upsertJipilScores, upsertPerformanceScores } from "./grades";
import {
  getAlertInputs,
  getSectionGradeAnalysis,
  getCoverageRows,
  getWorkProgress,
} from "./stats-insights";
import { todayKST } from "@/lib/domain/stats-alerts";

/**
 * 통계실 인사이트 쿼리 실DB 통합 테스트 (AD-2, US-4).
 * getAlertInputs 의 30일×2/21일 윈도 버킷팅, getSectionGradeAnalysis 의 코호트
 * 필터(과목 전체 오염 방지), getCoverageRows 의 4유형(창체=overrides 기준),
 * getWorkProgress 의 진도율 재사용+세특완성률/신고서처리율 산출을 검증한다.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;

/** todayKST() 기준 delta 일 이동한 날짜(YYYY-MM-DD). 쿼리 구현과 동일한 앵커. */
function dayOffset(delta: number): string {
  const d = new Date(todayKST() + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

let sidCounter = 30000;
async function mkStudent(name: string, classNo = 1): Promise<string> {
  const sid = String(sidCounter++);
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
      grade: 3,
      classNo,
      number: sidCounter - 30000,
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
  name?: string;
}): Promise<string> {
  const [s] = await db
    .insert(subjects)
    .values({
      ownerId: owner,
      name: opts.name ?? "테스트과목",
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

describe.skipIf(!RUN)("stats-insights 쿼리 (US-4)", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await db.delete(attendanceRecords).where(eq(attendanceRecords.ownerId, owner));
    await db.delete(jipilScores).where(eq(jipilScores.ownerId, owner));
    await db
      .delete(performanceAssessments)
      .where(eq(performanceAssessments.ownerId, owner));
    await db
      .delete(creativeActivityStudentOverrides)
      .where(eq(creativeActivityStudentOverrides.ownerId, owner));
    await db
      .delete(creativeActivityRecords)
      .where(eq(creativeActivityRecords.ownerId, owner));
    await db.delete(specialNoteDrafts).where(eq(specialNoteDrafts.ownerId, owner));
    await db
      .delete(subjectObservations)
      .where(eq(subjectObservations.ownerId, owner));
    await db
      .delete(homeroomBehaviorNotes)
      .where(eq(homeroomBehaviorNotes.ownerId, owner));
    await db.delete(classSessions).where(eq(classSessions.ownerId, owner));
    await db.delete(lessonPlans).where(eq(lessonPlans.ownerId, owner));
    await db.delete(enrollments).where(eq(enrollments.ownerId, owner));
    await db.delete(performanceItems).where(eq(performanceItems.ownerId, owner));
    await db.delete(courseSections).where(eq(courseSections.ownerId, owner));
    await db.delete(subjects).where(eq(subjects.ownerId, owner));
    await db.delete(homeroomMembers).where(eq(homeroomMembers.ownerId, owner));
    await db.delete(homeroomClasses).where(eq(homeroomClasses.ownerId, owner));
    await db.delete(studentYears).where(eq(studentYears.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner));
    await sql.end();
  });

  it("getAlertInputs — 출결 30일×2 버킷팅 + 담임반 판정 + 지필 직접환산 + 21일 관찰 카운트", async () => {
    const s1 = await mkStudent("담임학생", 11); // 담임반 소속
    const s2 = await mkStudent("수업학생", 12); // 담임반 아님

    const [hr] = await db
      .insert(homeroomClasses)
      .values({ ownerId: owner, schoolYear: YEAR, grade: 3, classNo: 11 })
      .returning({ id: homeroomClasses.id });
    await db.insert(homeroomMembers).values({ ownerId: owner, homeroomId: hr.id, studentYearId: s1 });

    const subj = await mkSubject({ midW: 50, finalW: 50, name: "경보과목" });
    const sec = await mkSection(subj, "A");
    await enroll(sec, s1);
    await enroll(sec, s2);

    // s1: 최근30일 3건(급증 후보), 직전30일 1건.
    await db.insert(attendanceRecords).values([
      { ownerId: owner, studentYearId: s1, date: dayOffset(-1), reason: "etc", kind: "late" },
      { ownerId: owner, studentYearId: s1, date: dayOffset(-5), reason: "etc", kind: "late" },
      { ownerId: owner, studentYearId: s1, date: dayOffset(-10), reason: "etc", kind: "absent" },
      { ownerId: owner, studentYearId: s1, date: dayOffset(-35), reason: "etc", kind: "absent" }, // 직전30일
    ]);
    // s2: 최근30일 1건, 직전30일 2건(증가 없음).
    await db.insert(attendanceRecords).values([
      { ownerId: owner, studentYearId: s2, date: dayOffset(-2), reason: "etc", kind: "late" },
      { ownerId: owner, studentYearId: s2, date: dayOffset(-40), reason: "etc", kind: "absent" },
      { ownerId: owner, studentYearId: s2, date: dayOffset(-45), reason: "etc", kind: "absent" },
    ]);

    // s1: 중간90/기말60 → 환산 45/30(가중 50%). s2: 중간80만 → 40/null.
    await upsertJipilScores(db, owner, subj, 1, [
      { sid: (await db.select({ sid: studentYears.sid }).from(studentYears).where(eq(studentYears.id, s1)))[0].sid, rawScore: 90 },
    ]);
    await upsertJipilScores(db, owner, subj, 2, [
      { sid: (await db.select({ sid: studentYears.sid }).from(studentYears).where(eq(studentYears.id, s1)))[0].sid, rawScore: 60 },
    ]);
    await upsertJipilScores(db, owner, subj, 1, [
      { sid: (await db.select({ sid: studentYears.sid }).from(studentYears).where(eq(studentYears.id, s2)))[0].sid, rawScore: 80 },
    ]);

    // 21일 윈도([today-20, today]) 경계: s2 는 창내(-20), s1 은 창밖(-25)만 존재 → obsCount21d 0.
    await db.insert(subjectObservations).values({
      ownerId: owner,
      studentYearId: s1,
      observedOn: dayOffset(-25),
      body: "창밖 관찰",
    });
    await db.insert(subjectObservations).values({
      ownerId: owner,
      studentYearId: s2,
      observedOn: dayOffset(-20),
      body: "창내 관찰",
    });

    const rows = await getAlertInputs(db, owner, YEAR);
    const r1 = rows.find((r) => r.studentYearId === s1)!;
    const r2 = rows.find((r) => r.studentYearId === s2)!;

    expect(r1.isHomeroomStudent).toBe(true);
    expect(r2.isHomeroomStudent).toBe(false);

    expect(r1.attendanceRecent30).toBe(3);
    expect(r1.attendancePrev30).toBe(1);
    expect(r2.attendanceRecent30).toBe(1);
    expect(r2.attendancePrev30).toBe(2);

    expect(r1.obsCount21d).toBe(0);
    expect(r1.behaviorCount21d).toBe(0);
    expect(r2.obsCount21d).toBe(1);

    const drop1 = r1.gradeDropsBySubject.find((d) => d.subjectId === subj)!;
    expect(drop1.midConverted).toBeCloseTo(45, 5);
    expect(drop1.finalConverted).toBeCloseTo(30, 5);
    const drop2 = r2.gradeDropsBySubject.find((d) => d.subjectId === subj)!;
    expect(drop2.midConverted).toBeCloseTo(40, 5);
    expect(drop2.finalConverted).toBeNull();
  });

  it("getSectionGradeAnalysis — 분반 코호트 필터(과목 전체 미오염) + 타분반 비교 + 수행입력률", async () => {
    const subj = await mkSubject({ midW: 100, finalEnabled: false, name: "코호트과목" });
    const secA = await mkSection(subj, "A");
    const secB = await mkSection(subj, "B");

    const s3 = await mkStudent("코호트A1", 21);
    const s4 = await mkStudent("코호트A2", 21);
    const s5 = await mkStudent("코호트B1", 22);
    await enroll(secA, s3);
    await enroll(secA, s4);
    await enroll(secB, s5);

    const sidOf = async (id: string) =>
      (await db.select({ sid: studentYears.sid }).from(studentYears).where(eq(studentYears.id, id)))[0].sid;

    await upsertJipilScores(db, owner, subj, 1, [
      { sid: await sidOf(s3), rawScore: 80 },
      { sid: await sidOf(s4), rawScore: 60 },
      { sid: await sidOf(s5), rawScore: 90 },
    ]);

    await db.insert(performanceItems).values({ ownerId: owner, subjectId: subj, name: "발표", weight: "10" });
    await upsertPerformanceScores(db, owner, subj, "발표", [{ sid: await sidOf(s3), score: 8, prose: null }]);

    const result = await getSectionGradeAnalysis(db, owner, secA);
    expect(result).not.toBeNull();
    expect(result!.students).toHaveLength(2); // secB 학생(s5)이 섞이지 않음(코호트 필터).
    const st3 = result!.students.find((s) => s.studentYearId === s3)!;
    const st4 = result!.students.find((s) => s.studentYearId === s4)!;
    expect(st3.total).toBeCloseTo(88, 5); // 80 + 8
    expect(st4.total).toBeCloseTo(60, 5); // 60 + 0(미입력)

    const other = result!.otherSections.find((o) => o.sectionId === secB)!;
    expect(other.scores).toEqual([90]);

    const perfItem = result!.performanceItems.find((p) => p.name === "발표")!;
    expect(perfItem.filledCount).toBe(1);
    expect(perfItem.totalStudents).toBe(2);
    expect(perfItem.avgScore).toBeCloseTo(8, 5);
  });

  it("getSectionGradeAnalysis — 분반 미존재 시 null", async () => {
    const result = await getSectionGradeAnalysis(db, owner, randomUUID());
    expect(result).toBeNull();
  });

  it("getCoverageRows — 관찰/행특/세특초안/창체(overrides 기준) 4유형", async () => {
    const sC1 = await mkStudent("커버관찰", 31);
    const sC2 = await mkStudent("커버행특", 31);
    const sC3 = await mkStudent("커버세특", 31);
    const sC4 = await mkStudent("커버창체", 31);

    await db.insert(subjectObservations).values({
      ownerId: owner,
      studentYearId: sC1,
      observedOn: dayOffset(-3),
      body: "관찰 기록",
    });
    await db.insert(homeroomBehaviorNotes).values({
      ownerId: owner,
      studentYearId: sC2,
      notedOn: dayOffset(-3),
      body: "행특 기록",
    });
    await db.insert(specialNoteDrafts).values({
      ownerId: owner,
      studentYearId: sC3,
      type: "subject",
      content: "",
      byteCount: 0,
      byteLimit: 1500,
      status: "finalized",
    });
    const [record] = await db
      .insert(creativeActivityRecords)
      .values({ ownerId: owner, area: "club", activityDate: dayOffset(-3), commonBody: "공통내용" })
      .returning({ id: creativeActivityRecords.id });
    await db.insert(creativeActivityStudentOverrides).values({
      ownerId: owner,
      recordId: record.id,
      studentYearId: sC4,
      body: "개인화 기입",
    });

    const rows = await getCoverageRows(db, owner, YEAR);
    const forC1 = rows.filter((r) => r.studentYearId === sC1);
    const forC2 = rows.filter((r) => r.studentYearId === sC2);
    const forC3 = rows.filter((r) => r.studentYearId === sC3);
    const forC4 = rows.filter((r) => r.studentYearId === sC4);

    expect(forC1).toEqual([{ studentYearId: sC1, studentName: "커버관찰", kind: "observation" }]);
    expect(forC2).toEqual([{ studentYearId: sC2, studentName: "커버행특", kind: "behavior" }]);
    expect(forC3).toEqual([{ studentYearId: sC3, studentName: "커버세특", kind: "setechDraft" }]);
    expect(forC4).toEqual([{ studentYearId: sC4, studentName: "커버창체", kind: "creative" }]);

    // creative_activity_records(공통내용)만 있고 override 없는 학생은 창체 0건이어야 함(Architect 확정 매핑).
    const sC5 = await mkStudent("커버창체없음", 31);
    const rows2 = await getCoverageRows(db, owner, YEAR);
    expect(rows2.filter((r) => r.studentYearId === sC5)).toHaveLength(0);
  });

  it("getWorkProgress — 분반 진도율 재사용 + 세특완성률 + 신고서처리율", async () => {
    const subj = await mkSubject({ midEnabled: false, finalEnabled: false, name: "진척과목" });
    const sec = await mkSection(subj, "P1");
    await db.insert(lessonPlans).values({ ownerId: owner, subjectId: subj, ordinal: 1, content: "1차시" });
    await db.insert(classSessions).values([
      { ownerId: owner, sectionId: sec, date: dayOffset(-1), status: "done" },
      { ownerId: owner, sectionId: sec, date: dayOffset(5), status: "planned" },
    ]);

    const sW1 = await mkStudent("진척학생1", 41);
    const sW2 = await mkStudent("진척학생2", 41);

    // 세특초안 3건 중 1건 finalized → 완성률 1/3.
    await db.insert(specialNoteDrafts).values([
      { ownerId: owner, studentYearId: sW1, type: "subject", content: "", byteCount: 0, byteLimit: 1500, status: "draft" },
      { ownerId: owner, studentYearId: sW1, type: "behavior", content: "", byteCount: 0, byteLimit: 800, status: "editing" },
      { ownerId: owner, studentYearId: sW2, type: "subject", content: "", byteCount: 0, byteLimit: 1500, status: "finalized" },
    ]);

    // 신고서 필요 2건 중 1건 제출 → 처리율 1/2. 불필요 1건은 분모 제외.
    await db.insert(attendanceRecords).values([
      { ownerId: owner, studentYearId: sW1, date: dayOffset(-2), reason: "illness", kind: "absent", reportRequired: true, reportSubmitted: true },
      { ownerId: owner, studentYearId: sW1, date: dayOffset(-3), reason: "illness", kind: "absent", reportRequired: true, reportSubmitted: false },
      { ownerId: owner, studentYearId: sW2, date: dayOffset(-2), reason: "unaccepted", kind: "absent", reportRequired: false, reportSubmitted: false },
    ]);

    const result = await getWorkProgress(db, owner, YEAR, 1);
    const ourSection = result.sections.find((s) => s.sectionId === sec);
    expect(ourSection).toBeDefined();
    expect(ourSection!.actualDone).toBe(1);
    expect(ourSection!.plannedToToday).toBe(1);

    expect(result.specialNoteCompletionRate).toBeCloseTo(1 / 3, 5);
    expect(result.reportProcessRate).toBeCloseTo(0.5, 5);
  });

  it("getWorkProgress — 세특초안 0건이면 completionRate null(0/0 계약)", async () => {
    // 별도 연도로 조회해 초안 0건 상태를 재현(다른 it 의 초안과 섞이지 않도록).
    const result = await getWorkProgress(db, owner, 2098, 1);
    expect(result.specialNoteCompletionRate).toBeNull();
  });
});
