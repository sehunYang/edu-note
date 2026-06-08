import { describe, it, expect } from "vitest";
import { evalMethodDisplay } from "./eval-method-display";

describe("evalMethodDisplay", () => {
  it("rel_abs: 석차·5등급·성취도(A~E) 모두", () => {
    expect(evalMethodDisplay("rel_abs")).toEqual({
      showRank: true,
      showGrade5: true,
      showAchievement: true,
      achievementLevels: 5,
    });
  });

  it("abs: 석차/등급 없음, 성취도(A~E)만", () => {
    const d = evalMethodDisplay("abs");
    expect(d.showRank).toBe(false);
    expect(d.showGrade5).toBe(false);
    expect(d.showAchievement).toBe(true);
    expect(d.achievementLevels).toBe(5);
  });

  it("ach3: 성취도 3단계(A~C)만", () => {
    const d = evalMethodDisplay("ach3");
    expect(d.showRank).toBe(false);
    expect(d.showGrade5).toBe(false);
    expect(d.achievementLevels).toBe(3);
  });
});
