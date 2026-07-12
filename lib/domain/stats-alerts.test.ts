import { describe, it, expect } from "vitest";
import {
  attendanceSurge,
  gradeDrop,
  recordGap,
  todayKST,
  ATTENDANCE_SURGE_MIN,
  GRADE_DROP_POINTS,
} from "./stats-alerts";

/**
 * 통계실 이상징후 경보 도메인 단위 테스트(AD-1). 경계값(임계 정확히 일치·
 * 미달)과 담임/비담임 분기를 전수 확인. AI 미사용(순수 규칙).
 */

describe("attendanceSurge — 출결 급증", () => {
  it(`recent30=${ATTENDANCE_SURGE_MIN}(임계 경계) + 증가 → true`, () => {
    expect(attendanceSurge(3, 2)).toBe(true);
  });
  it("recent30=2(임계 미달) → 증가해도 false", () => {
    expect(attendanceSurge(2, 1)).toBe(false);
  });
  it("recent30=3, 증가 없음(prev30=3, 동일) → false", () => {
    expect(attendanceSurge(3, 3)).toBe(false);
  });
  it("recent30=3, 감소(prev30=4) → false", () => {
    expect(attendanceSurge(3, 4)).toBe(false);
  });
  it("recent30=5, prev30=0 → true(임계 이상+증가)", () => {
    expect(attendanceSurge(5, 0)).toBe(true);
  });
});

describe("gradeDrop — 성적 급락", () => {
  it(`정확히 ${GRADE_DROP_POINTS}점 하락(경계) → true`, () => {
    expect(gradeDrop(80, 65)).toBe(true);
  });
  it("14.99점 하락(임계 미달) → false", () => {
    expect(gradeDrop(80, 65.01)).toBe(false);
  });
  it("중간 null → false", () => {
    expect(gradeDrop(null, 65)).toBe(false);
  });
  it("기말 null → false", () => {
    expect(gradeDrop(80, null)).toBe(false);
  });
  it("둘 다 null → false", () => {
    expect(gradeDrop(null, null)).toBe(false);
  });
  it("상승(음수 낙폭) → false", () => {
    expect(gradeDrop(60, 80)).toBe(false);
  });
});

describe("recordGap — 기록 공백(최근 21일)", () => {
  it("담임 학생, 관찰 0·행특 0 → true", () => {
    expect(recordGap(0, 0, true)).toBe(true);
  });
  it("담임 학생, 관찰 0·행특 1(하나라도 있음) → false", () => {
    expect(recordGap(0, 1, true)).toBe(false);
  });
  it("담임 학생, 관찰 1·행특 0 → false", () => {
    expect(recordGap(1, 0, true)).toBe(false);
  });
  it("비담임(수업 학생), 관찰 0(행특 무관, 예: 5) → true", () => {
    expect(recordGap(0, 5, false)).toBe(true);
  });
  it("비담임(수업 학생), 관찰 1 → false", () => {
    expect(recordGap(1, 0, false)).toBe(false);
  });
});

describe("todayKST — Asia/Seoul 기준 오늘", () => {
  // 타임존 경계(자정 전후) 테스트는 Date 모킹 없이는 결정론적으로 검증하기
  // 어려워, 이 프로젝트에 기존 Date-mocking 관례가 없으므로(google-event.test.ts
  // 등도 실제 Date 인스턴스를 인자로 넘기는 방식만 사용) 형식/합리성 검증으로
  // 범위를 제한한다.
  it("YYYY-MM-DD 형식(길이 10, 하이픈 위치)의 문자열 반환", () => {
    const result = todayKST();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toHaveLength(10);
  });

  it("연도가 합리적 범위(2020~2100) 내", () => {
    const year = Number(todayKST().slice(0, 4));
    expect(year).toBeGreaterThanOrEqual(2020);
    expect(year).toBeLessThanOrEqual(2100);
  });
});
