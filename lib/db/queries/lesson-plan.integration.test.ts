import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { subjects, courseSections, timetableSlots } from "../schema/classes";
import { lessonPlans, lessonUnits, examTargets } from "../schema/records";
import { schoolDayCalendar, calendarEvents } from "../schema/misc";
import {
  getPlanLength,
  getPlanView,
  getSubjectPlanMeta,
  applyUnitLayout,
  listLessonPlan,
  upsertLessonPlanEntry,
  deleteLessonPlanEntry,
  listLessonUnits,
  upsertLessonUnit,
  deleteLessonUnit,
  lookupUnitByCode,
  listExamTargets,
  upsertExamTarget,
  countOrdinalsPerUnit,
  isSemesterPlanComplete,
  toggleSlackCell,
  untoggleSlackCell,
} from "./lesson-plan";
import { sixDigitCode, validateMinOrdinals } from "@/lib/domain/lesson-unit";
import { isSlackCell, layoutUnitsByExamTargets } from "@/lib/domain/lesson-plan";

/**
 * 수업 계획실 실DB 통합 테스트 (교실 2-2 단계2).
 * upsert/list/delete · 동일 (subjectId,ordinal) 갱신(중복 아님) · 차시 N 산출 ·
 * 동명 학기별 과목 독립 계획.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;

let subj1: string; // 1학기 과목
let subj2: string; // 동명 2학기 과목
let subj3: string; // 다분반(요일 상이) 과목 — 대표분반 동치 검증

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

describe.skipIf(!RUN)("수업 계획실 쿼리", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });

    subj1 = await mkSubject("통합과학", 1);
    subj2 = await mkSubject("통합과학", 2); // 동명 2학기 — 독립 계획

    // subj1 분반: 월(1)·수(3) 슬롯.
    const sec1 = await mkSection(subj1, "2-1");
    await mkSlot(sec1, 1);
    await mkSlot(sec1, 3);

    // 1학기 범위(2099-03-01~08-14) 내 수업일: 월 3개 + 수 2개 + 무관 금 1개.
    await mkSchoolDay("2099-03-02"); // 월
    await mkSchoolDay("2099-03-04"); // 수
    await mkSchoolDay("2099-03-09"); // 월
    await mkSchoolDay("2099-03-11"); // 수
    await mkSchoolDay("2099-03-16"); // 월
    await mkSchoolDay("2099-03-06"); // 금(슬롯 없음 → 미카운트)
    // 대표분반 검증용 추가 수업일: 화 1 + 목 1.
    await mkSchoolDay("2099-03-03"); // 화
    await mkSchoolDay("2099-03-05"); // 목

    // subj3: 분반A 월·수(2슬롯), 분반B 화·목·금(3슬롯=대표). UNION 이면 8(전부),
    // 대표분반(B)만이면 화1+목1+금1 = 3. 분반 수와 무관해야 함(물리 97 버그 방지).
    subj3 = await mkSubject("물리학", 1);
    const sA = await mkSection(subj3, "2-1");
    await mkSlot(sA, 1); // 월
    await mkSlot(sA, 3); // 수
    const sB = await mkSection(subj3, "2-2");
    await mkSlot(sB, 2); // 화
    await mkSlot(sB, 4); // 목
    await mkSlot(sB, 5); // 금
  });

  afterAll(async () => {
    await db.delete(lessonPlans).where(eq(lessonPlans.ownerId, owner));
    await db.delete(examTargets).where(eq(examTargets.ownerId, owner));
    await db.delete(lessonUnits).where(eq(lessonUnits.ownerId, owner));
    await db.delete(timetableSlots).where(eq(timetableSlots.ownerId, owner));
    await db.delete(schoolDayCalendar).where(eq(schoolDayCalendar.ownerId, owner));
    await db.delete(courseSections).where(eq(courseSections.ownerId, owner));
    await db.delete(subjects).where(eq(subjects.ownerId, owner));
    await sql.end();
  });

  it("차시 N 산출 — 월·수 슬롯 ∩ 1학기 수업일 = 5 (금 제외)", async () => {
    const n = await getPlanLength(db, owner, subj1, YEAR, 1);
    expect(n).toBe(5);
  });

  it("AC-1.2 차시 N 분반무관 — 대표분반(화목금 3슬롯) = 3, UNION(8) 아님", async () => {
    const n = await getPlanLength(db, owner, subj3, YEAR, 1);
    expect(n).toBe(3); // 화1+목1+금1 (대표=분반B). UNION 이면 8.
  });

  it("AC-1.2 분반 추가해도 N 불변 — 월·수 분반 1개 더 추가해도 3 유지", async () => {
    const sC = await mkSection(subj3, "2-3");
    await mkSlot(sC, 1); // 월
    await mkSlot(sC, 3); // 수
    const n = await getPlanLength(db, owner, subj3, YEAR, 1);
    expect(n).toBe(3); // 여전히 대표분반(B) 기준 — 분반 수 무관(물리 97 버그 방지)
  });

  it("AC-1.3 getPlanView — 차시별 월/주차 메타 + 길이", async () => {
    const view = await getPlanView(db, owner, subj1, YEAR, 1);
    expect(view.length).toBe(5);
    expect(view.ordinals).toHaveLength(5);
    expect(view.ordinals[0]).toMatchObject({ ordinal: 1, month: 3, weekOfMonth: 1 });
  });

  it("upsert 후 list — 항목 반환(키워드 보존)", async () => {
    await upsertLessonPlanEntry(db, owner, subj1, 1, {
      content: "1차시 오리엔테이션",
      keywords: ["탐구", "안전"],
    });
    const list = await listLessonPlan(db, owner, subj1);
    expect(list).toHaveLength(1);
    expect(list[0].ordinal).toBe(1);
    expect(list[0].content).toBe("1차시 오리엔테이션");
    expect(list[0].keywords).toEqual(["탐구", "안전"]);
  });

  it("동일 (subjectId,ordinal) upsert — 갱신, 중복 아님", async () => {
    await upsertLessonPlanEntry(db, owner, subj1, 1, {
      content: "1차시 수정본",
      keywords: ["측정"],
    });
    const list = await listLessonPlan(db, owner, subj1);
    expect(list).toHaveLength(1); // 여전히 1행
    expect(list[0].content).toBe("1차시 수정본");
    expect(list[0].keywords).toEqual(["측정"]);
  });

  it("delete — 해당 차시 제거", async () => {
    await upsertLessonPlanEntry(db, owner, subj1, 2, { content: "2차시" });
    expect(await listLessonPlan(db, owner, subj1)).toHaveLength(2);
    await deleteLessonPlanEntry(db, owner, subj1, 2);
    const list = await listLessonPlan(db, owner, subj1);
    expect(list).toHaveLength(1);
    expect(list[0].ordinal).toBe(1);
  });

  it("동명 학기별 과목 — 독립 계획", async () => {
    await upsertLessonPlanEntry(db, owner, subj2, 1, { content: "2학기 1차시" });
    const p1 = await listLessonPlan(db, owner, subj1);
    const p2 = await listLessonPlan(db, owner, subj2);
    expect(p1).toHaveLength(1);
    expect(p2).toHaveLength(1);
    expect(p1[0].content).toBe("1차시 수정본");
    expect(p2[0].content).toBe("2학기 1차시");
  });
});

describe.skipIf(!RUN)("학기계획 세부단원·시험목표 (QC v4 US-2)", () => {
  const owner2 = randomUUID();
  let sql2: ReturnType<typeof postgres>;
  let db2: PostgresJsDatabase<typeof schema>;
  let sub: string;

  beforeAll(async () => {
    sql2 = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db2 = drizzle(sql2, { schema, casing: "snake_case" });
    const [s] = await db2
      .insert(subjects)
      .values({ ownerId: owner2, name: "지구과학", schoolYear: 2099, semester: 1 })
      .returning({ id: subjects.id });
    sub = s.id;
  });

  afterAll(async () => {
    await db2.delete(lessonPlans).where(eq(lessonPlans.ownerId, owner2));
    await db2.delete(examTargets).where(eq(examTargets.ownerId, owner2));
    await db2.delete(lessonUnits).where(eq(lessonUnits.ownerId, owner2));
    await db2.delete(subjects).where(eq(subjects.ownerId, owner2));
    await sql2.end();
  });

  it("isSemesterPlanComplete — 단원 없으면 false", async () => {
    expect(await isSemesterPlanComplete(db2, owner2, sub)).toBe(false);
  });

  it("upsertLessonUnit + list — 6자리 코드 오름차순", async () => {
    await upsertLessonUnit(db2, owner2, sub, {
      majorNo: 2,
      midNo: 1,
      minorNo: 1,
      majorName: "대기",
      midName: "기단",
      minorName: "전선",
      keywords: ["한랭전선"],
      minOrdinals: 2,
    });
    await upsertLessonUnit(db2, owner2, sub, {
      majorNo: 1,
      midNo: 1,
      minorNo: 1,
      majorName: "지권",
      midName: "암석",
      minorName: "화성암",
      keywords: ["마그마"],
      minOrdinals: 1,
    });
    const units = await listLessonUnits(db2, owner2, sub);
    expect(units).toHaveLength(2);
    expect(sixDigitCode(units[0])).toBe(10101); // 1·1·1 먼저
    expect(sixDigitCode(units[1])).toBe(20101);
    expect(units[0].keywords).toEqual(["마그마"]);
  });

  it("isSemesterPlanComplete — 단원 있으면 true(게이트 통과)", async () => {
    expect(await isSemesterPlanComplete(db2, owner2, sub)).toBe(true);
  });

  it("upsertLessonUnit 충돌 — 동일 코드 갱신(중복 아님)", async () => {
    await upsertLessonUnit(db2, owner2, sub, {
      majorNo: 1,
      midNo: 1,
      minorNo: 1,
      majorName: "지권",
      midName: "암석",
      minorName: "화성암(수정)",
      keywords: ["현무암"],
      minOrdinals: 3,
    });
    const units = await listLessonUnits(db2, owner2, sub);
    expect(units).toHaveLength(2); // 여전히 2
    const u = units.find((x) => sixDigitCode(x) === 10101)!;
    expect(u.minorName).toBe("화성암(수정)");
    expect(u.minOrdinals).toBe(3);
  });

  it("lookupUnitByCode — 유효 코드 조회, 미존재 코드 null(AC-1.6)", async () => {
    const found = await lookupUnitByCode(db2, owner2, sub, 20101);
    expect(found?.minorName).toBe("전선");
    const missing = await lookupUnitByCode(db2, owner2, sub, 990101);
    expect(missing).toBeNull();
  });

  it("upsertExamTarget + list — 범위(from~to) 저장·갱신", async () => {
    await upsertExamTarget(db2, owner2, sub, 1, 10101, 20101);
    await upsertExamTarget(db2, owner2, sub, 2, 20101, null);
    let targets = await listExamTargets(db2, owner2, sub);
    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({
      examOrdinal: 1,
      unitFromCode: 10101,
      unitToCode: 20101,
    });
    // 동일 차수 재저장 → 갱신(중복 아님)
    await upsertExamTarget(db2, owner2, sub, 1, 10101, 10101);
    targets = await listExamTargets(db2, owner2, sub);
    expect(targets).toHaveLength(2);
    expect(targets[0].unitToCode).toBe(10101);
  });

  it("countOrdinalsPerUnit + 최소차시 초과 검증(AC-1.8)", async () => {
    const units = await listLessonUnits(db2, owner2, sub);
    const u1 = units.find((x) => sixDigitCode(x) === 10101)!; // minOrdinals=3
    const u2 = units.find((x) => sixDigitCode(x) === 20101)!; // minOrdinals=2

    // u2 에 3개 차시 연결(최소 2 초과), u1 에 1개(최소 3 미만).
    await upsertLessonPlanEntry(db2, owner2, sub, 1, { content: "c1", unitId: u1.id });
    await upsertLessonPlanEntry(db2, owner2, sub, 2, { content: "c2", unitId: u2.id });
    await upsertLessonPlanEntry(db2, owner2, sub, 3, { content: "c3", unitId: u2.id });
    await upsertLessonPlanEntry(db2, owner2, sub, 4, { content: "c4", unitId: u2.id });

    const counts = await countOrdinalsPerUnit(db2, owner2, sub);
    expect(counts.get(u1.id)).toBe(1);
    expect(counts.get(u2.id)).toBe(3);

    expect(validateMinOrdinals(u1.minOrdinals, counts.get(u1.id) ?? 0).exceeded).toBe(
      false,
    );
    expect(validateMinOrdinals(u2.minOrdinals, counts.get(u2.id) ?? 0).exceeded).toBe(
      true,
    );
  });

  it("deleteLessonUnit — 차시 연결은 set null 로 보존", async () => {
    const units = await listLessonUnits(db2, owner2, sub);
    const u2 = units.find((x) => sixDigitCode(x) === 20101)!;
    await deleteLessonUnit(db2, owner2, u2.id);
    const after = await listLessonUnits(db2, owner2, sub);
    expect(after.find((x) => x.id === u2.id)).toBeUndefined();
    // 차시는 보존(unitId 만 null)
    const plans = await listLessonPlan(db2, owner2, sub);
    expect(plans.length).toBeGreaterThanOrEqual(4);
    expect(plans.find((p) => p.ordinal === 2)?.unitId).toBeNull();
  });
});

describe.skipIf(!RUN)("QC v5 c1 여유차시 토글 — 비-deferrable unique 무위반", () => {
  const owner3 = randomUUID();
  let sql3: ReturnType<typeof postgres>;
  let db3: PostgresJsDatabase<typeof schema>;
  let sub: string;

  beforeAll(async () => {
    sql3 = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db3 = drizzle(sql3, { schema, casing: "snake_case" });
    const [s] = await db3
      .insert(subjects)
      .values({ ownerId: owner3, name: "화학", schoolYear: 2099, semester: 1 })
      .returning({ id: subjects.id });
    sub = s.id;
    // 5차시: 1..4 내용, 5 는 빈 여유차시(끝 슬랙) — 시프트 시 손실 없이 밀어낼 공간.
    await upsertLessonPlanEntry(db3, owner3, sub, 1, { content: "a", keywords: ["ka"] });
    await upsertLessonPlanEntry(db3, owner3, sub, 2, { content: "b" });
    await upsertLessonPlanEntry(db3, owner3, sub, 3, { content: "c" });
    await upsertLessonPlanEntry(db3, owner3, sub, 4, { content: "d" });
    await upsertLessonPlanEntry(db3, owner3, sub, 5, {}); // 빈 여유차시(slack)
  });

  afterAll(async () => {
    await db3.delete(lessonPlans).where(eq(lessonPlans.ownerId, owner3));
    await db3.delete(subjects).where(eq(subjects.ownerId, owner3));
    await sql3.end();
  });

  it("중간 차시 여유차시 토글 — unique violation 없이 한 칸 뒤로 시프트", async () => {
    // ordinal 2 를 여유차시로 등록 → 2 빈셀, 2→3, 3→4, 4→5(끝 슬랙 흡수).
    const res = await toggleSlackCell(db3, owner3, sub, 2);
    expect(res.ok).toBe(true);
    const after = await listLessonPlan(db3, owner3, sub);
    // ordinal 은 그대로 1..5(키 충돌·중복 없음).
    expect(after.map((p) => p.ordinal)).toEqual([1, 2, 3, 4, 5]);
    expect(after.find((p) => p.ordinal === 1)?.content).toBe("a");
    const o2 = after.find((p) => p.ordinal === 2)!;
    expect(isSlackCell(o2)).toBe(true); // 빈 여유차시
    expect(after.find((p) => p.ordinal === 3)?.content).toBe("b");
    expect(after.find((p) => p.ordinal === 4)?.content).toBe("c");
    expect(after.find((p) => p.ordinal === 5)?.content).toBe("d");
  });

  it("토글 해제 — 역연산으로 원위치 복원(byte-identical 핵심필드)", async () => {
    // 위 테스트가 ordinal 2 를 slack 으로 만들었으므로 해제하면 원본 배치로 복원.
    const res = await untoggleSlackCell(db3, owner3, sub, 2);
    expect(res.ok).toBe(true);
    const after = await listLessonPlan(db3, owner3, sub);
    expect(after.map((p) => p.ordinal)).toEqual([1, 2, 3, 4, 5]);
    expect(after.find((p) => p.ordinal === 1)?.content).toBe("a");
    expect(after.find((p) => p.ordinal === 2)?.content).toBe("b");
    expect(after.find((p) => p.ordinal === 3)?.content).toBe("c");
    expect(after.find((p) => p.ordinal === 4)?.content).toBe("d");
    expect(isSlackCell(after.find((p) => p.ordinal === 5)!)).toBe(true);
  });

  it("슬랙 한도 초과 — 마지막 칸에 내용 있으면 토글 거부(손실 방지)", async () => {
    // 5 차시를 내용으로 채워 끝 슬랙 제거 → 토글 거부되어야 함.
    await upsertLessonPlanEntry(db3, owner3, sub, 5, { content: "e" });
    const res = await toggleSlackCell(db3, owner3, sub, 2);
    expect(res.ok).toBe(false);
    // 데이터 불변(거부되어 시프트 미반영).
    const after = await listLessonPlan(db3, owner3, sub);
    expect(after.find((p) => p.ordinal === 5)?.content).toBe("e");
    expect(after.find((p) => p.ordinal === 2)?.content).toBe("b");
  });
});

/**
 * 수업계획실 수정 2026-07 ②③④ — 세부단원 자동 배치(applyUnitLayout) +
 * 시행 여부(jipil enabled)의 시험 마커 반영 실DB 통합.
 */
describe.skipIf(!RUN)("세부단원 자동 배치 + 시행 여부 반영", () => {
  let sql4: ReturnType<typeof postgres>;
  let db4: PostgresJsDatabase<typeof schema>;
  const owner4 = randomUUID();
  const Y = 2099;
  let sub: string;
  let uA: string, uB: string, uC: string;

  beforeAll(async () => {
    sql4 = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db4 = drizzle(sql4, { schema, casing: "snake_case" });

    const [s] = await db4
      .insert(subjects)
      .values({ ownerId: owner4, name: "화학", schoolYear: Y, semester: 1 })
      .returning({ id: subjects.id });
    sub = s.id;
    const [sec] = await db4
      .insert(courseSections)
      .values({ ownerId: owner4, subjectId: sub, label: "2-3" })
      .returning({ id: courseSections.id });
    // 월(1)·수(3) 슬롯 → 아래 수업일 6개 전부 카운트.
    await db4.insert(timetableSlots).values([
      { ownerId: owner4, sectionId: sec.id, weekday: 1, period: 1 },
      { ownerId: owner4, sectionId: sec.id, weekday: 3, period: 1 },
    ]);
    // 수업일: 03-02(월) 03-04(수) 03-09(월) 03-11(수) 03-16(월) 03-18(수) → N=6.
    await db4.insert(schoolDayCalendar).values(
      ["2099-03-02", "2099-03-04", "2099-03-09", "2099-03-11", "2099-03-16", "2099-03-18"].map(
        (date) => ({ ownerId: owner4, date, isSchoolDay: true }),
      ),
    );
    // 1차 시험 03-10 → 마커 = 03-11(ordinal 4). 1차 전 용량 = 3.
    await db4.insert(calendarEvents).values({
      ownerId: owner4,
      date: "2099-03-10",
      source: "manual",
      title: "1차 지필",
      eventKind: "exam",
      examSemester: 1,
      examOrdinal: 1,
    });
    // 단원 A(010101,최소2) B(010102,최소1) ≤ toCode 010102 → 1차 전. C(020101,최소2) → 1차 후.
    uA = (await upsertLessonUnit(db4, owner4, sub, {
      majorNo: 1, midNo: 1, minorNo: 1,
      majorName: "대1", midName: "중1", minorName: "소1", minOrdinals: 2,
    })).id;
    uB = (await upsertLessonUnit(db4, owner4, sub, {
      majorNo: 1, midNo: 1, minorNo: 2,
      majorName: "대1", midName: "중1", minorName: "소2", minOrdinals: 1,
    })).id;
    uC = (await upsertLessonUnit(db4, owner4, sub, {
      majorNo: 2, midNo: 1, minorNo: 1,
      majorName: "대2", midName: "중1", minorName: "소1", minOrdinals: 2,
    })).id;
  });

  afterAll(async () => {
    await db4.delete(lessonPlans).where(eq(lessonPlans.ownerId, owner4));
    await db4.delete(lessonUnits).where(eq(lessonUnits.ownerId, owner4));
    await db4.delete(calendarEvents).where(eq(calendarEvents.ownerId, owner4));
    await db4.delete(timetableSlots).where(eq(timetableSlots.ownerId, owner4));
    await db4.delete(schoolDayCalendar).where(eq(schoolDayCalendar.ownerId, owner4));
    await db4.delete(courseSections).where(eq(courseSections.ownerId, owner4));
    await db4.delete(subjects).where(eq(subjects.ownerId, owner4));
    await sql4.end();
  });

  it("③ 마커 산출(1차=ordinal 4) → 분할 배치 적용, 기존 내용 보존", async () => {
    const view = await getPlanView(db4, owner4, sub, Y, 1);
    expect(view.length).toBe(6);
    expect(view.ordinals.find((o) => o.examLabel === "1차")?.ordinal).toBe(4);

    // 기존 작성 내용(ordinal 2) + 스테일 unitId(ordinal 6) 준비.
    await upsertLessonPlanEntry(db4, owner4, sub, 2, { content: "기존내용", unitId: null });
    await upsertLessonPlanEntry(db4, owner4, sub, 6, { content: null, unitId: uA });

    const layout = layoutUnitsByExamTargets({
      units: [
        { id: uA, code: 10101, minOrdinals: 2 },
        { id: uB, code: 10102, minOrdinals: 1 },
        { id: uC, code: 20101, minOrdinals: 2 },
      ],
      totalOrdinals: 6,
      exam1MarkerOrdinal: 4,
      exam1ToCode: 10102,
    });
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;
    // A,A,B | (마커4부터) C,C | 6=빈
    expect(layout.unitIdByOrdinal).toEqual([uA, uA, uB, uC, uC, null]);

    await applyUnitLayout(db4, owner4, sub, layout.unitIdByOrdinal);
    const rows = await listLessonPlan(db4, owner4, sub);
    const byOrd = new Map(rows.map((r) => [r.ordinal, r]));
    expect(byOrd.get(1)?.unitId).toBe(uA);
    expect(byOrd.get(2)?.unitId).toBe(uA);
    expect(byOrd.get(2)?.content).toBe("기존내용"); // 내용 텍스트 보존(사용자 결정)
    expect(byOrd.get(3)?.unitId).toBe(uB);
    expect(byOrd.get(4)?.unitId).toBe(uC);
    expect(byOrd.get(5)?.unitId).toBe(uC);
    expect(byOrd.get(6)?.unitId ?? null).toBeNull(); // 스테일 unitId 해제
  });

  it("④ 중간지필 미시행이면 1차 마커가 사라진다(getPlanView 필터)", async () => {
    await db4
      .update(subjects)
      .set({ jipilMidEnabled: false })
      .where(eq(subjects.id, sub));
    const meta = await getSubjectPlanMeta(db4, owner4, sub);
    expect(meta).toMatchObject({ jipilMidEnabled: false, jipilFinalEnabled: true });
    const view = await getPlanView(db4, owner4, sub, Y, 1);
    expect(view.ordinals.every((o) => o.examLabel !== "1차")).toBe(true);
  });
});
