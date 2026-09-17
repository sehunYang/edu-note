import { describe, it, expect } from "vitest";
import { formatYmd, monthGrid, shiftYmd, ymdWeekday } from "./ymd";

describe("ymd 산술", () => {
  it("shiftYmd 는 월·연 경계와 윤년을 넘긴다", () => {
    expect(shiftYmd("2026-09-17", 1)).toBe("2026-09-18");
    expect(shiftYmd("2026-09-30", 1)).toBe("2026-10-01");
    expect(shiftYmd("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftYmd("2028-02-28", 1)).toBe("2028-02-29"); // 윤년
    expect(shiftYmd("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("ymdWeekday 는 UTC 기준 요일(0=일)", () => {
    expect(ymdWeekday("2026-09-17")).toBe(4); // 목
    expect(ymdWeekday("2026-09-20")).toBe(0); // 일
  });

  it("monthGrid 는 첫째 날 요일만큼 빈칸을 앞에 둔다", () => {
    const sep = monthGrid(2026, 9); // 2026-09-01 = 화 → 빈칸 2
    expect(sep.slice(0, 3)).toEqual([null, null, 1]);
    expect(sep.length).toBe(2 + 30);
    const feb = monthGrid(2028, 2); // 2028-02-01 = 화, 윤년 29일
    expect(feb.filter((d) => d !== null).length).toBe(29);
  });

  it("formatYmd 는 두 자리로 채운다", () => {
    expect(formatYmd(2026, 3, 5)).toBe("2026-03-05");
  });
});

describe("isValidYmd", () => {
  it("모양만 맞는 날짜를 거른다", async () => {
    const { isValidYmd } = await import("./ymd");
    expect(isValidYmd("2026-09-17")).toBe(true);
    expect(isValidYmd("2028-02-29")).toBe(true);
    expect(isValidYmd("2026-02-29")).toBe(false);
    expect(isValidYmd("2026-13-45")).toBe(false);
    expect(isValidYmd("2026-9-1")).toBe(false);
  });
});
