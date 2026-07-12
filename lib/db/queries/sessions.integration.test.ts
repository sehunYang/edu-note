import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "../schema";
import {
  subjects,
  courseSections,
  classSessions,
  timetableSlots,
} from "../schema/classes";
import { lessonPlans } from "../schema/records";
import { schoolDayCalendar } from "../schema/misc";
import {
  setSubjectExamBoundary,
  generatePlannedSessions,
  setSessionStatus,
  listSectionsWithProgress,
  getSectionSessions,
  listTodayLessons,
  setTodaySessionStatus,
} from "./sessions";
import { getPlanForSession } from "./progress";

/**
 * 시수(차시) 실DB 통합 테스트. 동적 미래 날짜로 시간에 안정적.
 * 월/수 시간표 분반 + 수업일 캘린더 + 시험경계 → 차시 생성/완료/잔여 검증.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;

const base = new Date();
const addDays = (n: number) => {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const todayStr = addDays(0);
const boundary = addDays(20);

let subjectId: string;
let sectionId: string;
const expectedTargets = new Set<string>();

describe.skipIf(!RUN)("시수 — 차시 생성/완료/잔여", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });

    [{ id: subjectId }] = await db
      .insert(subjects)
      .values({ ownerId: owner, schoolYear: YEAR, name: "물리" })
      .returning({ id: subjects.id });
    [{ id: sectionId }] = await db
      .insert(courseSections)
      .values({ ownerId: owner, subjectId, label: "2-7" })
      .returning({ id: courseSections.id });
    // 월(1)·수(3) 시간표
    await db.insert(timetableSlots).values([
      { ownerId: owner, sectionId, weekday: 1, period: 3, source: "comcigan" },
      { ownerId: owner, sectionId, weekday: 3, period: 3, source: "comcigan" },
    ]);
    // 수업일 캘린더: 향후 21일, 평일=수업일. 목표 = [오늘,경계] 의 월/수 수업일.
    const cal: { ownerId: string; date: string; isSchoolDay: boolean }[] = [];
    for (let i = 0; i <= 20; i++) {
      const date = addDays(i);
      const wd = new Date(date + "T00:00:00Z").getUTCDay();
      const isSchoolDay = wd >= 1 && wd <= 5;
      cal.push({ ownerId: owner, date, isSchoolDay });
      if (isSchoolDay && (wd === 1 || wd === 3)) expectedTargets.add(date);
    }
    await db.insert(schoolDayCalendar).values(cal);
  });

  afterAll(async () => {
    await db.delete(classSessions).where(eq(classSessions.ownerId, owner));
    await db.delete(timetableSlots).where(eq(timetableSlots.ownerId, owner));
    await db.delete(courseSections).where(eq(courseSections.ownerId, owner));
    await db.delete(subjects).where(eq(subjects.ownerId, owner));
    await db.delete(schoolDayCalendar).where(eq(schoolDayCalendar.ownerId, owner));
    await sql.end();
  });

  it("경계 미설정이면 차시 생성 거부", async () => {
    await expect(generatePlannedSessions(db, owner, sectionId)).rejects.toThrow(
      /경계/,
    );
  });

  it("경계 설정 후 월/수 수업일에 planned 차시 생성", async () => {
    await setSubjectExamBoundary(db, owner, subjectId, boundary);
    const res = await generatePlannedSessions(db, owner, sectionId);
    expect(res.boundary).toBe(boundary);
    expect(res.generated).toBe(expectedTargets.size);
    expect(res.total).toBe(expectedTargets.size);

    const prog = (await listSectionsWithProgress(db, owner, YEAR)).find(
      (s) => s.sectionId === sectionId,
    )!;
    expect(prog.plannedUpToBoundary).toBe(expectedTargets.size); // 잔여 = 미진행 planned
    expect(prog.done).toBe(0);
  });

  it("차시 완료 표시하면 잔여(planned)가 줄어든다", async () => {
    const sessions = await getSectionSessions(db, owner, sectionId);
    await setSessionStatus(db, owner, sessions[0].id, "done");

    const prog = (await listSectionsWithProgress(db, owner, YEAR)).find(
      (s) => s.sectionId === sectionId,
    )!;
    expect(prog.done).toBe(1);
    expect(prog.plannedUpToBoundary).toBe(expectedTargets.size - 1);
  });

  it("재생성은 멱등 — done 차시 보존, 중복 생성 없음", async () => {
    const res = await generatePlannedSessions(db, owner, sectionId);
    expect(res.generated).toBe(0); // 이미 다 존재

    const sessions = await getSectionSessions(db, owner, sectionId);
    expect(sessions).toHaveLength(expectedTargets.size); // 중복 없음
    expect(sessions.filter((s) => s.status === "done")).toHaveLength(1); // 보존
  });
});

describe.skipIf(!RUN)("오늘 수업 카드 — listTodayLessons/setTodaySessionStatus (QC v7 comp1)", () => {
  let sql2: ReturnType<typeof postgres>;
  let db2: PostgresJsDatabase<typeof schema>;
  const owner2 = randomUUID();
  let subjectId2: string;
  let sectionId2: string;
  const todayWeekday = (() => {
    const d = new Date(todayStr + "T00:00:00Z").getUTCDay(); // 0=일..6=토
    return d === 0 ? 7 : d; // kstToday() 규약: 1=월..7=일
  })();

  beforeAll(async () => {
    sql2 = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db2 = drizzle(sql2, { schema, casing: "snake_case" });

    [{ id: subjectId2 }] = await db2
      .insert(subjects)
      .values({ ownerId: owner2, schoolYear: YEAR, semester: 1, name: "수학" })
      .returning({ id: subjects.id });
    [{ id: sectionId2 }] = await db2
      .insert(courseSections)
      .values({ ownerId: owner2, subjectId: subjectId2, label: "3-1" })
      .returning({ id: courseSections.id });
    await db2.insert(timetableSlots).values({
      ownerId: owner2,
      sectionId: sectionId2,
      weekday: todayWeekday,
      period: 2,
      source: "comcigan",
    });
    // 오늘 이전 차시 2개(과거, done) + 오늘 차시 1개(planned) → 오늘 행의 날짜순위 k=3.
    await db2.insert(classSessions).values([
      { ownerId: owner2, sectionId: sectionId2, date: addDays(-14), status: "done" },
      { ownerId: owner2, sectionId: sectionId2, date: addDays(-7), status: "done" },
      { ownerId: owner2, sectionId: sectionId2, date: todayStr, status: "planned" },
    ]);
    // getPlanForSession 이 null 이 아니라 실제 ordinal 을 반환하도록 계획 셀도 채운다.
    await db2.insert(lessonPlans).values({
      ownerId: owner2,
      subjectId: subjectId2,
      ordinal: 3,
      content: "테스트 차시 내용",
    });
  });

  afterAll(async () => {
    await db2.delete(lessonPlans).where(eq(lessonPlans.ownerId, owner2));
    await db2.delete(classSessions).where(eq(classSessions.ownerId, owner2));
    await db2.delete(timetableSlots).where(eq(timetableSlots.ownerId, owner2));
    await db2.delete(courseSections).where(eq(courseSections.ownerId, owner2));
    await db2.delete(subjects).where(eq(subjects.ownerId, owner2));
    await sql2.end();
  });

  it("listTodayLessons 의 ordinal == getPlanForSession 의 k (패리티, Architect 필수#2)", async () => {
    const lessons = await listTodayLessons(db2, owner2, todayStr, todayWeekday, YEAR, 1);
    const lesson = lessons.find((l) => l.sectionId === sectionId2);
    expect(lesson).toBeDefined();
    expect(lesson!.ordinal).toBe(3);
    expect(lesson!.content).toBe("테스트 차시 내용");
    expect(lesson!.done).toBe(false);

    const [todaySession] = await db2
      .select({ id: classSessions.id })
      .from(classSessions)
      .where(
        and(eq(classSessions.sectionId, sectionId2), eq(classSessions.date, todayStr)),
      );
    const plan = await getPlanForSession(db2, owner2, todaySession.id);
    expect(plan).not.toBeNull();
    expect(plan!.ordinal).toBe(lesson!.ordinal);
  });

  it("setTodaySessionStatus 체크/해제 — class_sessions.status 왕복(AC-1.2/1.3)", async () => {
    await setTodaySessionStatus(db2, owner2, sectionId2, todayStr, "done");
    let lessons = await listTodayLessons(db2, owner2, todayStr, todayWeekday, YEAR, 1);
    expect(lessons.find((l) => l.sectionId === sectionId2)!.done).toBe(true);

    await setTodaySessionStatus(db2, owner2, sectionId2, todayStr, "planned");
    lessons = await listTodayLessons(db2, owner2, todayStr, todayWeekday, YEAR, 1);
    expect(lessons.find((l) => l.sectionId === sectionId2)!.done).toBe(false);
  });

  it("setTodaySessionStatus 는 타 소유자 sectionId 를 거부한다(IDOR 가드, Architect 필수#1)", async () => {
    const otherOwner = randomUUID();
    await expect(
      setTodaySessionStatus(db2, otherOwner, sectionId2, todayStr, "done"),
    ).rejects.toThrow(/분반/);

    const [row] = await db2
      .select({ status: classSessions.status })
      .from(classSessions)
      .where(
        and(eq(classSessions.sectionId, sectionId2), eq(classSessions.date, todayStr)),
      );
    expect(row.status).toBe("planned"); // 이전 테스트에서 planned 로 복구된 상태 유지 — 변조 없음
  });
});
