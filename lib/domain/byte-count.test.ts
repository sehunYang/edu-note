import { describe, it, expect } from "vitest";
import { byteLength, checkBytes, BYTE_LIMITS } from "./byte-count";

describe("byteLength", () => {
  it("영문/숫자/특수/공백 = 1 byte", () => {
    expect(byteLength("a")).toBe(1);
    expect(byteLength("1")).toBe(1);
    expect(byteLength("!")).toBe(1);
    expect(byteLength(" ")).toBe(1);
    expect(byteLength("abc 123")).toBe(7);
  });

  it("한글 = 3 byte (음절·자모)", () => {
    expect(byteLength("가")).toBe(3);
    expect(byteLength("홍길동")).toBe(9);
    expect(byteLength("ㄱ")).toBe(3); // 자모
  });

  it("줄바꿈 = 2 byte, \\r\\n 은 1회로 정규화", () => {
    expect(byteLength("\n")).toBe(2);
    expect(byteLength("a\nb")).toBe(1 + 2 + 1);
    expect(byteLength("a\r\nb")).toBe(1 + 2 + 1);
    expect(byteLength("a\rb")).toBe(1 + 2 + 1);
  });

  it("혼합 문자열", () => {
    // "홍길동: A+" = 한글3*3 + ':'1 + ' '1 + 'A'1 + '+'1 = 9+4 = 13
    expect(byteLength("홍길동: A+")).toBe(13);
  });

  it("빈 문자열 = 0", () => {
    expect(byteLength("")).toBe(0);
  });
});

describe("checkBytes", () => {
  it("상한 미만/초과 판정", () => {
    const within = checkBytes("가".repeat(100), "autonomy"); // 300 byte
    expect(within.byteCount).toBe(300);
    expect(within.byteLimit).toBe(3000);
    expect(within.remaining).toBe(2700);
    expect(within.over).toBe(false);

    const over = checkBytes("가".repeat(1001), "autonomy"); // 3003 byte
    expect(over.over).toBe(true);
    expect(over.remaining).toBe(-3);
  });

  it("유형별 상한 (진로만 4200)", () => {
    expect(BYTE_LIMITS.autonomy).toBe(3000);
    expect(BYTE_LIMITS.club).toBe(3000);
    expect(BYTE_LIMITS.career).toBe(4200);
    expect(BYTE_LIMITS.subject).toBe(3000);
    expect(BYTE_LIMITS.behavior).toBe(3000);
  });
});
