import { describe, it, expect } from "vitest";
import { computeTier, countSchoolDays, tierFromDates } from "./escalation";

describe("computeTier", () => {
  it("≤3 정상 / >3 위험 / >5 심각", () => {
    expect(computeTier(0)).toBe("normal");
    expect(computeTier(3)).toBe("normal");
    expect(computeTier(4)).toBe("warning");
    expect(computeTier(5)).toBe("warning");
    expect(computeTier(6)).toBe("critical");
    expect(computeTier(99)).toBe("critical");
  });
});

describe("countSchoolDays", () => {
  // 주말(토=6, 일=0) 제외 판정
  const weekdayOnly = (d: Date) => {
    const wd = d.getUTCDay();
    return wd !== 0 && wd !== 6;
  };

  it("기준일 다음날부터 asOf 까지(반열림) 수업일 카운트", () => {
    // 2026-06-01(월) 기준, 2026-06-05(금)까지 → 화,수,목,금 = 4 수업일
    const from = new Date("2026-06-01T00:00:00Z");
    const to = new Date("2026-06-05T00:00:00Z");
    expect(countSchoolDays(from, to, weekdayOnly)).toBe(4);
  });

  it("주말은 제외된다", () => {
    // 2026-06-05(금) → 2026-06-08(월): 토·일 제외, 월만 = 1
    const from = new Date("2026-06-05T00:00:00Z");
    const to = new Date("2026-06-08T00:00:00Z");
    expect(countSchoolDays(from, to, weekdayOnly)).toBe(1);
  });

  it("공휴일을 추가로 제외", () => {
    const holidays = new Set(["2026-06-03"]); // 수 휴일 가정
    const isSchoolDay = (d: Date) =>
      weekdayOnly(d) && !holidays.has(d.toISOString().slice(0, 10));
    // 2026-06-01(월) → 06-05(금): 화,(수 휴일),목,금 = 3
    expect(
      countSchoolDays(
        new Date("2026-06-01T00:00:00Z"),
        new Date("2026-06-05T00:00:00Z"),
        isSchoolDay,
      ),
    ).toBe(3);
  });

  it("같은 날이면 0", () => {
    const d = new Date("2026-06-05T00:00:00Z");
    expect(countSchoolDays(d, d, weekdayOnly)).toBe(0);
  });
});

describe("tierFromDates", () => {
  const weekdayOnly = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;

  it("경과 수업일이 6이면 심각", () => {
    // 월 기준 9 수업일 후 = critical
    const base = new Date("2026-06-01T00:00:00Z");
    const asOf = new Date("2026-06-12T00:00:00Z"); // 화~금(4)+월~금(5)=9 수업일
    expect(tierFromDates(base, asOf, weekdayOnly)).toBe("critical");
  });
});
