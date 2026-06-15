import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq, gte, lte, sql as dsql } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import {
  attendanceRecords,
  fieldTripReports,
  reportTracking,
} from "../schema/attendance";
import { schoolDayCalendar } from "../schema/misc";
import {
  upsertAttendance,
  setReportSubmitted,
  listAttendanceByDate,
  addFieldTrip,
  addAbsenceRange,
  updateAttendanceRecord,
} from "./attendance";
import { submissionTier } from "@/lib/domain/attendance";

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
    await db.delete(fieldTripReports).where(eq(fieldTripReports.ownerId, owner));
    await db.delete(attendanceRecords).where(eq(attendanceRecords.ownerId, owner));
    await db.delete(schoolDayCalendar).where(eq(schoolDayCalendar.ownerId, owner));
    await db.delete(studentYears).where(eq(studentYears.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner));
    await sql.end();
  });

  it("질병결석은 신고서 필요 + tracking 생성 (AC-4.1)", async () => {
    const r = await upsertAttendance(db, owner, {
      studentYearId: s1,
      date: "2099-03-02",
      reason: "illness",
      kind: "absent",
    });
    expect(r.reportRequired).toBe(true);
    expect(await trackingCount(r.id)).toBe(1);
  });

  it("미인정 결석은 신고서 불필요 + tracking 없음 (AC-4.1 반전)", async () => {
    const r = await upsertAttendance(db, owner, {
      studentYearId: s1,
      date: "2099-03-10",
      reason: "unaccepted",
      kind: "absent",
    });
    expect(r.reportRequired).toBe(false);
    expect(await trackingCount(r.id)).toBe(0);
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

  it("인정 사유 조퇴는 신고서 불필요 (AC-4.1 반전)", async () => {
    const r = await upsertAttendance(db, owner, {
      studentYearId: s1,
      date: "2099-03-04",
      reason: "accepted",
      kind: "early_leave",
    });
    expect(r.reportRequired).toBe(false);
    expect(await trackingCount(r.id)).toBe(0);
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
    // 질병결석 → 필요·tracking 생성.
    const r = await upsertAttendance(db, owner, {
      studentYearId: s1,
      date: "2099-03-11",
      reason: "illness",
      kind: "absent",
    });
    expect(r.reportRequired).toBe(true);
    expect(await trackingCount(r.id)).toBe(1);

    // 같은 행을 미인정 결석으로 → 불필요, tracking 제거.
    const r2 = await upsertAttendance(db, owner, {
      studentYearId: s1,
      date: "2099-03-11",
      reason: "unaccepted",
      kind: "absent",
    });
    expect(r2.id).toBe(r.id); // 같은 행 갱신
    expect(r2.reportRequired).toBe(false);
    expect(await trackingCount(r.id)).toBe(0);
  });

  it("updateAttendanceRecord 가 reportRequired 재계산 (AC-4.5)", async () => {
    // 미인정 결석(불필요)으로 시작.
    const r = await upsertAttendance(db, owner, {
      studentYearId: s1,
      date: "2099-03-12",
      reason: "unaccepted",
      kind: "absent",
    });
    expect(r.reportRequired).toBe(false);
    expect(await trackingCount(r.id)).toBe(0);

    // 질병결석으로 수정 → 필요·tracking 생성.
    const u = await updateAttendanceRecord(db, owner, r.id, {
      reason: "illness",
      kind: "absent",
    });
    expect(u?.reportRequired).toBe(true);
    expect(await trackingCount(r.id)).toBe(1);

    // 다시 기타 지각으로 수정 → 불필요·tracking 제거.
    const u2 = await updateAttendanceRecord(db, owner, r.id, {
      reason: "etc",
      kind: "late",
    });
    expect(u2?.reportRequired).toBe(false);
    expect(await trackingCount(r.id)).toBe(0);
  });

  it("제출 마킹 + 날짜별 조회", async () => {
    const list = await listAttendanceByDate(db, owner, "2099-03-02");
    expect(list).toHaveLength(1);
    await setReportSubmitted(db, owner, list[0].id, true);
    const after = await listAttendanceByDate(db, owner, "2099-03-02");
    expect(after[0].reportSubmitted).toBe(true);
  });

  it("지각 교시: 조회(0)부터 기점까지 영속+조회", async () => {
    const r = await upsertAttendance(db, owner, {
      studentYearId: s1,
      date: "2099-03-06",
      reason: "etc",
      kind: "late",
      pivotPeriod: 2,
    });
    expect(r.periods).toEqual([0, 1, 2]);
    const list = await listAttendanceByDate(db, owner, "2099-03-06");
    expect(list[0].periods).toEqual([0, 1, 2]);
  });

  it("결과 교시: 다중·비연속 선택 그대로 영속+조회", async () => {
    const r = await upsertAttendance(db, owner, {
      studentYearId: s1,
      date: "2099-03-07",
      reason: "illness",
      kind: "absent_period",
      selectedPeriods: [2, 5, 7],
    });
    expect(r.periods).toEqual([2, 5, 7]);
    const list = await listAttendanceByDate(db, owner, "2099-03-07");
    expect(list[0].periods).toEqual([2, 5, 7]);
  });

  it("submissionTier 경계값(남은 수업일 기준)", () => {
    expect(submissionTier(3)).toBe("normal");
    expect(submissionTier(2)).toBe("warning");
    expect(submissionTier(0)).toBe("warning");
    expect(submissionTier(-1)).toBe("critical");
  });

  it("addFieldTrip 기간은 수업일에만 인정결석 자동 생성 (AC-4.2)", async () => {
    // 수업일 캘린더: 06-08~06-12 평일=수업일, 06-10(수)=휴일(공백).
    await db.insert(schoolDayCalendar).values([
      { ownerId: owner, date: "2099-06-08", isSchoolDay: true },
      { ownerId: owner, date: "2099-06-09", isSchoolDay: true },
      { ownerId: owner, date: "2099-06-10", isSchoolDay: false }, // 휴일 제외
      { ownerId: owner, date: "2099-06-11", isSchoolDay: true },
      { ownerId: owner, date: "2099-06-12", isSchoolDay: true },
    ]);

    const res = await addFieldTrip(db, owner, s1, "2099-06-08", "2099-06-12");
    // 5일 중 휴일 1일 제외 = 4건.
    expect(res.createdRecords).toBe(4);

    const created = await db
      .select({
        date: attendanceRecords.date,
        reason: attendanceRecords.reason,
        kind: attendanceRecords.kind,
        reportRequired: attendanceRecords.reportRequired,
      })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.ownerId, owner),
          eq(attendanceRecords.studentYearId, s1),
          gte(attendanceRecords.date, "2099-06-08"),
          lte(attendanceRecords.date, "2099-06-12"),
        ),
      );
    expect(created).toHaveLength(4);
    // 휴일은 미포함.
    expect(created.find((c) => c.date === "2099-06-10")).toBeUndefined();
    // 인정결석 + 신고서 불필요(사후보고서가 보고).
    for (const c of created) {
      expect(c.reason).toBe("accepted");
      expect(c.kind).toBe("absent");
      expect(c.reportRequired).toBe(false);
    }
  });

  it("addFieldTrip 단일 날짜(종료 생략)는 당일만 (AC-4.2)", async () => {
    await db.insert(schoolDayCalendar).values([
      { ownerId: owner, date: "2099-06-15", isSchoolDay: true },
    ]);
    const res = await addFieldTrip(db, owner, s1, "2099-06-15");
    expect(res.createdRecords).toBe(1);
    const [trip] = await db
      .select({
        startDate: fieldTripReports.startDate,
        endDate: fieldTripReports.endDate,
        tripDate: fieldTripReports.tripDate,
      })
      .from(fieldTripReports)
      .where(eq(fieldTripReports.id, res.id));
    expect(trip.startDate).toBe("2099-06-15");
    expect(trip.endDate).toBe("2099-06-15"); // 당일=start=end
    expect(trip.tripDate).toBe("2099-06-15"); // 미러
  });

  it("addAbsenceRange 는 수업일만 결석 생성 (AC-4.4)", async () => {
    await db.insert(schoolDayCalendar).values([
      { ownerId: owner, date: "2099-06-22", isSchoolDay: true },
      { ownerId: owner, date: "2099-06-23", isSchoolDay: false }, // 제외
      { ownerId: owner, date: "2099-06-24", isSchoolDay: true },
    ]);
    const res = await addAbsenceRange(
      db,
      owner,
      s1,
      "2099-06-22",
      "2099-06-24",
      "illness",
    );
    expect(res.createdRecords).toBe(2); // 휴일 1일 제외

    const created = await db
      .select({
        date: attendanceRecords.date,
        reportRequired: attendanceRecords.reportRequired,
      })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.ownerId, owner),
          eq(attendanceRecords.studentYearId, s1),
          gte(attendanceRecords.date, "2099-06-22"),
          lte(attendanceRecords.date, "2099-06-24"),
        ),
      );
    expect(created).toHaveLength(2);
    // 질병결석 → 신고서 필요.
    for (const c of created) expect(c.reportRequired).toBe(true);
  });

  it("addAbsenceRange 는 멱등(수동 입력 보존) (AC-4.4)", async () => {
    // 같은 범위 재실행 시 onConflictDoNothing → 0건 추가.
    const res = await addAbsenceRange(
      db,
      owner,
      s1,
      "2099-06-22",
      "2099-06-24",
      "illness",
    );
    expect(res.createdRecords).toBe(0);
  });

  it("report_required 백필 로직: 신규 규칙으로 일괄 재계산 (AC-4.1)", async () => {
    // 옛 규칙으로 잘못 표시된 행을 모사: report_required 를 강제로 틀어 놓는다.
    await db
      .insert(attendanceRecords)
      .values([
        // 미인정 결석(신규=불필요)인데 true 로 잘못 세팅.
        {
          ownerId: owner,
          studentYearId: s1,
          date: "2099-07-01",
          reason: "unaccepted",
          kind: "absent",
          reportRequired: true,
        },
        // 질병결석(신규=필요)인데 false 로 잘못 세팅.
        {
          ownerId: owner,
          studentYearId: s1,
          date: "2099-07-02",
          reason: "illness",
          kind: "absent",
          reportRequired: false,
        },
      ]);

    // 0032 백필 UPDATE 와 동치 로직 적용.
    await db.execute(
      dsql`update attendance_records set report_required =
        (reason = 'illness' and kind = 'absent')
        or (note_field is not null and note_field ilike '%생리통%')
      where owner_id = ${owner}`,
    );

    const rows = await db
      .select({
        date: attendanceRecords.date,
        reportRequired: attendanceRecords.reportRequired,
      })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.ownerId, owner),
          gte(attendanceRecords.date, "2099-07-01"),
          lte(attendanceRecords.date, "2099-07-02"),
        ),
      );
    const byDate = Object.fromEntries(rows.map((r) => [r.date, r.reportRequired]));
    expect(byDate["2099-07-01"]).toBe(false); // 미인정 결석 → 불필요
    expect(byDate["2099-07-02"]).toBe(true); // 질병결석 → 필요
  });
});
