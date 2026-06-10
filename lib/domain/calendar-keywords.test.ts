import { describe, it, expect } from "vitest";
import { classifyEvent } from "./calendar-keywords";

/**
 * 학사일정 키워드 분류 단위테스트 (QC v1 C3, AC-3.1~3.4).
 * 다양한 NEIS 표기를 고정 — 오탐/누락은 교사 보정 UI 가 최종 교정.
 */
describe("classifyEvent — 시험", () => {
  it("1학기 중간고사 → exam, 학기1, 회차1", () => {
    expect(classifyEvent("1학기 중간고사")).toEqual({
      eventKind: "exam",
      examSemester: 1,
      examOrdinal: 1,
    });
  });

  it("2학기 기말고사 → exam, 학기2, 회차2", () => {
    expect(classifyEvent("2학기 기말고사")).toEqual({
      eventKind: "exam",
      examSemester: 2,
      examOrdinal: 2,
    });
  });

  it("1차 지필평가(학기 표기 없음) → exam, 회차1, 학기 미상", () => {
    expect(classifyEvent("1차 지필평가")).toEqual({
      eventKind: "exam",
      examSemester: undefined,
      examOrdinal: 1,
    });
  });

  it("2학기 2차 지필 → exam, 학기2, 회차2", () => {
    expect(classifyEvent("2학기 2차 지필")).toEqual({
      eventKind: "exam",
      examSemester: 2,
      examOrdinal: 2,
    });
  });

  it("수행평가는 지필 시험이 아님 → none", () => {
    expect(classifyEvent("국어 수행평가")).toEqual({ eventKind: "none" });
  });
});

describe("classifyEvent — 방학/개학/동아리/기타", () => {
  it("여름방학식 → vacation_start", () => {
    expect(classifyEvent("여름방학식")).toEqual({ eventKind: "vacation_start" });
  });

  it("개학식 → vacation_end (방학보다 우선)", () => {
    expect(classifyEvent("2학기 개학식")).toEqual({ eventKind: "vacation_end" });
  });

  it("동아리 활동의 날 → club", () => {
    expect(classifyEvent("동아리 한마당")).toEqual({ eventKind: "club" });
  });

  it("졸업식 등 기타 → none", () => {
    expect(classifyEvent("졸업식")).toEqual({ eventKind: "none" });
  });

  it("빈 제목 → none", () => {
    expect(classifyEvent("   ")).toEqual({ eventKind: "none" });
  });
});
