import { describe, it, expect } from "vitest";
import { parseCsv, parseCsvRecords } from "./parse";

describe("parseCsv", () => {
  it("기본 행/열 분해", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("BOM 제거", () => {
    expect(parseCsv("﻿a,b")).toEqual([["a", "b"]]);
  });

  it("CRLF / CR / LF 줄바꿈 모두 처리", () => {
    expect(parseCsv("a,b\r\n1,2\r3,4\n5,6")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
      ["5", "6"],
    ]);
  });

  it("따옴표 필드 내 콤마", () => {
    expect(parseCsv('"hello, world",x')).toEqual([["hello, world", "x"]]);
  });

  it("따옴표 필드 내 줄바꿈", () => {
    expect(parseCsv('"line1\nline2",b')).toEqual([["line1\nline2", "b"]]);
  });

  it('이스케이프된 따옴표("")', () => {
    expect(parseCsv('"say ""hi""",b')).toEqual([['say "hi"', "b"]]);
  });

  it("완전 빈 줄 제거", () => {
    expect(parseCsv("a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("빈 입력은 빈 배열", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("빈 필드 보존", () => {
    expect(parseCsv("a,,c")).toEqual([["a", "", "c"]]);
  });
});

describe("parseCsvRecords", () => {
  it("헤더 기반 레코드 + 1-기반 행번호", () => {
    const { headers, records } = parseCsvRecords("이름,학번\n홍길동,10203");
    expect(headers).toEqual(["이름", "학번"]);
    expect(records).toEqual([
      { rowNumber: 2, values: { 이름: "홍길동", 학번: "10203" } },
    ]);
  });

  it("헤더는 trim, 짧은 행은 빈 문자열로 채움", () => {
    const { records } = parseCsvRecords(" a , b \nx");
    expect(records[0].values).toEqual({ a: "x", b: "" });
  });

  it("값도 trim", () => {
    const { records } = parseCsvRecords("a\n  spaced  ");
    expect(records[0].values.a).toBe("spaced");
  });
});
