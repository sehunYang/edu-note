import { describe, it, expect } from "vitest";
import { absentPeriods, submissionTier, ROLL_CALL_PERIOD } from "./attendance";

// 조회(0) + 1..7교시
const PERIODS = [ROLL_CALL_PERIOD, 1, 2, 3, 4, 5, 6, 7];

describe("absentPeriods", () => {
  it("지각(late): 조회(0)부터 기점까지 포함", () => {
    expect(absentPeriods("late", 3, [], PERIODS)).toEqual([0, 1, 2, 3]);
  });

  it("지각(late): 기점이 조회면 조회만", () => {
    expect(absentPeriods("late", 0, [], PERIODS)).toEqual([0]);
  });

  it("조퇴(early_leave): 기점부터 끝까지 포함", () => {
    expect(absentPeriods("early_leave", 5, [], PERIODS)).toEqual([5, 6, 7]);
  });

  it("결과(absent_period): 선택 교시 그대로(다중·비연속)", () => {
    expect(absentPeriods("absent_period", 0, [2, 5, 7], PERIODS)).toEqual([
      2, 5, 7,
    ]);
  });

  it("결과(absent_period): periodList 순서로 정규화", () => {
    expect(absentPeriods("absent_period", 0, [7, 2], PERIODS)).toEqual([2, 7]);
  });

  it("결석(absent): 전체 교시 목록", () => {
    expect(absentPeriods("absent", 0, [], PERIODS)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
  });
});

describe("submissionTier (남은 수업일 기준, 마감=5수업일)", () => {
  it("경계값: 3→normal, 2→warning, 1→critical, 0→critical, -1→expired", () => {
    expect(submissionTier(3)).toBe("normal");
    expect(submissionTier(2)).toBe("warning");
    expect(submissionTier(1)).toBe("critical");
    expect(submissionTier(0)).toBe("critical");
    expect(submissionTier(-1)).toBe("expired");
  });

  it("경과 수업일로 읽으면 1·2일=정상, 3일=위험, 4·5일=심각, 초과=제출불가", () => {
    // 경과 n일 = 남은 5-n일.
    expect(submissionTier(5 - 1)).toBe("normal");
    expect(submissionTier(5 - 2)).toBe("normal");
    expect(submissionTier(5 - 3)).toBe("warning");
    expect(submissionTier(5 - 4)).toBe("critical");
    expect(submissionTier(5 - 5)).toBe("critical");
    expect(submissionTier(5 - 6)).toBe("expired");
  });

  it("큰 양수는 normal, 큰 음수는 expired", () => {
    expect(submissionTier(99)).toBe("normal");
    expect(submissionTier(-99)).toBe("expired");
  });
});
