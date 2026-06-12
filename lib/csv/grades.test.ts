import { describe, it, expect } from "vitest";
import {
  parsePerformanceCsv,
  parseJipilCsv,
  performanceCsvExample,
  jipilCsvExample,
} from "./grades";
import { CsvHeaderError } from "./types";

/**
 * 성적 CSV 파서 단위 테스트 (교실 2-2 단계4).
 * 유효 행 파싱 + 형식오류 행 → errors[] graceful + 예시 CSV 헤더 검증.
 */

describe("parsePerformanceCsv", () => {
  it("유효 행 — 점수·서술 파싱", () => {
    const csv =
      "학번,이름,점수,서술\n" +
      "10101,홍길동,18,변인 통제를 정확히 적용함\n" +
      "10102,김영희,,서술만 있는 행\n";
    const res = parsePerformanceCsv(csv);
    expect(res.totalRows).toBe(2);
    expect(res.errors).toHaveLength(0);
    expect(res.rows).toEqual([
      { sid: "10101", name: "홍길동", score: 18, prose: "변인 통제를 정확히 적용함" },
      { sid: "10102", name: "김영희", score: null, prose: "서술만 있는 행" },
    ]);
  });

  it("형식 오류 행 — errors[]로 분리(graceful)", () => {
    const csv =
      "학번,이름,점수,서술\n" +
      "10101,홍길동,18,정상\n" +
      "abc,오타,20,학번오류\n" +
      "10103,점수오류,xx,점수비숫자\n";
    const res = parsePerformanceCsv(csv);
    expect(res.totalRows).toBe(3);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].sid).toBe("10101");
    expect(res.errors).toHaveLength(2);
    expect(res.errors[0].rowNumber).toBe(3); // abc 행
    expect(res.errors[1].rowNumber).toBe(4); // xx 점수 행
  });

  it("필수 헤더(학번) 누락 — CsvHeaderError throw", () => {
    expect(() => parsePerformanceCsv("이름,점수\n홍길동,18\n")).toThrow(
      CsvHeaderError,
    );
  });
});

describe("parseJipilCsv", () => {
  it("유효 행 — 원점수 파싱", () => {
    const csv = "학번,이름,원점수\n10101,홍길동,88\n10102,김영희,\n";
    const res = parseJipilCsv(csv);
    expect(res.totalRows).toBe(2);
    expect(res.errors).toHaveLength(0);
    expect(res.rows).toEqual([
      { sid: "10101", name: "홍길동", rawScore: 88 },
      { sid: "10102", name: "김영희", rawScore: null },
    ]);
  });

  it("형식 오류 행 — errors[]로 분리", () => {
    const csv = "학번,이름,원점수\n10101,홍길동,88\n9,짧은학번,70\n";
    const res = parseJipilCsv(csv);
    expect(res.rows).toHaveLength(1);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].rowNumber).toBe(3);
  });

  it("필수 헤더(학번) 누락 — CsvHeaderError throw", () => {
    expect(() => parseJipilCsv("이름,원점수\n홍길동,88\n")).toThrow(CsvHeaderError);
  });
});

describe("예시 CSV", () => {
  it("performanceCsvExample 헤더가 학번,이름,점수,서술", () => {
    const header = performanceCsvExample().split("\n")[0];
    expect(header).toBe("학번,이름,점수,서술");
    // 예시도 파서를 통과해야 함(왕복 안전성).
    const res = parsePerformanceCsv(performanceCsvExample());
    expect(res.errors).toHaveLength(0);
    expect(res.rows.length).toBeGreaterThan(0);
  });

  it("jipilCsvExample 헤더가 학번,이름,원점수", () => {
    const header = jipilCsvExample().split("\n")[0];
    expect(header).toBe("학번,이름,원점수");
    const res = parseJipilCsv(jipilCsvExample());
    expect(res.errors).toHaveLength(0);
    expect(res.rows.length).toBeGreaterThan(0);
  });
});
