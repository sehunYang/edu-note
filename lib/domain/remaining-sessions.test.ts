import { describe, it, expect } from "vitest";
import {
  resolveBoundary,
  tallySessions,
  type SessionLike,
} from "./remaining-sessions";

describe("resolveBoundary", () => {
  it("분반 경계 우선, 없으면 과목 경계, 둘 다 없으면 null", () => {
    expect(resolveBoundary("2026-07-10", "2026-07-15")).toBe("2026-07-10");
    expect(resolveBoundary(null, "2026-07-15")).toBe("2026-07-15");
    expect(resolveBoundary(undefined, undefined)).toBe(null);
  });
});

describe("tallySessions", () => {
  const sessions: SessionLike[] = [
    { date: "2026-06-01", status: "done" },
    { date: "2026-06-03", status: "done" },
    { date: "2026-06-05", status: "not_held" },
    { date: "2026-06-08", status: "planned" },
    { date: "2026-06-10", status: "planned" },
    { date: "2026-07-20", status: "planned" }, // 경계 이후
  ];

  it("남은차시 = planned(≤경계) − done, not_held 제외", () => {
    const t = tallySessions(sessions, "2026-07-10");
    expect(t.done).toBe(2);
    expect(t.notHeld).toBe(1);
    expect(t.plannedUpToBoundary).toBe(2); // 06-08, 06-10 (07-20 제외)
    expect(t.remaining).toBe(2 - 2);
  });

  it("경계가 null 이면 모든 planned 포함", () => {
    const t = tallySessions(sessions, null);
    expect(t.plannedUpToBoundary).toBe(3);
    expect(t.remaining).toBe(3 - 2);
  });

  it("not_held 는 done/planned 어디에도 포함되지 않는다", () => {
    const t = tallySessions(
      [{ date: "2026-06-05", status: "not_held" }],
      "2026-07-10",
    );
    expect(t.done).toBe(0);
    expect(t.plannedUpToBoundary).toBe(0);
    expect(t.notHeld).toBe(1);
  });
});
