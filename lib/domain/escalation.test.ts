import { describe, it, expect } from "vitest";
import { computeTier, countSchoolDays, tierFromDates } from "./escalation";

describe("computeTier (미제출 화면 submissionTier 와 동일 규칙)", () => {
  it("출결(마감 5수업일): 경과 1·2 정상 / 3 위험 / ≥4 심각(제출불가 포함 캡)", () => {
    expect(computeTier(0, 5)).toBe("normal");
    expect(computeTier(2, 5)).toBe("normal");
    expect(computeTier(3, 5)).toBe("warning");
    expect(computeTier(4, 5)).toBe("critical");
    expect(computeTier(5, 5)).toBe("critical");
    // 마감 경과(제출불가)는 enum 3단이라 심각으로 캡.
    expect(computeTier(6, 5)).toBe("critical");
    expect(computeTier(99, 5)).toBe("critical");
  });

  it("교외체험(마감 10수업일): 경과 ≤7 정상 / 8 위험 / ≥9 심각", () => {
    expect(computeTier(7, 10)).toBe("normal");
    expect(computeTier(8, 10)).toBe("warning");
    expect(computeTier(9, 10)).toBe("critical");
    expect(computeTier(11, 10)).toBe("critical");
  });

  it("마감 미지정 시 기본 5수업일", () => {
    expect(computeTier(2)).toBe("normal");
    expect(computeTier(3)).toBe("warning");
    expect(computeTier(4)).toBe("critical");
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

  it("출결: 경과 9수업일(마감 5 초과)이면 심각", () => {
    const base = new Date("2026-06-01T00:00:00Z");
    const asOf = new Date("2026-06-12T00:00:00Z"); // 화~금(4)+월~금(5)=9 수업일
    expect(tierFromDates(base, asOf, weekdayOnly, 5)).toBe("critical");
  });

  it("교외체험: 같은 경과 9수업일도 마감 10이면 심각(남은 1)", () => {
    const base = new Date("2026-06-01T00:00:00Z");
    const asOf = new Date("2026-06-12T00:00:00Z");
    expect(tierFromDates(base, asOf, weekdayOnly, 10)).toBe("critical");
  });

  it("교외체험: 경과 4수업일이면 정상(남은 6)", () => {
    const base = new Date("2026-06-01T00:00:00Z");
    const asOf = new Date("2026-06-05T00:00:00Z"); // 화~금 = 4 수업일
    expect(tierFromDates(base, asOf, weekdayOnly, 10)).toBe("normal");
  });
});
