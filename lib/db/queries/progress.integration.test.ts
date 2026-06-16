import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import {
  subjects,
  courseSections,
  classSessions,
  timetableSlots,
} from "../schema/classes";
import {
  lessonPlans,
  sessionRecords,
  lessonUnits,
  examTargets,
} from "../schema/records";
import { schoolDayCalendar, calendarEvents } from "../schema/misc";
import {
  generateSemesterSessions,
  listProgressPopup,
  markSessionDone,
  getPlanForSession,
  getSectionProgressStats,
} from "./progress";

/**
 * 수업 진척도 실DB 통합 테스트 (교실 2-2 단계3).
 * 학기차시 생성(done 보존)·schoolDayCalendar 미커버 graceful·팝업 범위(금주∪연체,
 * 미래·done 제외)·markDone(상태+session_records)·getPlanForSession 날짜순위 매핑.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;

async function mkSubject(name: string, semester: number): Promise<string> {
  const [s] = await db
    .insert(subjects)
    .values({ ownerId: owner, name, schoolYear: YEAR, semester })
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
async function mkSlot(sectionId: string, weekday: number): Promise<void> {
  await db
    .insert(timetableSlots)
    .values({ ownerId: owner, sectionId, weekday, period: 1 });
}
async function mkSchoolDay(date: string): Promise<void> {
  await db
    .insert(schoolDayCalendar)
    .values({ ownerId: owner, date, isSchoolDay: true });
}
async function mkSession(
  sectionId: string,
  date: string,
  status: "planned" | "done" | "not_held",
): Promise<string> {
  const [s] = await db
    .insert(classSessions)
    .values({ ownerId: owner, sectionId, date, status })
    .returning({ id: classSessions.id });
  return s.id;
}

/** 오늘 기준 상대 날짜(UTC, YYYY-MM-DD). */
function dayOffset(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe.skipIf(!RUN)("수업 진척도 쿼리", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    // session_records 는 class_sessions 의 ON DELETE CASCADE 로 함께 정리되나 명시.
    await db.delete(sessionRecords).where(eq(sessionRecords.ownerId, owner));
    await db.delete(classSessions).where(eq(classSessions.ownerId, owner));
    await db.delete(lessonPlans).where(eq(lessonPlans.ownerId, owner));
    await db.delete(timetableSlots).where(eq(timetableSlots.ownerId, owner));
    await db.delete(schoolDayCalendar).where(eq(schoolDayCalendar.ownerId, owner));
    await db.delete(calendarEvents).where(eq(calendarEvents.ownerId, owner));
    await db.delete(courseSections).where(eq(courseSections.ownerId, owner));
    await db.delete(subjects).where(eq(subjects.ownerId, owner));
    await sql.end();
  });

  it("generateSemesterSessions — 학기 전체 차시 생성 + 기존 done 보존", async () => {
    const subj = await mkSubject("통합과학", 1);
    const sec = await mkSection(subj, "2-1");
    await mkSlot(sec, 1); // 월
    await mkSlot(sec, 3); // 수

    // 1학기 범위(2099-03-01~08-14) 내 수업일: 월 2 + 수 2 + 슬롯무관 금 1.
    await mkSchoolDay("2099-03-02"); // 월
    await mkSchoolDay("2099-03-04"); // 수
    await mkSchoolDay("2099-03-09"); // 월
    await mkSchoolDay("2099-03-11"); // 수
    await mkSchoolDay("2099-03-06"); // 금(슬롯 없음 → 제외)

    // 사전 done 차시(3/02)를 수동 삽입 → 생성이 덮어쓰지 않아야 함.
    await mkSession(sec, "2099-03-02", "done");

    const r = await generateSemesterSessions(db, owner, sec, YEAR, 1);
    expect(r.total).toBe(4); // 월2+수2

    const rows = await db
      .select({ date: classSessions.date, status: classSessions.status })
      .from(classSessions)
      .where(eq(classSessions.sectionId, sec));
    expect(rows).toHaveLength(4);
    // 3/02 는 여전히 done(보존), 나머지 3개는 planned.
    const byDate = new Map(rows.map((x) => [x.date, x.status]));
    expect(byDate.get("2099-03-02")).toBe("done");
    expect(byDate.get("2099-03-04")).toBe("planned");
    expect(byDate.get("2099-03-09")).toBe("planned");
    expect(byDate.get("2099-03-11")).toBe("planned");
  });

  it("generateSemesterSessions — schoolDayCalendar 미커버 시 no-op(throw 없음)", async () => {
    const subj = await mkSubject("미술", 2); // 2학기, 수업일 미시드
    const sec = await mkSection(subj, "2-2");
    await mkSlot(sec, 2); // 화

    const r = await generateSemesterSessions(db, owner, sec, YEAR, 2);
    expect(r).toEqual({ generated: 0, removed: 0, total: 0 });

    const rows = await db
      .select({ id: classSessions.id })
      .from(classSessions)
      .where(eq(classSessions.sectionId, sec));
    expect(rows).toHaveLength(0);
  });

  it("listProgressPopup — 연체·금주 포함, 미래(다음주)·done 제외", async () => {
    const subj = await mkSubject("물리", 1);
    const sec = await mkSection(subj, "2-3");

    const overdue = await mkSession(sec, dayOffset(-3), "planned"); // 연체
    const thisWeek = await mkSession(sec, dayOffset(0), "planned"); // 오늘(금주)
    await mkSession(sec, dayOffset(10), "planned"); // 다음주 이후(미래) → 제외
    await mkSession(sec, dayOffset(-1), "done"); // 완료 → 제외

    const popup = await listProgressPopup(db, owner, YEAR, 1);
    const ids = new Set(popup.map((p) => p.sessionId));
    expect(ids.has(overdue)).toBe(true);
    expect(ids.has(thisWeek)).toBe(true);
    // 미래·done 은 미포함.
    expect(popup.every((p) => p.sessionId !== undefined)).toBe(true);
    expect(popup.filter((p) => p.date === dayOffset(10))).toHaveLength(0);
    const od = popup.find((p) => p.sessionId === overdue);
    expect(od?.overdue).toBe(true);
    expect(od?.subjectName).toBe("물리");
  });

  it("markSessionDone — 상태 done + session_records 생성", async () => {
    const subj = await mkSubject("화학", 1);
    const sec = await mkSection(subj, "2-4");
    const sid = await mkSession(sec, "2099-04-01", "planned");

    await markSessionDone(db, owner, sid, {
      actualContent: "산-염기 적정 실험",
      keywords: ["적정", "지시약"],
      evalIdea: "적정 곡선 해석 평가",
      planOrdinal: 3,
    });

    const [sess] = await db
      .select({ status: classSessions.status })
      .from(classSessions)
      .where(eq(classSessions.id, sid));
    expect(sess.status).toBe("done");

    const [rec] = await db
      .select({
        actualContent: sessionRecords.actualContent,
        keywords: sessionRecords.keywords,
        evalIdea: sessionRecords.evalIdea,
        planOrdinal: sessionRecords.planOrdinal,
      })
      .from(sessionRecords)
      .where(eq(sessionRecords.sessionId, sid));
    expect(rec.actualContent).toBe("산-염기 적정 실험");
    expect(rec.keywords).toEqual(["적정", "지시약"]);
    expect(rec.evalIdea).toBe("적정 곡선 해석 평가");
    expect(rec.planOrdinal).toBe(3);
  });

  // QC v3 AC-2: 여름방학 vacation 이벤트가 학기 경계가 되어 방학 이후 8월 수업일이
  // 2학기로 분류된다(1학기에서 제외). vacation 미설정 시 8/14 fallback.
  async function mkVacation(date: string): Promise<void> {
    await db.insert(calendarEvents).values({
      ownerId: owner,
      date,
      source: "manual",
      title: "여름방학",
      eventKind: "vacation",
    });
  }
  async function sectionSessionDates(sectionId: string): Promise<Set<string>> {
    const rows = await db
      .select({ date: classSessions.date })
      .from(classSessions)
      .where(eq(classSessions.sectionId, sectionId));
    return new Set(rows.map((r) => r.date));
  }

  it("generateSemesterSessions — 여름방학 경계: 방학 이후 8월 수업일이 2학기로 분류", async () => {
    // 경계 B = 2099-07-20(vacation). sem1=[3/1,7/19], sem2=[7/20,익년2월말].
    await mkVacation("2099-07-20");
    const subj = await mkSubject("지구과학", 1);
    const sec = await mkSection(subj, "2-경계");
    await mkSlot(sec, 1); // 월

    await mkSchoolDay("2099-07-06"); // 월, 방학 전 → 1학기
    await mkSchoolDay("2099-08-10"); // 월, 방학 후 → 2학기

    await generateSemesterSessions(db, owner, sec, YEAR, 1);
    const sem1 = await sectionSessionDates(sec);
    expect(sem1.has("2099-07-06")).toBe(true); // 방학 전 = 1학기 포함
    expect(sem1.has("2099-08-10")).toBe(false); // 방학 후 = 1학기 제외

    await generateSemesterSessions(db, owner, sec, YEAR, 2);
    const sem2 = await sectionSessionDates(sec);
    expect(sem2.has("2099-08-10")).toBe(true); // 방학 후 = 2학기 포함
  });

  it("generateSemesterSessions — vacation 미설정 시 8/14 경계 fallback", async () => {
    // 2098 학년도 여름 vacation 없음 → 경계 fallback 8/15. sem1=[3/1,8/14].
    const FALLBACK_YEAR = 2098;
    const subj = await db
      .insert(subjects)
      .values({ ownerId: owner, name: "fallback과목", schoolYear: FALLBACK_YEAR, semester: 1 })
      .returning({ id: subjects.id });
    const sec = await mkSection(subj[0].id, "2-fb");
    await mkSlot(sec, 0); // 일(2098-08-10)
    await mkSlot(sec, 3); // 수(2098-08-20)

    await mkSchoolDay("2098-08-10"); // 8/14 이전 → 1학기
    await mkSchoolDay("2098-08-20"); // 8/15 이후 → 2학기

    await generateSemesterSessions(db, owner, sec, FALLBACK_YEAR, 1);
    const sem1 = await sectionSessionDates(sec);
    expect(sem1.has("2098-08-10")).toBe(true); // fallback 경계 8/14 이전 = 1학기
    expect(sem1.has("2098-08-20")).toBe(false); // 8/15 이후 = 1학기 제외
  });

  it("getPlanForSession — 날짜순위 k → 계획 ordinal k, k>N 은 null", async () => {
    const subj = await mkSubject("생명과학", 1);
    const sec = await mkSection(subj, "2-5");
    // 날짜순 3개 차시.
    await mkSession(sec, "2099-05-01", "planned");
    const second = await mkSession(sec, "2099-05-02", "planned");
    const third = await mkSession(sec, "2099-05-03", "planned");

    // 과목 계획: ordinal 1·2 만 존재(3은 없음 → k=3 은 null).
    await db.insert(lessonPlans).values([
      { ownerId: owner, subjectId: subj, ordinal: 1, content: "1차시계획", keywords: ["세포"] },
      { ownerId: owner, subjectId: subj, ordinal: 2, content: "2차시계획", keywords: ["유전"] },
    ]);

    // 2번째 차시(날짜순) → ordinal 2.
    const p2 = await getPlanForSession(db, owner, second);
    expect(p2?.ordinal).toBe(2);
    expect(p2?.content).toBe("2차시계획");
    expect(p2?.keywords).toEqual(["유전"]);

    // 3번째 차시 → 계획 ordinal 3 없음 → null(graceful).
    const p3 = await getPlanForSession(db, owner, third);
    expect(p3).toBeNull();
  });
});

// QC v4 US-3: 분반별 진척도 통계(목표·실제 진도율, 초록/빨강, 시험목표 범위 필터).
describe.skipIf(!RUN)("getSectionProgressStats (QC v4 US-3)", () => {
  let sql2: ReturnType<typeof postgres>;
  let db2: PostgresJsDatabase<typeof schema>;
  const owner2 = randomUUID();
  const Y = 2097;

  beforeAll(async () => {
    sql2 = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db2 = drizzle(sql2, { schema, casing: "snake_case" });
  });
  afterAll(async () => {
    await db2.delete(sessionRecords).where(eq(sessionRecords.ownerId, owner2));
    await db2.delete(classSessions).where(eq(classSessions.ownerId, owner2));
    await db2.delete(lessonPlans).where(eq(lessonPlans.ownerId, owner2));
    await db2.delete(examTargets).where(eq(examTargets.ownerId, owner2));
    await db2.delete(lessonUnits).where(eq(lessonUnits.ownerId, owner2));
    await db2.delete(courseSections).where(eq(courseSections.ownerId, owner2));
    await db2.delete(subjects).where(eq(subjects.ownerId, owner2));
    await sql2.end();
  });

  function rel(days: number): string {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  it("시험목표 범위 필터 + 분반별 목표/실제 진도율 + 초록/빨강", async () => {
    const [subj] = await db2
      .insert(subjects)
      .values({ ownerId: owner2, name: "통계과목", schoolYear: Y, semester: 1 })
      .returning({ id: subjects.id });
    const [secA] = await db2
      .insert(courseSections)
      .values({ ownerId: owner2, subjectId: subj.id, label: "A" })
      .returning({ id: courseSections.id });
    const [secB] = await db2
      .insert(courseSections)
      .values({ ownerId: owner2, subjectId: subj.id, label: "B" })
      .returning({ id: courseSections.id });

    // 세부단원 3개(코드 10101/10102/20101).
    const units = await db2
      .insert(lessonUnits)
      .values([
        { ownerId: owner2, subjectId: subj.id, majorNo: 1, midNo: 1, minorNo: 1, majorName: "대1", midName: "중1", minorName: "소1", minOrdinals: 1 },
        { ownerId: owner2, subjectId: subj.id, majorNo: 1, midNo: 1, minorNo: 2, majorName: "대1", midName: "중1", minorName: "소2", minOrdinals: 1 },
        { ownerId: owner2, subjectId: subj.id, majorNo: 2, midNo: 1, minorNo: 1, majorName: "대2", midName: "중1", minorName: "소1", minOrdinals: 1 },
      ])
      .returning({ id: lessonUnits.id, majorNo: lessonUnits.majorNo, midNo: lessonUnits.midNo, minorNo: lessonUnits.minorNo });
    const codeOf = (u: { majorNo: number; midNo: number; minorNo: number }) =>
      u.majorNo * 10000 + u.midNo * 100 + u.minorNo;
    const u1 = units.find((u) => codeOf(u) === 10101)!;
    const u2 = units.find((u) => codeOf(u) === 10102)!;
    const u3 = units.find((u) => codeOf(u) === 20101)!;

    // 차시계획 3개(unit 연결). 시험목표 범위 10101~10102 → 2개만 포함(u3 제외).
    await db2.insert(lessonPlans).values([
      { ownerId: owner2, subjectId: subj.id, ordinal: 1, content: "c1", unitId: u1.id },
      { ownerId: owner2, subjectId: subj.id, ordinal: 2, content: "c2", unitId: u2.id },
      { ownerId: owner2, subjectId: subj.id, ordinal: 3, content: "c3", unitId: u3.id },
    ]);
    await db2.insert(examTargets).values({
      ownerId: owner2, subjectId: subj.id, examOrdinal: 1, unitFromCode: 10101, unitToCode: 10102,
    });

    // 분반 A: 과거 planned 1 + 과거 done 1 + 미래 planned 1 → plannedToToday=2, done=1.
    await db2.insert(classSessions).values([
      { ownerId: owner2, sectionId: secA.id, date: rel(-3), status: "planned" },
      { ownerId: owner2, sectionId: secA.id, date: rel(-1), status: "done" },
      { ownerId: owner2, sectionId: secA.id, date: rel(5), status: "planned" },
    ]);
    // 분반 B: 과거 planned 2, done 0 → plannedToToday=2, done=0 → 2차시 뒤짐=빨강.
    await db2.insert(classSessions).values([
      { ownerId: owner2, sectionId: secB.id, date: rel(-4), status: "planned" },
      { ownerId: owner2, sectionId: secB.id, date: rel(-2), status: "planned" },
    ]);

    const stats = await getSectionProgressStats(db2, owner2, Y, 1);
    const a = stats.find((s) => s.sectionId === secA.id)!;
    const b = stats.find((s) => s.sectionId === secB.id)!;

    // 시험목표 총 차시 = 범위 내 2개(u3 제외).
    expect(a.examTargetTotal).toBe(2);
    expect(b.examTargetTotal).toBe(2);

    // 분반 A: 계획2/실제1 → 1차시 뒤짐 → 초록.
    expect(a.plannedToToday).toBe(2);
    expect(a.actualDone).toBe(1);
    expect(a.actualRate).toBeCloseTo(0.5);
    expect(a.color).toBe("green");

    // 분반 B: 계획2/실제0 → 2차시 뒤짐 → 빨강(분반별 독립).
    expect(b.plannedToToday).toBe(2);
    expect(b.actualDone).toBe(0);
    expect(b.color).toBe("red");
  });

  it("시험목표 미설정 시 분반 전체 차시로 폴백", async () => {
    const [subj] = await db2
      .insert(subjects)
      .values({ ownerId: owner2, name: "폴백과목", schoolYear: Y, semester: 2 })
      .returning({ id: subjects.id });
    const [sec] = await db2
      .insert(courseSections)
      .values({ ownerId: owner2, subjectId: subj.id, label: "C" })
      .returning({ id: courseSections.id });
    // QC v5 AC-2.1 활성 조건: lesson_plans 존재 필요(없으면 진척도 비활성).
    await db2.insert(lessonPlans).values([
      { ownerId: owner2, subjectId: subj.id, ordinal: 1, content: "p1" },
      { ownerId: owner2, subjectId: subj.id, ordinal: 2, content: "p2" },
    ]);
    await db2.insert(classSessions).values([
      { ownerId: owner2, sectionId: sec.id, date: rel(-2), status: "done" },
      { ownerId: owner2, sectionId: sec.id, date: rel(3), status: "planned" },
    ]);

    const stats = await getSectionProgressStats(db2, owner2, Y, 2);
    const c = stats.find((s) => s.sectionId === sec.id)!;
    // exam_targets 없음 → 분반 전체 차시(2)로 폴백.
    expect(c.examTargetTotal).toBe(2);
    expect(c.actualDone).toBe(1);
  });

  it("AC-2.1 활성 조건 — lesson_plans 없으면 진척도 비활성(분반 제외)", async () => {
    const [subj] = await db2
      .insert(subjects)
      .values({ ownerId: owner2, name: "비활성과목", schoolYear: Y, semester: 1 })
      .returning({ id: subjects.id });
    const [sec] = await db2
      .insert(courseSections)
      .values({ ownerId: owner2, subjectId: subj.id, label: "Z" })
      .returning({ id: courseSections.id });
    // class_sessions 는 있으나 lesson_plans 없음 → 활성 아님.
    await db2.insert(classSessions).values([
      { ownerId: owner2, sectionId: sec.id, date: rel(-1), status: "done" },
    ]);
    const stats = await getSectionProgressStats(db2, owner2, Y, 1);
    expect(stats.find((s) => s.sectionId === sec.id)).toBeUndefined();
  });

  it("AC-2.2/M2 — done 차시 마지막 단원코드 도출, 여유차시(빈셀)는 제외", async () => {
    const [subj] = await db2
      .insert(subjects)
      .values({ ownerId: owner2, name: "단원진도과목", schoolYear: Y, semester: 1 })
      .returning({ id: subjects.id });
    const [sec] = await db2
      .insert(courseSections)
      .values({ ownerId: owner2, subjectId: subj.id, label: "D" })
      .returning({ id: courseSections.id });
    const units = await db2
      .insert(lessonUnits)
      .values([
        { ownerId: owner2, subjectId: subj.id, majorNo: 1, midNo: 1, minorNo: 1, majorName: "대1", midName: "중1", minorName: "소1", minOrdinals: 1 },
        { ownerId: owner2, subjectId: subj.id, majorNo: 1, midNo: 1, minorNo: 2, majorName: "대1", midName: "중1", minorName: "소2", minOrdinals: 1 },
      ])
      .returning({ id: lessonUnits.id, majorNo: lessonUnits.majorNo, midNo: lessonUnits.midNo, minorNo: lessonUnits.minorNo });
    const codeOf = (u: { majorNo: number; midNo: number; minorNo: number }) =>
      u.majorNo * 10000 + u.midNo * 100 + u.minorNo;
    const u1 = units.find((u) => codeOf(u) === 10101)!;
    const u2 = units.find((u) => codeOf(u) === 10102)!;

    // 계획: ordinal 1=u1(10101), 2=빈 여유차시(slack), 3=u2(10102).
    await db2.insert(lessonPlans).values([
      { ownerId: owner2, subjectId: subj.id, ordinal: 1, content: "c1", unitId: u1.id },
      { ownerId: owner2, subjectId: subj.id, ordinal: 2, content: null, unitId: null }, // slack
      { ownerId: owner2, subjectId: subj.id, ordinal: 3, content: "c3", unitId: u2.id },
    ]);
    // 차시(날짜순위 k=1,2,3 매핑). 1·2 done, 3 planned.
    // 날짜순위 2 = 여유차시(빈셀) → 마지막 done 단원은 빈셀을 건너뛰고 k=1 의 u1(10101).
    await db2.insert(classSessions).values([
      { ownerId: owner2, sectionId: sec.id, date: rel(-3), status: "done" }, // k=1 → u1
      { ownerId: owner2, sectionId: sec.id, date: rel(-2), status: "done" }, // k=2 → slack(제외)
      { ownerId: owner2, sectionId: sec.id, date: rel(-1), status: "planned" }, // k=3 → u2(미완료)
    ]);

    const stats = await getSectionProgressStats(db2, owner2, Y, 1);
    const d = stats.find((s) => s.sectionId === sec.id)!;
    // 마지막 done 단원 = 10101(u1). 여유차시(k=2)는 도출에서 제외.
    expect(d.lastDoneUnitCode).toBe(10101);
    expect(d.lastDoneUnitLabel).toContain("소1");
  });

  it("AC-2.4 — 지필 둘 다 미시행이면 시험진도율 생략(showExamProgress=false)", async () => {
    const [subj] = await db2
      .insert(subjects)
      .values({
        ownerId: owner2,
        name: "비지필과목",
        schoolYear: Y,
        semester: 1,
        jipilMidEnabled: false,
        jipilFinalEnabled: false,
      })
      .returning({ id: subjects.id });
    const [sec] = await db2
      .insert(courseSections)
      .values({ ownerId: owner2, subjectId: subj.id, label: "E" })
      .returning({ id: courseSections.id });
    await db2.insert(lessonPlans).values([
      { ownerId: owner2, subjectId: subj.id, ordinal: 1, content: "p1" },
    ]);
    await db2.insert(classSessions).values([
      { ownerId: owner2, sectionId: sec.id, date: rel(-1), status: "done" },
    ]);
    const stats = await getSectionProgressStats(db2, owner2, Y, 1);
    const e = stats.find((s) => s.sectionId === sec.id)!;
    expect(e.showExamProgress).toBe(false);
  });
});
