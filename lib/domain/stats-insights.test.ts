import { describe, it, expect } from "vitest";
import {
  histogram,
  basicStats,
  coverageMatrix,
  completionRate,
} from "./stats-insights";

/**
 * 통계실 인사이트 도메인 단위 테스트 (AD-1). 히스토그램·기초통계(모표준편차)·
 * 커버리지 정렬·완료율의 경계 케이스를 전수 확인.
 */

describe("histogram — 점수 분포", () => {
  it("정상 분포 — 여러 구간에 걸친 점수", () => {
    // 0-10:1(5), 10-20:0, 20-30:0, ... 70-80:2(70,75), 80-90:1(85), 90-100:1(95)
    const bins = histogram([5, 70, 75, 85, 95], 10);
    expect(bins).toEqual([
      { label: "0-10", count: 1 },
      { label: "10-20", count: 0 },
      { label: "20-30", count: 0 },
      { label: "30-40", count: 0 },
      { label: "40-50", count: 0 },
      { label: "50-60", count: 0 },
      { label: "60-70", count: 0 },
      { label: "70-80", count: 2 },
      { label: "80-90", count: 1 },
      { label: "90-100", count: 1 },
    ]);
  });

  it("빈 배열 → 빈 배열", () => {
    expect(histogram([], 10)).toEqual([]);
  });

  it("단일 값 → 구간 1개", () => {
    expect(histogram([72], 10)).toEqual([{ label: "70-80", count: 1 }]);
  });

  it("구간 경계값은 하한 포함·상한 미포함", () => {
    // 70은 70-80 구간, 80은 80-90 구간(70-80에 포함되지 않음)
    const bins = histogram([70, 80], 10);
    expect(bins).toEqual([
      { label: "70-80", count: 1 },
      { label: "80-90", count: 1 },
    ]);
  });
});

describe("basicStats — 평균/모표준편차/중앙값", () => {
  it("known array — 손계산 대조", () => {
    // scores = [2, 4, 4, 4, 5, 5, 7, 9]
    // mean = 40/8 = 5
    // population variance = ((9)+(1)+(1)+(1)+(0)+(0)+(4)+(16))/8 = 32/8 = 4
    // stddev = 2
    // median = (4+5)/2 = 4.5 (n=8, 정렬 후 4,5번째 평균)
    const stats = basicStats([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(stats.mean).toBe(5);
    expect(stats.stddev).toBe(2);
    expect(stats.median).toBe(4.5);
    expect(stats.n).toBe(8);
  });

  it("홀수 개 — 중앙값은 가운데 값", () => {
    const stats = basicStats([10, 20, 30]);
    expect(stats.mean).toBe(20);
    expect(stats.median).toBe(20);
    expect(stats.n).toBe(3);
  });

  it("빈 배열 계약 — 전부 0", () => {
    expect(basicStats([])).toEqual({ mean: 0, stddev: 0, median: 0, n: 0 });
  });
});

describe("coverageMatrix — 학생×유형 커버리지", () => {
  it("합계 오름차순 정렬, 동률은 이름순", () => {
    const rows = [
      { studentYearId: "s1", studentName: "김민준", kind: "observation" },
      { studentYearId: "s1", studentName: "김민준", kind: "behavior" },
      { studentYearId: "s2", studentName: "이서연", kind: "observation" },
      { studentYearId: "s3", studentName: "박도윤", kind: "observation" },
      { studentYearId: "s3", studentName: "박도윤", kind: "observation" },
    ];
    const result = coverageMatrix(rows);
    // s2: total=1, s3: total=2, s1: total=2 -> tie(s1,s3) broken by name: 김민준 < 박도윤
    expect(result.map((r) => r.studentYearId)).toEqual(["s2", "s1", "s3"]);
    expect(result[0]).toEqual({
      studentYearId: "s2",
      studentName: "이서연",
      counts: { observation: 1 },
      total: 1,
    });
    expect(result[1]).toEqual({
      studentYearId: "s1",
      studentName: "김민준",
      counts: { observation: 1, behavior: 1 },
      total: 2,
    });
    expect(result[2]).toEqual({
      studentYearId: "s3",
      studentName: "박도윤",
      counts: { observation: 2 },
      total: 2,
    });
  });

  it("빈 입력 → 빈 배열", () => {
    expect(coverageMatrix([])).toEqual([]);
  });

  it("allStudents 제공 시 기록이 전혀 없는 학생도 total=0 행으로 포함(최우선 정렬)", () => {
    const rows = [
      { studentYearId: "s1", studentName: "김민준", kind: "observation" },
    ];
    const allStudents = [
      { studentYearId: "s1", studentName: "김민준" },
      { studentYearId: "s2", studentName: "이서연" }, // rows 에 없음 — 0건
    ];
    const result = coverageMatrix(rows, allStudents);
    expect(result.map((r) => r.studentYearId)).toEqual(["s2", "s1"]);
    expect(result[0]).toEqual({
      studentYearId: "s2",
      studentName: "이서연",
      counts: {},
      total: 0,
    });
  });

  it("allStudents 미제공 시 기존 동작(rows 등장 학생만) 유지", () => {
    const rows = [
      { studentYearId: "s1", studentName: "김민준", kind: "observation" },
    ];
    expect(coverageMatrix(rows).map((r) => r.studentYearId)).toEqual(["s1"]);
  });
});

describe("completionRate — 완료율", () => {
  it("정상 케이스", () => {
    expect(completionRate(3, 4)).toBe(0.75);
  });

  it("total=0 → null(0%로 오인 방지)", () => {
    expect(completionRate(0, 0)).toBeNull();
  });

  it("completed=total → 1", () => {
    expect(completionRate(5, 5)).toBe(1);
  });
});
