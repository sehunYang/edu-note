import { describe, it, expect } from "vitest";
import {
  attendanceSurge,
  gradeDrop,
  recordGap,
  todayKST,
  summarizeAlerts,
  entrySeverity,
  ATTENDANCE_SURGE_MIN,
  GRADE_DROP_POINTS,
  type AlertEntry,
  type AlertKind,
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

// ───────────────────────── summarizeAlerts ─────────────────────────

/** 테스트용 경보 엔트리 생성 헬퍼. */
function entry(name: string, ...kinds: AlertKind[]): AlertEntry {
  return {
    studentYearId: `sy-${name}`,
    name,
    reasons: kinds.map((kind) => ({ kind, text: `${kind} 사유` })),
  };
}

describe("summarizeAlerts — 경보 요약", () => {
  it("모집단 과반(>=50%)에서 난 종류는 systemic 으로 접고 개별에서 제거", () => {
    // 학생 4명 중 3명(75%)이 recordGap → 접힘
    const entries = [
      entry("가", "recordGap"),
      entry("나", "recordGap"),
      entry("다", "recordGap"),
      entry("라", "attendance"),
    ];
    const { individual, systemic } = summarizeAlerts(entries, 4);
    expect(systemic).toEqual([{ kind: "recordGap", count: 3, ratio: 0.75 }]);
    expect(individual).toHaveLength(1);
    expect(individual[0].name).toBe("라");
  });

  it("정확히 임계 비율(50%)이면 접는다(경계 포함)", () => {
    const entries = [entry("가", "recordGap"), entry("나", "recordGap")];
    const { individual, systemic } = summarizeAlerts(entries, 4);
    expect(systemic).toHaveLength(1);
    expect(systemic[0].ratio).toBe(0.5);
    expect(individual).toHaveLength(0);
  });

  it("임계 미만(49%)이면 개별 경보로 유지", () => {
    const entries = [entry("가", "recordGap")];
    const { individual, systemic } = summarizeAlerts(entries, 3);
    expect(systemic).toHaveLength(0);
    expect(individual).toHaveLength(1);
  });

  it("접힌 종류만 있던 학생은 개별 목록에서 사라지고, 다른 사유가 남으면 유지", () => {
    const entries = [
      entry("가", "recordGap"),
      entry("나", "recordGap"),
      entry("다", "recordGap", "gradeDrop"),
    ];
    const { individual } = summarizeAlerts(entries, 3);
    expect(individual).toHaveLength(1);
    expect(individual[0].name).toBe("다");
    // recordGap 사유는 제거되고 gradeDrop 만 남는다
    expect(individual[0].reasons.map((r) => r.kind)).toEqual(["gradeDrop"]);
  });

  it("심각도 내림차순 정렬(출결·성적 3점 > 기록공백 1점)", () => {
    const entries = [
      entry("약함", "recordGap"),
      entry("강함", "attendance", "gradeDrop"),
      entry("중간", "gradeDrop"),
    ];
    // cohort 를 크게 잡아 아무것도 접히지 않게 한다
    const { individual, systemic } = summarizeAlerts(entries, 100);
    expect(systemic).toHaveLength(0);
    expect(individual.map((e) => e.name)).toEqual(["강함", "중간", "약함"]);
  });

  it("심각도 동점이면 사유 수 → 이름(ko) 순", () => {
    const entries = [entry("나", "gradeDrop"), entry("가", "attendance")];
    const { individual } = summarizeAlerts(entries, 100);
    expect(individual.map((e) => e.name)).toEqual(["가", "나"]);
  });

  it("cohortSize 0 이면 비율 계산 불가 → 접지 않는다", () => {
    const entries = [entry("가", "recordGap")];
    const { individual, systemic } = summarizeAlerts(entries, 0);
    expect(systemic).toHaveLength(0);
    expect(individual).toHaveLength(1);
  });

  it("빈 입력 → 빈 결과", () => {
    expect(summarizeAlerts([], 10)).toEqual({ individual: [], systemic: [] });
  });

  it("한 학생이 같은 종류를 2건 가져도 종류 카운트는 1로 센다", () => {
    const entries = [
      entry("가", "gradeDrop", "gradeDrop"),
      entry("나", "attendance"),
      entry("다", "attendance"),
    ];
    // gradeDrop 은 1명(1/3=33%)이라 접히지 않아야 한다
    const { systemic } = summarizeAlerts(entries, 3);
    expect(systemic.map((s) => s.kind)).not.toContain("gradeDrop");
  });
});

describe("entrySeverity — 심각도 점수", () => {
  it("사유 가중치의 합", () => {
    expect(entrySeverity(entry("x", "attendance", "recordGap"))).toBe(4);
    expect(entrySeverity(entry("x"))).toBe(0);
  });
});

describe("summarizeAlerts — 실제 프로덕션 데이터 형태 회귀", () => {
  /**
   * 개선 전 통계실 실측: 학생 118명 전원이 경보 대상이었고, 사유는 딱 2종
   * ("관찰 0건" 86명 / "관찰·행특 0건" 32명)뿐이었다. 방학이라 수업이 없어
   * 관찰 기록이 0인 것이 당연한 상태였는데도 카드 118장이 8,553px(페이지의 57%)
   * 를 차지해 실제 통계 차트를 9.7화면 아래로 밀어냈다. 같은 입력에서 개별
   * 카드가 0장이 되고 요약 1줄만 남는지 고정한다.
   */
  it("모집단 100%가 같은 종류면 개별 카드 0장 + 요약 1줄", () => {
    const entries: AlertEntry[] = [
      ...Array.from({ length: 86 }, (_, i) => entry(`비담임${i}`, "recordGap")),
      ...Array.from({ length: 32 }, (_, i) => entry(`담임${i}`, "recordGap")),
    ];
    const { individual, systemic } = summarizeAlerts(entries, 118);
    expect(individual).toHaveLength(0);
    expect(systemic).toEqual([{ kind: "recordGap", count: 118, ratio: 1 }]);
  });

  it("같은 상황에서 진짜 이상(출결 급증·성적 급락)은 그대로 남는다", () => {
    const entries: AlertEntry[] = [
      ...Array.from({ length: 116 }, (_, i) => entry(`학생${i}`, "recordGap")),
      entry("출결급증", "recordGap", "attendance"),
      entry("성적급락", "recordGap", "gradeDrop"),
    ];
    const { individual, systemic } = summarizeAlerts(entries, 118);
    expect(systemic.map((s) => s.kind)).toEqual(["recordGap"]);
    // 기록 공백은 걷히고, 개입이 필요한 2명만 남는다
    expect(individual).toHaveLength(2);
    expect(individual.map((e) => e.name).sort()).toEqual(["성적급락", "출결급증"]);
    // 남은 사유에 recordGap 은 없다
    expect(
      individual.flatMap((e) => e.reasons.map((r) => r.kind)),
    ).not.toContain("recordGap");
  });
});
