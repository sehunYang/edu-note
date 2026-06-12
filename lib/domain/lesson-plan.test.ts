import { describe, it, expect } from "vitest";
import { computePlanLength, weekdayOf } from "./lesson-plan";

/**
 * 수업 계획실 도메인 단위 테스트. 차시 N 산출(슬롯 요일 ∩ 수업일).
 */
describe("lesson-plan 도메인", () => {
  it("weekdayOf — UTC getUTCDay 규약(0=일..6=토)", () => {
    expect(weekdayOf("2026-03-02")).toBe(1); // 월
    expect(weekdayOf("2026-03-04")).toBe(3); // 수
    expect(weekdayOf("2026-03-08")).toBe(0); // 일
  });

  it("computePlanLength — 월 3 + 수 2, 슬롯 {1}(월) → 3", () => {
    const schoolDays = [
      { date: "2026-03-02" }, // 월
      { date: "2026-03-04" }, // 수
      { date: "2026-03-09" }, // 월
      { date: "2026-03-11" }, // 수
      { date: "2026-03-16" }, // 월
    ];
    expect(computePlanLength(schoolDays, new Set([1]))).toBe(3);
  });

  it("computePlanLength — 슬롯 {1,3}(월·수) → 5", () => {
    const schoolDays = [
      { date: "2026-03-02" }, // 월
      { date: "2026-03-04" }, // 수
      { date: "2026-03-09" }, // 월
      { date: "2026-03-11" }, // 수
      { date: "2026-03-16" }, // 월
    ];
    expect(computePlanLength(schoolDays, new Set([1, 3]))).toBe(5);
  });

  it("computePlanLength — 빈 슬롯 → 0", () => {
    expect(computePlanLength([{ date: "2026-03-02" }], new Set())).toBe(0);
  });

  it("computePlanLength — 매칭 없음 → 0", () => {
    const schoolDays = [{ date: "2026-03-02" }]; // 월
    expect(computePlanLength(schoolDays, new Set([5]))).toBe(0); // 금만
  });
});
