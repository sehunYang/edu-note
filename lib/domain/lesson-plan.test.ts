import { describe, it, expect } from "vitest";
import {
  computePlanLength,
  weekdayOf,
  pickRepresentativeSection,
  representativeDates,
  monthWeekLabel,
} from "./lesson-plan";

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

describe("QC v3 차시 대표분반", () => {
  it("pickRepresentativeSection — 주당 슬롯 최대 분반의 요일 집합", () => {
    // 분반A: 월·수(2슬롯), 분반B: 월·수·금(3슬롯=시수 최대) → B 선정
    const rep = pickRepresentativeSection([
      { sectionId: "A", weekdays: [1, 3] },
      { sectionId: "B", weekdays: [1, 3, 5] },
    ]);
    expect([...rep].sort()).toEqual([1, 3, 5]);
  });

  it("pickRepresentativeSection — 분반 수 무관(다분반이어도 대표 1개만): 물리 버그 동치", () => {
    // 같은 3시수(월·수·금) 분반 5개 → UNION 이면 동일하지만, 요일이 다른 분반이
    // 섞여도 '슬롯 수 최대' 한 분반만 취하므로 분반 수가 N 에 영향 없음.
    const many = [
      { sectionId: "1", weekdays: [1, 3, 5] },
      { sectionId: "2", weekdays: [2, 4] }, // 다른 요일 분반(UNION이면 부풀림)
      { sectionId: "3", weekdays: [1, 3, 5] },
      { sectionId: "4", weekdays: [2, 4] },
    ];
    const rep = pickRepresentativeSection(many);
    // 대표 = 슬롯 3개 분반(월·수·금) — 화·목 분반은 흡수되지 않음(UNION 버그 방지)
    expect([...rep].sort()).toEqual([1, 3, 5]);
    expect(rep.has(2)).toBe(false);
    expect(rep.has(4)).toBe(false);
  });

  it("pickRepresentativeSection — 동률은 첫째, 빈 입력은 빈 Set", () => {
    const tie = pickRepresentativeSection([
      { sectionId: "A", weekdays: [1, 2] },
      { sectionId: "B", weekdays: [3, 4] },
    ]);
    expect([...tie].sort()).toEqual([1, 2]); // 첫째
    expect(pickRepresentativeSection([]).size).toBe(0);
  });

  it("representativeDates — 요일 매칭 수업일을 오름차순으로", () => {
    const schoolDays = [
      { date: "2026-03-04" }, // 수
      { date: "2026-03-02" }, // 월
      { date: "2026-03-06" }, // 금
      { date: "2026-03-09" }, // 월
    ];
    expect(representativeDates(schoolDays, new Set([1]))).toEqual([
      "2026-03-02",
      "2026-03-09",
    ]);
    expect(representativeDates(schoolDays, new Set())).toEqual([]);
  });

  it("monthWeekLabel — 월 + 주차 floor((일-1)/7)+1", () => {
    expect(monthWeekLabel("2026-03-01")).toEqual({ month: 3, weekOfMonth: 1 });
    expect(monthWeekLabel("2026-03-07")).toEqual({ month: 3, weekOfMonth: 1 });
    expect(monthWeekLabel("2026-03-08")).toEqual({ month: 3, weekOfMonth: 2 });
    expect(monthWeekLabel("2026-03-15")).toEqual({ month: 3, weekOfMonth: 3 });
    expect(monthWeekLabel("2026-08-31")).toEqual({ month: 8, weekOfMonth: 5 });
  });
});
