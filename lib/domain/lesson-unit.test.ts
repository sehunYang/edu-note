import { describe, it, expect } from "vitest";
import {
  sixDigitCode,
  parseSixDigit,
  sortUnitsByCode,
  validateMinOrdinals,
} from "./lesson-unit";

/**
 * 학기계획 세부단원 도메인 단위 테스트 (QC v4 US-2).
 * 6자리코드 왕복·잘못된 코드(미존재/형식오류)·최소차시 초과 판정.
 */
describe("lesson-unit 도메인", () => {
  it("sixDigitCode — major*10000 + mid*100 + minor", () => {
    expect(sixDigitCode({ majorNo: 1, midNo: 2, minorNo: 3 })).toBe(10203);
    expect(sixDigitCode({ majorNo: 12, midNo: 34, minorNo: 56 })).toBe(123456);
    expect(sixDigitCode({ majorNo: 0, midNo: 0, minorNo: 1 })).toBe(1);
  });

  it("parseSixDigit — 왕복(round-trip)", () => {
    for (const nums of [
      { majorNo: 1, midNo: 2, minorNo: 3 },
      { majorNo: 12, midNo: 34, minorNo: 56 },
      { majorNo: 0, midNo: 0, minorNo: 0 },
      { majorNo: 99, midNo: 99, minorNo: 99 },
    ]) {
      expect(parseSixDigit(sixDigitCode(nums))).toEqual(nums);
    }
  });

  it("parseSixDigit — 형식오류는 null(음수·소수·범위초과)", () => {
    expect(parseSixDigit(-1)).toBeNull();
    expect(parseSixDigit(1.5)).toBeNull();
    expect(parseSixDigit(1000000)).toBeNull(); // 6자리 초과
    expect(parseSixDigit(NaN)).toBeNull();
  });

  it("parseSixDigit — 형식상 유효(존재 여부는 caller 가 조회)", () => {
    // 030201 = 대3 중2 소1. 코드 형식은 유효하나 실제 단원 존재는 DB lookup 책임.
    expect(parseSixDigit(30201)).toEqual({ majorNo: 3, midNo: 2, minorNo: 1 });
  });

  it("sortUnitsByCode — 6자리 코드 오름차순(원본 불변)", () => {
    const units = [
      { majorNo: 2, midNo: 1, minorNo: 1 }, // 20101
      { majorNo: 1, midNo: 1, minorNo: 2 }, // 10102
      { majorNo: 1, midNo: 1, minorNo: 1 }, // 10101
    ];
    const sorted = sortUnitsByCode(units);
    expect(sorted.map(sixDigitCode)).toEqual([10101, 10102, 20101]);
    expect(units[0]).toEqual({ majorNo: 2, midNo: 1, minorNo: 1 }); // 원본 보존
  });

  it("validateMinOrdinals — 실제 > 최소면 exceeded(학기계획 변경 필요)", () => {
    expect(validateMinOrdinals(2, 3)).toEqual({ ok: false, exceeded: true });
    expect(validateMinOrdinals(2, 2)).toEqual({ ok: true, exceeded: false });
    expect(validateMinOrdinals(2, 1)).toEqual({ ok: true, exceeded: false });
  });
});
