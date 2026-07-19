import { describe, it, expect } from "vitest";
import { neisFreshnessBadge } from "./timetable-freshness";

describe("neisFreshnessBadge", () => {
  it("미갱신(null)은 배지 숨김", () => {
    expect(neisFreshnessBadge(null, "2026-07-19")).toBeNull();
  });
  it("오늘 갱신이면 fresh 배지", () => {
    // 2026-07-19 07:20 KST = 2026-07-18T22:20:00Z
    expect(neisFreshnessBadge("2026-07-18T22:20:00.000Z", "2026-07-19")).toEqual({
      label: "✓ 오늘 갱신",
      stale: false,
    });
  });
  it("3일 전 갱신이면 stale 배지", () => {
    expect(neisFreshnessBadge("2026-07-15T22:20:00.000Z", "2026-07-19")).toEqual({
      label: "⚠ 3일 전 기준",
      stale: true,
    });
  });
  it("파싱 불가 ISO 는 null", () => {
    expect(neisFreshnessBadge("not-a-date", "2026-07-19")).toBeNull();
  });
});
