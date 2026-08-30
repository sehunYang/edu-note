import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "../schema";
import {
  subjects,
  courseSections,
  timetableSlots,
  performanceItems,
  enrollments,
  subjectExams,
  sectionPerformanceDates,
  sectionRoles,
} from "../schema/classes";
import { persons, studentYears } from "../schema/identity";
import { calendarEvents } from "../schema/misc";
import { fetchTimetableBySchool } from "@/lib/integrations/comcigan-client";
import { teacherSlots, type TimetableSlot } from "@/lib/integrations/comcigan";

// 실학교/실교사 이름은 공개 저장소에 남기지 않는다. 이 테스트는 RUN_DB_ITEST
// 게이트라 평소 스킵되며, 돌릴 때만 env 로 지정한다(배포판 S7).
const PROBE_SCHOOL = process.env.PROBE_SCHOOL ?? "";
const PROBE_TEACHER = process.env.PROBE_TEACHER ?? "";

import {
  syncTeacherTimetable,
  getTeacherTimetable,
  saveEvalSettings,
  bulkEnroll,
  listEnrollments,
  materializeSubjectExams,
  deriveExamBoundaryDate,
  listSubjectExams,
  addSectionRole,
  listSectionRoles,
  deleteSectionRole,
  setPerformanceDate,
  listPerformanceDates,
  listSubjectExamsForYear,
  listEnrollmentsForYear,
  listSectionRolesForEnrollments,
  listSubjectsWithSections,
  enrollOne,
  unenroll,
  listSubjectsForStudentYear,
  listSubjectsForStudentYears,
  getEvalSettings,
} from "./timetable";

/**
 * 시간표 sync 실DB+라이브 컴시간 통합 테스트.
 * RUN_DB_ITEST=1 + DATABASE_URL + 네트워크일 때만 실행. 실학교/실교사(env 지정) →
 * subjects=물리·sections=2-7/8/9·slots=9 를 실제로 sync·검증하고 정리한다.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;

describe.skipIf(!RUN)("시간표 sync — 컴시간 라이브 → DB", () => {
  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    // 자식→부모: timetable_slots → course_sections → subjects
    await db.delete(timetableSlots).where(eq(timetableSlots.ownerId, owner));
    await db.delete(courseSections).where(eq(courseSections.ownerId, owner));
    await db.delete(subjects).where(eq(subjects.ownerId, owner));
    await sql.end();
  });

  it("실학교/실교사(env 지정) 시간표를 sync 하고 화면용으로 조회", async () => {
    const res = await fetchTimetableBySchool(PROBE_SCHOOL);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const slots = teacherSlots(res.data, PROBE_TEACHER);
    // 교사별 배열(자료542) 디코딩 → 선택과목 포함 전체 수업
    expect(slots.length).toBeGreaterThan(9); // 물리 9 + 선택과목들
    const subjectSet = new Set(slots.map((s) => s.subject));
    expect(subjectSet).toContain("물리");
    expect(subjectSet).toContain("물Ⅱ"); // 반을 섞는 선택과목(이전엔 누락)
    expect(subjectSet).toContain("생과");

    const sync = await syncTeacherTimetable(db, owner, YEAR, 1, slots);
    expect(sync.subjects).toBeGreaterThanOrEqual(3); // 물리·물Ⅱ·생과
    expect(sync.slots).toBe(slots.length);
    expect(sync.sections).toBeGreaterThanOrEqual(3);

    // DB 반영 확인
    const savedSubjects = await db
      .select({ name: subjects.name })
      .from(subjects)
      .where(and(eq(subjects.ownerId, owner), eq(subjects.schoolYear, YEAR)));
    const savedNames = savedSubjects.map((s) => s.name);
    expect(savedNames).toContain("물리");
    expect(savedNames).toContain("물Ⅱ");
    expect(savedNames).toContain("생과");

    const view = await getTeacherTimetable(db, owner, YEAR, 1);
    expect(view.length).toBe(slots.length);
    expect(view[0]).toHaveProperty("weekday");
  });

  it("재sync 는 멱등(중복 슬롯 미생성)", async () => {
    const res = await fetchTimetableBySchool(PROBE_SCHOOL);
    if (!res.ok) return;
    const slots = teacherSlots(res.data, PROBE_TEACHER);

    await syncTeacherTimetable(db, owner, YEAR, 1, slots);
    const view = await getTeacherTimetable(db, owner, YEAR, 1);
    expect(view.length).toBe(slots.length); // 두 번 sync 해도 동일 개수
  });
});

// ── C5: 평가설정·일괄등록·시험일 파생·분반역할 (합성, 네트워크 불필요) ──
const RUN_DB = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;
const Y5 = 2098;

function slot(subject: string, grade: number, classNo: number, period: number): TimetableSlot {
  return { subject, grade, classNo, weekday: 1, period, teacher: "T", code: 0 };
}

describe.skipIf(!RUN_DB)("C5 수업 관리 — 평가/등록/시험일/역할", () => {
  let sql5: ReturnType<typeof postgres>;
  let db5: PostgresJsDatabase<typeof schema>;
  const o = randomUUID();
  let physicsId = "";
  let physicsSection = "";
  let earthId = "";
  let earthSection = "";

  async function mkStudent(sid: string, grade: number, classNo: number, num: number): Promise<string> {
    const [p] = await db5.insert(persons).values({ ownerId: o, displayName: `s${sid}` }).returning({ id: persons.id });
    const [sy] = await db5
      .insert(studentYears)
      .values({ ownerId: o, personId: p.id, schoolYear: Y5, sid, grade, classNo, number: num, name: `s${sid}` })
      .returning({ id: studentYears.id });
    return sy.id;
  }

  beforeAll(async () => {
    sql5 = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db5 = drizzle(sql5, { schema, casing: "snake_case" });

    // 시간표 sync 재사용 → 물리(2-7), 지구과학(2-7) 분반 생성
    await syncTeacherTimetable(db5, o, Y5, 1, [
      slot("물리", 2, 7, 1),
      slot("지구과학", 2, 7, 2),
    ]);
    const subs = await db5
      .select({ id: subjects.id, name: subjects.name })
      .from(subjects)
      .where(and(eq(subjects.ownerId, o), eq(subjects.schoolYear, Y5)));
    physicsId = subs.find((s) => s.name === "물리")!.id;
    earthId = subs.find((s) => s.name === "지구과학")!.id;
    const secs = await db5
      .select({ id: courseSections.id, subjectId: courseSections.subjectId })
      .from(courseSections)
      .where(eq(courseSections.ownerId, o));
    physicsSection = secs.find((s) => s.subjectId === physicsId)!.id;
    earthSection = secs.find((s) => s.subjectId === earthId)!.id;

    // 학생: 2-7 3명, 2-8 2명
    await mkStudent("20701", 2, 7, 1);
    await mkStudent("20702", 2, 7, 2);
    await mkStudent("20703", 2, 7, 3);
    await mkStudent("20801", 2, 8, 1);
    await mkStudent("20802", 2, 8, 2);

    // C3 태깅 exam calendarEvents (학기1 중간 04-15, 학기1 기말 06-20)
    await db5.insert(calendarEvents).values([
      { ownerId: o, date: "2098-04-15", source: "neis", title: "1학기 중간고사", eventKind: "exam", examSemester: 1, examOrdinal: 1 },
      { ownerId: o, date: "2098-06-20", source: "neis", title: "1학기 기말고사", eventKind: "exam", examSemester: 1, examOrdinal: 2 },
    ]);
  });

  afterAll(async () => {
    await db5.delete(sectionRoles).where(eq(sectionRoles.ownerId, o));
    await db5.delete(sectionPerformanceDates).where(eq(sectionPerformanceDates.ownerId, o));
    await db5.delete(subjectExams).where(eq(subjectExams.ownerId, o));
    await db5.delete(enrollments).where(eq(enrollments.ownerId, o));
    await db5.delete(timetableSlots).where(eq(timetableSlots.ownerId, o));
    await db5.delete(performanceItems).where(eq(performanceItems.ownerId, o));
    await db5.delete(courseSections).where(eq(courseSections.ownerId, o));
    await db5.delete(subjects).where(eq(subjects.ownerId, o));
    await db5.delete(studentYears).where(eq(studentYears.ownerId, o));
    await db5.delete(persons).where(eq(persons.ownerId, o));
    await db5.delete(calendarEvents).where(eq(calendarEvents.ownerId, o));
    await sql5.end();
  });

  it("평가설정 100% 검증: 통과 저장 / 실패 throw (AC-5.1)", async () => {
    // 기말 미시행 + 수행60 + 중간40 = 100 → 통과
    await saveEvalSettings(db5, o, physicsId, {
      performance: [{ name: "실험보고서", weight: 60 }],
      jipilMid: 40,
      jipilFinal: 0,
      midEnabled: true,
      finalEnabled: false,
    });
    const items = await db5
      .select({ name: performanceItems.name })
      .from(performanceItems)
      .where(eq(performanceItems.subjectId, physicsId));
    expect(items.map((i) => i.name)).toEqual(["실험보고서"]);

    // 합 90 → 실패(throw, 부분 저장 없음)
    await expect(
      saveEvalSettings(db5, o, physicsId, {
        performance: [{ name: "x", weight: 50 }],
        jipilMid: 40,
        jipilFinal: 0,
        midEnabled: true,
        finalEnabled: false,
      }),
    ).rejects.toThrow();
  });

  it("일괄등록 grade/classNo 필터 + 과목별 독립등록 (AC-5.x)", async () => {
    const n = await bulkEnroll(db5, o, physicsSection, { schoolYear: Y5, grade: 2, classNo: 7 });
    expect(n).toBe(3); // 2-7 3명만
    expect(await listEnrollments(db5, o, physicsSection)).toHaveLength(3);
    // 지구과학 분반은 독립 — 아직 0명
    expect(await listEnrollments(db5, o, earthSection)).toHaveLength(0);
    // 멱등: 재등록 시 0건 추가
    expect(await bulkEnroll(db5, o, physicsSection, { schoolYear: Y5, grade: 2, classNo: 7 })).toBe(0);
  });

  it("시험일 파생(calendarEvents→subjectExams) + 읽기시점 경계일 (AC-5.4)", async () => {
    const cnt = await materializeSubjectExams(db5, o, Y5);
    expect(cnt).toBeGreaterThan(0);
    const exams = await listSubjectExams(db5, o, physicsId);
    expect(exams).toHaveLength(2);
    // 물리는 기말 미시행 → ordinal 2 enabled=false
    const ord2 = exams.find((e) => e.ordinal === 2)!;
    expect(ord2.enabled).toBe(false);

    // 오늘=학기초 → 다가오는 경계일 = 중간(04-15)
    expect(await deriveExamBoundaryDate(db5, o, physicsId, "2098-01-01")).toBe("2098-04-15");
    // 오늘=중간 이후 → 기말 disabled 라 경계 없음(null)
    expect(await deriveExamBoundaryDate(db5, o, physicsId, "2098-05-01")).toBeNull();
  });

  it("분반 역할 복수 CRUD (AC-5.x)", async () => {
    const [enr] = await listEnrollments(db5, o, physicsSection);
    await addSectionRole(db5, o, enr.enrollmentId, "실험조장");
    const r2 = await addSectionRole(db5, o, enr.enrollmentId, "안전관리", "기구 점검");
    let roles = await listSectionRoles(db5, o, enr.enrollmentId);
    expect(roles.map((r) => r.title)).toEqual(["실험조장", "안전관리"]);
    await deleteSectionRole(db5, o, r2);
    roles = await listSectionRoles(db5, o, enr.enrollmentId);
    expect(roles.map((r) => r.title)).toEqual(["실험조장"]);
  });

  it("수행평가 시행일 set/list (멱등 upsert) (AC-5.x)", async () => {
    // 앞선 평가설정 저장으로 물리에 '실험보고서' performance_item 존재
    const [item] = await db5
      .select({ id: performanceItems.id })
      .from(performanceItems)
      .where(eq(performanceItems.subjectId, physicsId));
    await setPerformanceDate(db5, o, physicsSection, item.id, "2098-05-10");
    let dates = await listPerformanceDates(db5, o, physicsSection);
    expect(dates).toEqual([{ performanceItemId: item.id, date: "2098-05-10" }]);
    // 동일 (section, item) 재설정 → 중복 없이 날짜 갱신(멱등)
    await setPerformanceDate(db5, o, physicsSection, item.id, "2098-05-20");
    dates = await listPerformanceDates(db5, o, physicsSection);
    expect(dates).toEqual([{ performanceItemId: item.id, date: "2098-05-20" }]);
  });

  it("P3 배치 쿼리 = 단건 함수 결과 동치 (AC-P3)", async () => {
    // 동치 검증용으로 여러 분반/수강생/역할 상태를 추가 구성:
    // 지구과학 분반에 2-8 2명 등록, physics 첫 수강생에 역할 1건 추가.
    await bulkEnroll(db5, o, earthSection, { schoolYear: Y5, grade: 2, classNo: 8 });
    const [pEnr] = await listEnrollments(db5, o, physicsSection);
    await addSectionRole(db5, o, pEnr.enrollmentId, "조장");

    // ① 시험일: 연도 배치 그룹 == 과목별 단건
    const examsBatch = await listSubjectExamsForYear(db5, o, Y5, 1);
    expect(examsBatch.get(physicsId) ?? []).toEqual(
      await listSubjectExams(db5, o, physicsId),
    );
    expect(examsBatch.get(earthId) ?? []).toEqual(
      await listSubjectExams(db5, o, earthId),
    );

    // ② 수강생: 연도 배치 그룹 == 분반별 단건(sid 순)
    const enrollBatch = await listEnrollmentsForYear(db5, o, Y5, 1);
    expect(enrollBatch.get(physicsSection) ?? []).toEqual(
      await listEnrollments(db5, o, physicsSection),
    );
    expect(enrollBatch.get(earthSection) ?? []).toEqual(
      await listEnrollments(db5, o, earthSection),
    );

    // ③ 분반역할: enrollmentId 집합 배치 == enrollment별 단건
    const enrIds = [...enrollBatch.values()].flat().map((e) => e.enrollmentId);
    expect(enrIds.length).toBeGreaterThan(0);
    const rolesBatch = await listSectionRolesForEnrollments(db5, o, enrIds);
    for (const id of enrIds) {
      expect(rolesBatch.get(id) ?? []).toEqual(
        await listSectionRoles(db5, o, id),
      );
    }
    // 빈 입력 가드(SQL inArray 빈배열 회피)
    expect((await listSectionRolesForEnrollments(db5, o, [])).size).toBe(0);
  });
});

// ── QC v2 2-1 단계 A: 학기 모델(과목 학기별 분리·활성학기 필터) ──
const RUN_SEM = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;
describe.skipIf(!RUN_SEM)("학기 모델 — 과목 학기별 행 분리·활성학기 필터 (AC-A3~A6)", () => {
  let sqlS: ReturnType<typeof postgres>;
  let dbS: PostgresJsDatabase<typeof schema>;
  const o = randomUUID();
  const Y = 2097;

  beforeAll(() => {
    sqlS = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    dbS = drizzle(sqlS, { schema, casing: "snake_case" });
  });
  afterAll(async () => {
    await dbS.delete(timetableSlots).where(eq(timetableSlots.ownerId, o));
    await dbS.delete(courseSections).where(eq(courseSections.ownerId, o));
    await dbS.delete(subjects).where(eq(subjects.ownerId, o));
    await sqlS.end();
  });

  it("동명 과목을 1·2학기 각각 sync → 별도 subject 행 2개 공존", async () => {
    await syncTeacherTimetable(dbS, o, Y, 1, [slot("물리", 2, 7, 1)]);
    await syncTeacherTimetable(dbS, o, Y, 2, [slot("물리", 2, 8, 2)]);

    const rows = await dbS
      .select({
        semester: subjects.semester,
        yck: subjects.yearCourseKey,
      })
      .from(subjects)
      .where(and(eq(subjects.ownerId, o), eq(subjects.name, "물리")));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.semester))).toEqual(new Set([1, 2]));
    // 연간 링크 키는 학기 무관 동일(교실 2-2 대비)
    expect(new Set(rows.map((r) => r.yck))).toEqual(new Set([`물리_${Y}`]));
  });

  it("활성학기 필터: listSubjectsWithSections·getTeacherTimetable 가 학기별 분리", async () => {
    const s1 = await listSubjectsWithSections(dbS, o, Y, 1);
    const s2 = await listSubjectsWithSections(dbS, o, Y, 2);
    expect(s1).toHaveLength(1);
    expect(s2).toHaveLength(1);
    expect(s1[0].sections.map((x) => x.label)).toEqual(["2-7"]);
    expect(s2[0].sections.map((x) => x.label)).toEqual(["2-8"]);

    const t1 = await getTeacherTimetable(dbS, o, Y, 1);
    const t2 = await getTeacherTimetable(dbS, o, Y, 2);
    expect(t1.map((x) => x.label)).toEqual(["2-7"]);
    expect(t2.map((x) => x.label)).toEqual(["2-8"]);
  });

  it("같은 학기 재sync 멱등(과목 행 증가 없음)", async () => {
    await syncTeacherTimetable(dbS, o, Y, 1, [slot("물리", 2, 7, 1)]);
    const rows = await dbS
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.ownerId, o), eq(subjects.name, "물리")));
    expect(rows).toHaveLength(2); // 여전히 2(1·2학기), 중복 생성 없음
  });
});

// ── QC v2 2-1 D: 개별 수강 등록/삭제·수강중인수업 파생·평가 prefill (AC-D1~D4) ──
const RUN_D = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;
describe.skipIf(!RUN_D)("수업 관리 D — 개별등록(cross-class)·수강파생·평가 prefill", () => {
  let sqlD: ReturnType<typeof postgres>;
  let dbD: PostgresJsDatabase<typeof schema>;
  const o = randomUUID();
  const Y = 2096;
  let physicsId = "";
  let physicsSection = "";
  let earthId = "";
  let earthSection = "";
  let stu27 = ""; // 2-7 학생(물리 분반 소속 반)
  let stu99 = ""; // 9-99 타반 학생(cross-class 검증)

  async function mkStudent(sid: string, grade: number, classNo: number, num: number): Promise<string> {
    const [p] = await dbD.insert(persons).values({ ownerId: o, displayName: `s${sid}` }).returning({ id: persons.id });
    const [sy] = await dbD
      .insert(studentYears)
      .values({ ownerId: o, personId: p.id, schoolYear: Y, sid, grade, classNo, number: num, name: `s${sid}` })
      .returning({ id: studentYears.id });
    return sy.id;
  }

  beforeAll(async () => {
    sqlD = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    dbD = drizzle(sqlD, { schema, casing: "snake_case" });
    await syncTeacherTimetable(dbD, o, Y, 1, [
      slot("물리", 2, 7, 1),
      slot("지구과학", 2, 7, 2),
    ]);
    const subs = await dbD
      .select({ id: subjects.id, name: subjects.name })
      .from(subjects)
      .where(and(eq(subjects.ownerId, o), eq(subjects.schoolYear, Y)));
    physicsId = subs.find((s) => s.name === "물리")!.id;
    earthId = subs.find((s) => s.name === "지구과학")!.id;
    const secs = await dbD
      .select({ id: courseSections.id, subjectId: courseSections.subjectId })
      .from(courseSections)
      .where(eq(courseSections.ownerId, o));
    physicsSection = secs.find((s) => s.subjectId === physicsId)!.id;
    earthSection = secs.find((s) => s.subjectId === earthId)!.id;
    stu27 = await mkStudent("20701", 2, 7, 1);
    stu99 = await mkStudent("99999", 9, 99, 99);
  });

  afterAll(async () => {
    await dbD.delete(enrollments).where(eq(enrollments.ownerId, o));
    await dbD.delete(performanceItems).where(eq(performanceItems.ownerId, o));
    await dbD.delete(timetableSlots).where(eq(timetableSlots.ownerId, o));
    await dbD.delete(courseSections).where(eq(courseSections.ownerId, o));
    await dbD.delete(subjects).where(eq(subjects.ownerId, o));
    await dbD.delete(studentYears).where(eq(studentYears.ownerId, o));
    await dbD.delete(persons).where(eq(persons.ownerId, o));
    await sqlD.end();
  });

  it("개별 등록(cross-class) + 멱등(중복 무시) (AC-D2)", async () => {
    const id1 = await enrollOne(dbD, o, physicsSection, stu27);
    expect(id1).not.toBeNull();
    // 타반(9-99) 학생도 물리 분반에 등록 가능(cross-class)
    const id2 = await enrollOne(dbD, o, physicsSection, stu99);
    expect(id2).not.toBeNull();
    // 중복 등록은 무시(null)
    expect(await enrollOne(dbD, o, physicsSection, stu27)).toBeNull();
    expect(await listEnrollments(dbD, o, physicsSection)).toHaveLength(2);
  });

  it("수강중인수업 파생: 등록 후 표시·삭제 후 제거 (AC-D4)", async () => {
    // stu27 은 물리 등록됨 → 수강중인수업에 '물리' 포함
    let subs = await listSubjectsForStudentYear(dbD, o, stu27, Y);
    expect(subs.map((s) => s.subjectName)).toEqual(["물리"]);
    expect(subs[0]).toMatchObject({ semester: 1, sectionLabel: "2-7" });

    // 지구과학도 등록 → 2과목
    await enrollOne(dbD, o, earthSection, stu27);
    subs = await listSubjectsForStudentYear(dbD, o, stu27, Y);
    expect(subs.map((s) => s.subjectName).sort()).toEqual(["물리", "지구과학"]);

    // 물리 수강 삭제 → 제거
    const [physEnr] = (await listEnrollments(dbD, o, physicsSection)).filter(
      (e) => e.studentYearId === stu27,
    );
    await unenroll(dbD, o, physEnr.enrollmentId);
    subs = await listSubjectsForStudentYear(dbD, o, stu27, Y);
    expect(subs.map((s) => s.subjectName)).toEqual(["지구과학"]);
  });

  it("배치 수강 파생 = 단건 동치 (명단 N+1 제거)", async () => {
    const batch = await listSubjectsForStudentYears(dbD, o, [stu27, stu99], Y);
    expect(batch.get(stu27) ?? []).toEqual(
      await listSubjectsForStudentYear(dbD, o, stu27, Y),
    );
    expect(batch.get(stu99) ?? []).toEqual(
      await listSubjectsForStudentYear(dbD, o, stu99, Y),
    );
    expect((await listSubjectsForStudentYears(dbD, o, [], Y)).size).toBe(0);
  });

  it("평가설정 prefill 조회: 저장값 반영(AC-D1)", async () => {
    // 미설정 과목 기본값
    const def = await getEvalSettings(dbD, o, earthId);
    expect(def.performance).toEqual([]);
    expect(def.midEnabled).toBe(true);

    // 저장 후 prefill 반영
    await saveEvalSettings(dbD, o, physicsId, {
      performance: [{ name: "실험보고서", weight: 60 }],
      jipilMid: 40,
      jipilFinal: 0,
      midEnabled: true,
      finalEnabled: false,
    });
    const ev = await getEvalSettings(dbD, o, physicsId);
    expect(ev.performance).toEqual([{ name: "실험보고서", weight: 60 }]);
    expect(ev).toMatchObject({ jipilMid: 40, jipilFinal: 0, midEnabled: true, finalEnabled: false });
  });
});
