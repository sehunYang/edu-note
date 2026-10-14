import { describe, it, expect } from "vitest";
import { mealSyncRangeYmd } from "./neis-meal-sync";

describe("mealSyncRangeYmd", () => {
  it("이번 달 1일 ~ 다음 달 말일", () => {
    expect(mealSyncRangeYmd("2026-10-14")).toEqual({ fromYmd: "20261001", toYmd: "20261130" });
  });
  it("12월 → 다음 해 1월 말일", () => {
    expect(mealSyncRangeYmd("2026-12-31")).toEqual({ fromYmd: "20261201", toYmd: "20270131" });
  });
  it("1월 → 윤년 2월 말일", () => {
    expect(mealSyncRangeYmd("2028-01-05")).toEqual({ fromYmd: "20280101", toYmd: "20280229" });
  });
});
