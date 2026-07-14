import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq, gte, lte, sql as dsql } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import { homeroomClasses, homeroomMembers } from "../schema/classes";
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
  listUnsubmittedAttendance,
  isOwnerHomeroomStudent,
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
    await db.delete(homeroomMembers).where(eq(homeroomMembers.ownerId, owner));
    await db.delete(homeroomClasses).where(eq(homeroomClasses.ownerId, owner));
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

  // C4 미제출 통합(JS 머지) — attendance·fieldTrip 두 소스 머지 + reportTrackingId dedupe.
  describe("미제출 통합 — attendance·fieldTrip JS 머지 (AC-4.4)", () => {
    const HR_YEAR = 2098;
    let hStudent: string; // 담임반 학생
    let outsider: string; // 담임반 아님(필터로 제외되어야 함)

    beforeAll(async () => {
      // 담임 학급 + 멤버 1명(필터 통과), 외부 학생 1명(필터 제외).
      const [hr] = await db
        .insert(homeroomClasses)
        .values({ ownerId: owner, schoolYear: HR_YEAR, grade: 1, classNo: 1 })
        .returning({ id: homeroomClasses.id });

      const [p] = await db
        .insert(persons)
        .values({ ownerId: owner, displayName: "머지학생" })
        .returning({ id: persons.id });
      [{ id: hStudent }] = await db
        .insert(studentYears)
        .values({
          ownerId: owner,
          personId: p.id,
          schoolYear: HR_YEAR,
          sid: "10101",
          grade: 1,
          classNo: 1,
          number: 1,
          name: "머지학생",
        })
        .returning({ id: studentYears.id });
      [{ id: outsider }] = await db
        .insert(studentYears)
        .values({
          ownerId: owner,
          personId: p.id,
          schoolYear: HR_YEAR,
          sid: "10199",
          grade: 1,
          classNo: 1,
          number: 99,
          name: "외부학생",
        })
        .returning({ id: studentYears.id });
      await db
        .insert(homeroomMembers)
        .values({ ownerId: owner, homeroomId: hr.id, studentYearId: hStudent });

      // 수업일 캘린더(다일 체험 범위 포함).
      await db.insert(schoolDayCalendar).values([
        { ownerId: owner, date: "2098-05-04", isSchoolDay: true },
        { ownerId: owner, date: "2098-05-05", isSchoolDay: true },
        { ownerId: owner, date: "2098-05-06", isSchoolDay: true },
      ]);
    });

    it("다일 체험 미제출이 1행으로만 노출(date 중복 폭발 없음) + 담임 외 제외", async () => {
      // 담임 학생: 3일짜리 체험(미제출). 인정결석 3건이 생기지만 미제출 목록엔 체험 1행만.
      await addFieldTrip(db, owner, hStudent, "2098-05-04", "2098-05-06");
      // 외부 학생: 체험 미제출이지만 담임 필터로 제외되어야 함.
      await addFieldTrip(db, owner, outsider, "2098-05-04", "2098-05-06");

      const rows = await listUnsubmittedAttendance(db, owner, HR_YEAR);
      const tripRows = rows.filter((r) => r.source === "fieldTrip");
      // 담임 학생 체험 1행만(다일이 date별로 폭발하지 않음), 외부 학생 제외.
      expect(tripRows).toHaveLength(1);
      expect(tripRows[0].studentYearId).toBe(hStudent);
      expect(tripRows[0].date).toBe("2098-05-04"); // 시작일 대표
      // 인정결석(report_required=false)은 attendance 소스에 안 잡힘.
      const attForHStudent = rows.filter(
        (r) => r.source === "attendance" && r.studentYearId === hStudent,
      );
      expect(attForHStudent).toHaveLength(0);
    });

    it("attendance 미제출도 같은 목록에 머지 + (date,sid) 정렬", async () => {
      // 담임 학생에게 질병결석(신고서 필요·미제출) 추가.
      await upsertAttendance(db, owner, {
        studentYearId: hStudent,
        date: "2098-05-05",
        reason: "illness",
        kind: "absent",
      });
      const rows = await listUnsubmittedAttendance(db, owner, HR_YEAR);
      const mine = rows.filter((r) => r.studentYearId === hStudent);
      // 체험 1행 + 출결 1행 = 2행.
      expect(mine).toHaveLength(2);
      expect(mine.some((r) => r.source === "fieldTrip")).toBe(true);
      expect(mine.some((r) => r.source === "attendance")).toBe(true);
      // 날짜 오름차순 정렬.
      const dates = mine.map((r) => r.date);
      expect([...dates].sort()).toEqual(dates);
    });

    it("isOwnerHomeroomStudent 는 담임반 멤버만 true(서버 가드 substance, AC-9)", async () => {
      // 서버액션 담임반 가드 술어. 담임 멤버=true, 외부(비멤버)=false, 미존재 UUID=false.
      expect(await isOwnerHomeroomStudent(db, owner, hStudent)).toBe(true);
      expect(await isOwnerHomeroomStudent(db, owner, outsider)).toBe(false);
      expect(await isOwnerHomeroomStudent(db, owner, randomUUID())).toBe(false);
    });

    it("교차 owner 쓰기는 쿼리 계층 자체가 차단(심층 방어)", async () => {
      // 타 owner 가 남의 studentYearId 로 쓰기 시도 → 세 진입점 모두 throw.
      const stranger = randomUUID();
      await expect(
        upsertAttendance(db, stranger, {
          studentYearId: hStudent,
          date: "2098-05-07",
          reason: "etc",
          kind: "late",
        }),
      ).rejects.toThrow("학생을 찾을 수 없습니다.");
      await expect(
        addAbsenceRange(db, stranger, hStudent, "2098-05-04", "2098-05-05", "illness"),
      ).rejects.toThrow("학생을 찾을 수 없습니다.");
      await expect(
        addFieldTrip(db, stranger, hStudent, "2098-05-04"),
      ).rejects.toThrow("학생을 찾을 수 없습니다.");
    });

    it("slicePage 는 머지된 전체 목록 기준 1회만 적용", async () => {
      const all = await listUnsubmittedAttendance(db, owner, HR_YEAR);
      const total = all.length;
      expect(total).toBeGreaterThanOrEqual(2);
      const firstPage = await listUnsubmittedAttendance(db, owner, HR_YEAR, new Date(), {
        limit: 1,
        offset: 0,
      });
      const secondPage = await listUnsubmittedAttendance(
        db,
        owner,
        HR_YEAR,
        new Date(),
        { limit: 1, offset: 1 },
      );
      expect(firstPage).toHaveLength(1);
      expect(secondPage).toHaveLength(1);
      // 페이지 경계가 머지 전체 기준 — 두 페이지 id 가 서로 다름.
      expect(firstPage[0].id).not.toBe(secondPage[0].id);
      // 두 페이지를 합치면 전체 목록의 앞 2건과 일치(소스별 slice 가 아님).
      expect([firstPage[0].id, secondPage[0].id]).toEqual([all[0].id, all[1].id]);
    });
  });
});
