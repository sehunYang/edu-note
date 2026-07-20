import { describe, it, expect } from "vitest";
import {
  isSpecialTimetableEntry,
  classifyWeeklyOverlay,
  type OverlaySlot,
} from "./timetable-actual";

describe("isSpecialTimetableEntry", () => {
  it("특별활동·행사·휴업은 true", () => {
    for (const s of [
      "진로활동",
      "자율활동",
      "동아리활동",
      "봉사활동",
      "창의적체험활동",
      "제헌절",
      "광복절",
      "입학식",
      "졸업식",
      "지필평가",
      "모의고사",
      "체육대회",
      "축제",
      "재량휴업",
      "여름방학",
      "[보강]생명과학",
    ]) {
      expect(isSpecialTimetableEntry(s), s).toBe(true);
    }
  });

  it("정규 교과목은 false", () => {
    for (const s of [
      "일본어",
      "일어",
      "문학",
      "생명과학",
      "운동과 건강",
      "영어Ⅰ",
      "기하",
      "대수",
      "물리학",
      "화학",
      "사회", // '회' 오탐 방지
    ]) {
      expect(isSpecialTimetableEntry(s), s).toBe(false);
    }
  });

  it("빈 문자열은 false", () => {
    expect(isSpecialTimetableEntry("")).toBe(false);
  });
});

// 헬퍼: {weekday, period, subject} 슬롯 배열 생성.
function slots(rows: [number, number, string][]): OverlaySlot[] {
  return rows.map(([weekday, period, subject]) => ({ weekday, period, subject }));
}

describe("classifyWeeklyOverlay", () => {
  it("어휘 표기차는 별칭 학습으로 변화 아님(오탐 제거)", () => {
    // 표준 '일어'가 월·수·금 5교시. NEIS 는 전부 '일본어' → 별칭 일어→일본어 학습.
    const std = slots([
      [1, 5, "일어"],
      [3, 5, "일어"],
      [5, 5, "일어"],
    ]);
    const act = slots([
      [1, 5, "일본어"],
      [3, 5, "일본어"],
      [5, 5, "일본어"],
    ]);
    expect(classifyWeeklyOverlay(std, act).size).toBe(0);
  });

  it("특별활동 대체는 special", () => {
    const std = slots([[5, 4, "영ⅠA"]]);
    const act = slots([[5, 4, "제헌절"]]);
    const out = classifyWeeklyOverlay(std, act);
    expect(out.get("5::4")).toEqual({ kind: "special", actual: "제헌절" });
  });

  it("같은 날 교시 교환은 swap (별칭 정규화 후 판정)", () => {
    // 표준: 1교시 수학, 3교시 영어가 여러 요일 반복(별칭 최빈값 안정).
    const std = slots([
      [1, 1, "수학"],
      [1, 3, "영어"],
      [2, 1, "수학"],
      [2, 3, "영어"],
      [3, 1, "수학"],
      [3, 3, "영어"],
    ]);
    // 월요일만 1·3교시 교환. 화·수는 그대로(별칭 학습원 다수).
    const act = slots([
      [1, 1, "영어"],
      [1, 3, "수학"],
      [2, 1, "수학"],
      [2, 3, "영어"],
      [3, 1, "수학"],
      [3, 3, "영어"],
    ]);
    const out = classifyWeeklyOverlay(std, act);
    expect(out.get("1::1")).toEqual({ kind: "swap", actual: "영어" });
    expect(out.get("1::3")).toEqual({ kind: "swap", actual: "수학" });
    expect(out.has("2::1")).toBe(false); // 화요일 변화 없음
  });

  it("다른 정규과목으로 대체는 changed", () => {
    // 수학이 여러 요일 반복(별칭 수학→수학 안정) + 월 2교시만 물리학으로 대체.
    const std = slots([
      [1, 2, "수학"],
      [2, 2, "수학"],
      [3, 2, "수학"],
    ]);
    const act = slots([
      [1, 2, "물리학"],
      [2, 2, "수학"],
      [3, 2, "수학"],
    ]);
    const out = classifyWeeklyOverlay(std, act);
    expect(out.get("1::2")).toEqual({ kind: "changed", actual: "물리학" });
  });

  it("NEIS 무데이터 칸·표준 없는 칸은 미표시", () => {
    const std = slots([
      [1, 1, "수학"],
      [1, 2, "국어"],
    ]);
    const act = slots([
      [1, 1, "수학"], // 동일
      // 1::2 는 NEIS 없음 → 표준 폴백
      [1, 5, "진로활동"], // 표준 없는 칸 → 미표시(범위 한정)
    ]);
    const out = classifyWeeklyOverlay(std, act);
    expect(out.size).toBe(0);
  });

  it("실제 학교 어휘 혼합: 여름방학은 강조, 정규 표기차는 무시", () => {
    const std = slots([
      [3, 5, "일어"],
      [3, 6, "기하"],
      [1, 5, "일어"], // 별칭 학습원(정상일)
      [1, 6, "기하"],
    ]);
    const act = slots([
      [3, 5, "여름방학"],
      [3, 6, "여름방학"],
      [1, 5, "일본어"], // 표기차 → 별칭으로 동일
      [1, 6, "기하"],
    ]);
    const out = classifyWeeklyOverlay(std, act);
    expect(out.get("3::5")?.kind).toBe("special");
    expect(out.get("3::6")?.kind).toBe("special");
    expect(out.has("1::5")).toBe(false);
    expect(out.has("1::6")).toBe(false);
  });
});
