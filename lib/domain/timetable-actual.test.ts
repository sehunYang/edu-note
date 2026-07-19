import { describe, it, expect } from "vitest";
import {
  isSpecialTimetableEntry,
  shouldHighlightActual,
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
      "현장체험학습",
    ]) {
      expect(isSpecialTimetableEntry(s), s).toBe(true);
    }
  });

  it("정규 교과목은 false (표기차 노이즈 제거)", () => {
    for (const s of [
      "일본어",
      "일어",
      "문학",
      "문학B",
      "생명과학",
      "생명",
      "운동과 건강",
      "운건",
      "영어Ⅰ",
      "영ⅠA",
      "기하",
      "대수",
      "물리학",
      "화학",
      "사회", // '회' 오탐 방지
      "한국사",
      "확률과 통계",
    ]) {
      expect(isSpecialTimetableEntry(s), s).toBe(false);
    }
  });

  it("빈 문자열은 false", () => {
    expect(isSpecialTimetableEntry("")).toBe(false);
    expect(isSpecialTimetableEntry("  ")).toBe(false);
  });
});

describe("shouldHighlightActual", () => {
  it("특별활동이고 표준과 다르면 강조", () => {
    expect(shouldHighlightActual("영ⅠA", "제헌절")).toBe(true);
    expect(shouldHighlightActual("수학", "진로활동")).toBe(true);
  });
  it("정규과목 표기차는 강조 안 함", () => {
    expect(shouldHighlightActual("일어", "일본어")).toBe(false);
    expect(shouldHighlightActual("생명", "생명과학")).toBe(false);
    expect(shouldHighlightActual("운건", "운동과 건강")).toBe(false);
  });
  it("실제 없음·동일·빈값은 강조 안 함", () => {
    expect(shouldHighlightActual("수학", null)).toBe(false);
    expect(shouldHighlightActual("수학", undefined)).toBe(false);
    expect(shouldHighlightActual("진로활동", "진로활동")).toBe(false);
    expect(shouldHighlightActual("수학", "")).toBe(false);
  });
});
