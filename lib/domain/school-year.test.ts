import { describe, it, expect } from "vitest";
import {
  activeSchoolYear,
  activeSemester,
  schoolYearRange,
  schoolYearRangeYmd,
  semesterRange,
  resolveSemesterBoundary,
  semesterRangeWithBoundary,
} from "./school-year";

describe("activeSchoolYear", () => {
  it("3/1 경계: 2월 말은 직전 학년도, 3/1은 새 학년도", () => {
    expect(activeSchoolYear(new Date("2026-02-28T00:00:00Z"))).toBe(2025);
    expect(activeSchoolYear(new Date("2026-03-01T00:00:00Z"))).toBe(2026);
  });

  it("2027-03-01 진입 시 2027학년도로 전환(AC-1.1)", () => {
    expect(activeSchoolYear(new Date("2027-02-28T23:59:59Z"))).toBe(2026);
    expect(activeSchoolYear(new Date("2027-03-01T00:00:00Z"))).toBe(2027);
  });

  it("학년도 중간(여름·겨울)은 시작 해를 유지", () => {
    expect(activeSchoolYear(new Date("2026-06-10T00:00:00Z"))).toBe(2026);
    expect(activeSchoolYear(new Date("2026-12-31T00:00:00Z"))).toBe(2026);
    expect(activeSchoolYear(new Date("2027-01-15T00:00:00Z"))).toBe(2026);
  });
});

describe("activeSemester", () => {
  it("학년도-aware 8/15 경계: 3~8/14=1학기, 8/15~12=2학기", () => {
    expect(activeSemester(new Date("2026-03-01T00:00:00Z"))).toBe(1);
    expect(activeSemester(new Date("2026-07-15T00:00:00Z"))).toBe(1);
    expect(activeSemester(new Date("2026-08-14T23:59:59Z"))).toBe(1);
    expect(activeSemester(new Date("2026-08-15T00:00:00Z"))).toBe(2);
    expect(activeSemester(new Date("2026-12-31T00:00:00Z"))).toBe(2);
  });

  it("1·2월은 직전 시작 학년도의 2학기(단일 달력 경계 오분류 방지)", () => {
    expect(activeSemester(new Date("2027-01-01T00:00:00Z"))).toBe(2);
    expect(activeSemester(new Date("2027-02-28T23:59:59Z"))).toBe(2);
  });
});

describe("schoolYearRange", () => {
  it("2026학년도 = 2026-03-01 ~ 2027-02-28", () => {
    expect(schoolYearRange(2026)).toEqual({
      start: "2026-03-01",
      end: "2027-02-28",
    });
  });

  it("종료 연도가 윤년이면 2-29까지", () => {
    // 2027학년도 종료 = 2028-02(윤년) → 2028-02-29
    expect(schoolYearRange(2027).end).toBe("2028-02-29");
  });

  it("ymd 형태 변환", () => {
    expect(schoolYearRangeYmd(2026)).toEqual({
      from: "20260301",
      to: "20270228",
    });
  });
});

describe("semesterRange", () => {
  it("1학기 = 3/1 ~ 8/14", () => {
    expect(semesterRange(2026, 1)).toEqual({
      start: "2026-03-01",
      end: "2026-08-14",
    });
  });

  it("2학기 = 8/15 ~ 익년 2월 말(2027 비윤년 → 2-28)", () => {
    expect(semesterRange(2026, 2)).toEqual({
      start: "2026-08-15",
      end: "2027-02-28",
    });
  });
});

describe("QC v3 여름방학 학기 경계", () => {
  const summerEvents = [
    { date: "2026-07-25", eventKind: "vacation" }, // 여름방학 시작
    { date: "2026-07-26", eventKind: "vacation" },
    { date: "2026-08-16", eventKind: "vacation" },
    { date: "2027-01-05", eventKind: "vacation" }, // 겨울방학(무시 대상)
    { date: "2026-05-05", eventKind: "holiday" }, // vacation 아님(무시)
  ];

  it("resolveSemesterBoundary — 여름(6~8월) vacation 최소일을 경계로", () => {
    expect(resolveSemesterBoundary(summerEvents, 2026)).toBe("2026-07-25");
  });

  it("resolveSemesterBoundary — 여름 vacation 없으면 8/15 fallback", () => {
    expect(
      resolveSemesterBoundary(
        [{ date: "2027-01-05", eventKind: "vacation" }],
        2026,
      ),
    ).toBe("2026-08-15");
    expect(resolveSemesterBoundary([], 2026)).toBe("2026-08-15");
  });

  it("semesterRangeWithBoundary — 경계 7/25 → 1학기 끝 7/24, 2학기 시작 7/25", () => {
    const b = resolveSemesterBoundary(summerEvents, 2026);
    expect(semesterRangeWithBoundary(2026, 1, b)).toEqual({
      start: "2026-03-01",
      end: "2026-07-24",
    });
    expect(semesterRangeWithBoundary(2026, 2, b)).toEqual({
      start: "2026-07-25",
      end: "2027-02-28",
    });
  });

  it("8월초 수업일은 2학기로(1학기 범위에서 제외) — 경계 7/25", () => {
    const b = "2026-07-25";
    const sem1 = semesterRangeWithBoundary(2026, 1, b);
    // 8월 3일(월) 수업일이 1학기 end(7/24) 보다 뒤 → 1학기 아님
    expect("2026-08-03" > sem1.end).toBe(true);
  });

  it("fallback 경계(8/15)는 기존 semesterRange 와 동치", () => {
    const b = "2026-08-15";
    expect(semesterRangeWithBoundary(2026, 1, b)).toEqual(semesterRange(2026, 1));
    expect(semesterRangeWithBoundary(2026, 2, b)).toEqual(semesterRange(2026, 2));
  });
});
