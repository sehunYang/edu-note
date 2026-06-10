import { describe, it, expect } from "vitest";
import {
  activeSchoolYear,
  schoolYearRange,
  schoolYearRangeYmd,
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
