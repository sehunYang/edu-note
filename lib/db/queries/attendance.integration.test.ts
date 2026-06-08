import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import { attendanceRecords, reportTracking } from "../schema/attendance";
import {
  upsertAttendance,
  setReportSubmitted,
  listAttendanceByDate,
} from "./attendance";

/**
 * 출결 실DB 통합. reportRequired 파생 + report_tracking 생성/정리 검증.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;
let s1: string;

async function trackingCount(attendanceRecordId: string): Promise<number> {
  const rows = await db
    .select({ id: reportTracking.id })
    .from(reportTracking)
    .where(eq(reportTracking.attendanceRecordId, attendanceRecordId));
  return rows.length;
}

describe.skipIf(!RUN)("출결 — reportRequired + report_tracking", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
    const [p] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: "최출결" })
      .returning({ id: persons.id });
    [{ id: s1 }] = await db
      .insert(studentYears)
      .values({
        ownerId: owner,
        personId: p.id,
        schoolYear: YEAR,
        sid: "20704",
        grade: 2,
        classNo: 7,
        number: 4,
        name: "최출결",
      })
      .returning({ id: studentYears.id });
  });

  afterAll(async () => {
    await db.delete(reportTracking).where(eq(reportTracking.ownerId, owner));
    await db.delete(attendanceRecords).where(eq(attendanceRecords.ownerId, owner));
    await db.delete(studentYears).where(eq(studentYears.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner));
    await sql.end();
  });

  it("결석은 항상 신고서 필요 + tracking 생성", async () => {
    const r = await upsertAttendance(db, owner, {
      studentYearId: s1,
      date: "2099-03-02",
      reason: "etc",
      kind: "absent",
    });
    expect(r.reportRequired).toBe(true);
    expect(await trackingCount(r.id)).toBe(1);
  });

  it("기타 사유 지각은 신고서 불필요 + tracking 없음", async () => {
    const r = await upsertAttendance(db, owner, {
      studentYearId: s1,
      date: "2099-03-03",
      reason: "etc",
      kind: "late",
    });
    expect(r.reportRequired).toBe(false);
    expect(await trackingCount(r.id)).toBe(0);
  });

  it("인정 사유 조퇴는 신고서 필요", async () => {
    const r = await upsertAttendance(db, owner, {
      studentYearId: s1,
      date: "2099-03-04",
      reason: "accepted",
      kind: "early_leave",
    });
    expect(r.reportRequired).toBe(true);
    expect(await trackingCount(r.id)).toBe(1);
  });

  it("비고 '생리통' 결과는 신고서 필요", async () => {
    const r = await upsertAttendance(db, owner, {
      studentYearId: s1,
      date: "2099-03-05",
      reason: "illness",
      kind: "absent_period",
      noteField: "생리통으로 1교시 결과",
    });
    expect(r.reportRequired).toBe(true);
    expect(await trackingCount(r.id)).toBe(1);
  });

  it("upsert 로 사유 변경 시 reportRequired·tracking 재동기화", async () => {
    // 같은 학생·날짜·성격(지각)을 인정으로 변경 → 필요로 전환, tracking 생성
    const r = await upsertAttendance(db, owner, {
      studentYearId: s1,
      date: "2099-03-03",
      reason: "accepted",
      kind: "late",
    });
    expect(r.reportRequired).toBe(true);
    expect(await trackingCount(r.id)).toBe(1);

    // 다시 기타로 → 불필요, tracking 제거
    const r2 = await upsertAttendance(db, owner, {
      studentYearId: s1,
      date: "2099-03-03",
      reason: "etc",
      kind: "late",
    });
    expect(r2.id).toBe(r.id); // 같은 행 갱신
    expect(r2.reportRequired).toBe(false);
    expect(await trackingCount(r.id)).toBe(0);
  });

  it("제출 마킹 + 날짜별 조회", async () => {
    const list = await listAttendanceByDate(db, owner, "2099-03-02");
    expect(list).toHaveLength(1);
    await setReportSubmitted(db, owner, list[0].id, true);
    const after = await listAttendanceByDate(db, owner, "2099-03-02");
    expect(after[0].reportSubmitted).toBe(true);
  });
});
