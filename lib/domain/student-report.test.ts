import { describe, it, expect } from "vitest";
import {
  jipilTrend,
  observationShortage,
  performanceMissing,
  sectionRank,
} from "./student-report";

/**
 * 학생 분석 보고서 도메인 단위 테스트 (교실 2-2 단계6). 플래그 4종의
 * null/경계 케이스를 전수 확인. AI 미사용(순수 규칙).
 */

describe("jipilTrend — 지필 추이", () => {
  it("기말 > 중간 → up", () => {
    expect(jipilTrend(60, 80)).toBe("up");
  });
  it("기말 < 중간 → down", () => {
    expect(jipilTrend(80, 60)).toBe("down");
  });
  it("기말 = 중간 → flat", () => {
    expect(jipilTrend(70, 70)).toBe("flat");
  });
  it("중간 null → null", () => {
    expect(jipilTrend(null, 80)).toBeNull();
  });
  it("기말 null → null", () => {
    expect(jipilTrend(80, null)).toBeNull();
  });
  it("둘 다 null → null", () => {
    expect(jipilTrend(null, null)).toBeNull();
  });
  it("0점 경계도 비교(둘 다 0 → flat)", () => {
    expect(jipilTrend(0, 0)).toBe("flat");
  });
});

describe("observationShortage — 관찰 부족 경고", () => {
  it("0건 → 경고(기본 임계 1)", () => {
    expect(observationShortage(0)).toBe(true);
  });
  it("1건(경계) → 경고", () => {
    expect(observationShortage(1)).toBe(true);
  });
  it("2건 → 경고 아님", () => {
    expect(observationShortage(2)).toBe(false);
  });
  it("임계 커스텀(3) — 3건 경고, 4건 아님", () => {
    expect(observationShortage(3, 3)).toBe(true);
    expect(observationShortage(4, 3)).toBe(false);
  });
});

describe("performanceMissing — 미입력 수행항목", () => {
  it("미입력 항목 이름만 순서대로 반환", () => {
    expect(
      performanceMissing([
        { name: "실험", hasScore: true },
        { name: "발표", hasScore: false },
        { name: "보고서", hasScore: false },
      ]),
    ).toEqual(["발표", "보고서"]);
  });
  it("전부 입력 → 빈 배열", () => {
    expect(
      performanceMissing([
        { name: "a", hasScore: true },
        { name: "b", hasScore: true },
      ]),
    ).toEqual([]);
  });
  it("항목 없음 → 빈 배열", () => {
    expect(performanceMissing([])).toEqual([]);
  });
});

describe("sectionRank — 분반 코호트 대비 3분위", () => {
  const cohort = [10, 20, 30];
  it("최고점 → high (pct 2/3)", () => {
    expect(sectionRank(30, cohort)).toBe("high");
  });
  it("중간점 → mid (pct 1/3)", () => {
    expect(sectionRank(20, cohort)).toBe("mid");
  });
  it("최저점 → low (pct 0)", () => {
    expect(sectionRank(10, cohort)).toBe("low");
  });
  it("점수 없음 → null", () => {
    expect(sectionRank(null, cohort)).toBeNull();
  });
  it("코호트 빔 → null", () => {
    expect(sectionRank(50, [])).toBeNull();
  });
  it("동점 분포 — 모두 같은 점수면 미만 0 → low", () => {
    expect(sectionRank(50, [50, 50, 50])).toBe("low");
  });
  it("코호트 밖 상회 점수도 high(미만 전부)", () => {
    expect(sectionRank(100, [10, 20, 30])).toBe("high");
  });
});
