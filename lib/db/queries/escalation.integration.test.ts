import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import {
  fieldTripReports,
  reportTracking,
  attendanceRecords,
} from "../schema/attendance";
import { schoolDayCalendar, auditLog } from "../schema/misc";
import {
  addFieldTripReport,
  setFieldTripSubmitted,
  recomputeEscalation,
  listFieldTrips,
} from "./escalation";

/**
 * 에스컬레이션 실DB 통합. 교외체험 사후보고서가 출결과 동일한 수업일 5일·3/5 티어로
 * 재계산되고 티어 전이가 audit_log 에 남는지 검증(동적 과거 날짜로 시간안정).
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;
let s1: string;
let tripId: string;

const base = new Date();
const addDays = (n: number) => {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe.skipIf(!RUN)("에스컬레이션 — 교외체험 사후보고서 티어 재계산", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
    const [p] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: "정체험" })
      .returning({ id: persons.id });
    [{ id: s1 }] = await db
      .insert(studentYears)
      .values({
        ownerId: owner,
        personId: p.id,
        schoolYear: YEAR,
        sid: "20705",
        grade: 2,
        classNo: 7,
        number: 5,
        name: "정체험",
      })
      .returning({ id: studentYears.id });

    // 최근 40일 + 향후 30일 수업일 캘린더(평일=수업일).
    // 향후 분까지 필요한 이유: 교외체험 마감=종료일 이후 10번째 수업일(미래일 수 있음).
    const cal: { ownerId: string; date: string; isSchoolDay: boolean }[] = [];
    for (let i = -40; i <= 30; i++) {
      const date = addDays(i);
      const wd = new Date(date + "T00:00:00Z").getUTCDay();
      cal.push({ ownerId: owner, date, isSchoolDay: wd >= 1 && wd <= 5 });
    }
    await db.insert(schoolDayCalendar).values(cal);

    // 30일 전 체험 → 경과 수업일 > 5 → critical 예상.
    const { id } = await addFieldTripReport(db, owner, {
      studentYearId: s1,
      tripDate: addDays(-30),
    });
    tripId = id;
  });

  afterAll(async () => {
    await db.delete(auditLog).where(eq(auditLog.ownerId, owner));
    await db.delete(reportTracking).where(eq(reportTracking.ownerId, owner));
    await db.delete(fieldTripReports).where(eq(fieldTripReports.ownerId, owner));
    await db.delete(attendanceRecords).where(eq(attendanceRecords.ownerId, owner));
    await db.delete(schoolDayCalendar).where(eq(schoolDayCalendar.ownerId, owner));
    await db.delete(studentYears).where(eq(studentYears.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner));
    await sql.end();
  });

  it("미제출·오래된 체험은 재계산 시 심각(critical) + 전이 감사", async () => {
    const res = await recomputeEscalation(db, owner);
    expect(res.recomputed).toBeGreaterThanOrEqual(1);
    expect(res.transitions).toBeGreaterThanOrEqual(1); // normal→critical 전이

    const trips = await listFieldTrips(db, owner);
    expect(trips[0].tier).toBe("critical");
    expect(trips[0].deadlineDate).not.toBeNull(); // 10번째 수업일 마감(교외체험)

    const transitions = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.ownerId, owner),
          eq(auditLog.eventType, "escalation_transition"),
        ),
      );
    expect(transitions.length).toBeGreaterThanOrEqual(1);
  });

  it("제출 처리 후 재계산하면 정상(normal)으로 정리", async () => {
    await setFieldTripSubmitted(db, owner, tripId, true);
    await recomputeEscalation(db, owner);
    const trips = await listFieldTrips(db, owner);
    expect(trips[0].tier).toBe("normal");
  });

  it("기간 체험 마감은 종료일(end_date) 기준으로 계산 (AC-4.2)", async () => {
    // 시작 -10일 ~ 종료 -8일(기간). 마감 = 종료일 이후 5번째 수업일.
    const { id } = await addFieldTripReport(db, owner, {
      studentYearId: s1,
      tripDate: addDays(-10),
      endDate: addDays(-8),
    });
    await recomputeEscalation(db, owner);

    const trips = await listFieldTrips(db, owner);
    const t = trips.find((x) => x.id === id);
    expect(t).toBeDefined();
    expect(t!.endDate).toBe(addDays(-8));
    // 마감은 종료일(-8) 이후의 날짜여야 한다(시작일 -10 기준이 아님).
    expect(t!.deadlineDate).not.toBeNull();
    expect(t!.deadlineDate! > addDays(-8)).toBe(true);
  });
});
