import { describe, it, expect } from "vitest";
import {
  isSpecialTimetableEntry,
  isVacationEntry,
  vacationWeekdays,
  isDateInVacation,
  resolveVacationWeekdays,
  classifyWeeklyOverlay,
  learnSubjectAliases,
  buildAliasMapFromPairs,
  type OverlaySlot,
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
      "여름방학",
      "[보강]생명과학",
    ]) {
      expect(isSpecialTimetableEntry(s), s).toBe(true);
    }
  });

  it("정규 교과목은 false", () => {
    for (const s of [
      "일본어",
      "일어",
      "문학",
      "생명과학",
      "운동과 건강",
      "영어Ⅰ",
      "기하",
      "대수",
      "물리학",
      "화학",
      "사회", // '회' 오탐 방지
    ]) {
      expect(isSpecialTimetableEntry(s), s).toBe(false);
    }
  });

  it("빈 문자열은 false", () => {
    expect(isSpecialTimetableEntry("")).toBe(false);
  });
});

describe("isVacationEntry", () => {
  it("방학·휴업은 true", () => {
    for (const s of ["여름방학", "겨울방학", "재량휴업일", "휴업"]) {
      expect(isVacationEntry(s), s).toBe(true);
    }
  });
  it("수업·특별활동은 false(방학 아님)", () => {
    for (const s of ["물리학", "자율활동", "제헌절", "지필평가"]) {
      expect(isVacationEntry(s), s).toBe(false);
    }
  });
});

// 헬퍼: {weekday, period, subject} 슬롯 배열 생성.
function slots(rows: [number, number, string][]): OverlaySlot[] {
  return rows.map(([weekday, period, subject]) => ({ weekday, period, subject }));
}

describe("vacationWeekdays", () => {
  it("그 요일이 전부 방학이면 방학 요일 — 방학식 주간 회귀", () => {
    // 2026-07 실측 주간: 월·화 정상(화는 방학식날 자율활동 포함), 수~금 전교시 여름방학.
    const act = slots([
      [1, 1, "대수"],
      [2, 1, "대수"],
      [2, 3, "자율·자치활동"], // 화요일은 수업 있음 → 방학 아님
      [3, 1, "여름방학"],
      [3, 2, "여름방학"],
      [4, 1, "여름방학"],
      [5, 1, "여름방학"],
    ]);
    const out = vacationWeekdays(act);
    expect([...out].sort()).toEqual([3, 4, 5]);
  });

  it("한 교시라도 수업이면 방학 요일 아님", () => {
    const act = slots([
      [3, 1, "여름방학"],
      [3, 2, "물리학"], // 섞이면 방학 아님
    ]);
    expect(vacationWeekdays(act).has(3)).toBe(false);
  });

  it("데이터 없는 요일은 판정하지 않음", () => {
    expect(vacationWeekdays(slots([[1, 1, "대수"]])).size).toBe(0);
  });
});

describe("isDateInVacation", () => {
  const spans = [{ start: "2026-07-21", end: "2026-08-12" }];
  it("구간 안(양끝 포함)은 true", () => {
    expect(isDateInVacation("2026-07-21", spans)).toBe(true);
    expect(isDateInVacation("2026-08-01", spans)).toBe(true);
    expect(isDateInVacation("2026-08-12", spans)).toBe(true);
  });
  it("구간 밖은 false", () => {
    expect(isDateInVacation("2026-07-20", spans)).toBe(false);
    expect(isDateInVacation("2026-08-13", spans)).toBe(false);
  });
});

describe("resolveVacationWeekdays (NEIS 우선 + 날짜 폴백)", () => {
  const spans = [{ start: "2026-07-21", end: "2026-08-12" }];
  // 이번 주 = 7/20(월)~7/24(금).
  const thisWeek = {
    1: "2026-07-20",
    2: "2026-07-21",
    3: "2026-07-22",
    4: "2026-07-23",
    5: "2026-07-24",
  };
  // 다음 주(전부 방학) = 7/27(월)~7/31(금).
  const nextWeek = {
    1: "2026-07-27",
    2: "2026-07-28",
    3: "2026-07-29",
    4: "2026-07-30",
    5: "2026-07-31",
  };

  it("이번 주: NEIS 우선 — 방학식날(7/21 화)은 수업 있어 방학 아님", () => {
    // 월화 수업(화는 자율활동), 수목금 여름방학. academic_vacations 는 7/21부터지만
    // NEIS 가 우선이라 7/21(화)은 수업으로 정확히 살아난다.
    const act = slots([
      [1, 1, "대수"],
      [2, 1, "대수"],
      [2, 3, "자율활동"],
      [3, 1, "여름방학"],
      [4, 1, "여름방학"],
      [5, 1, "여름방학"],
    ]);
    const out = resolveVacationWeekdays(act, thisWeek, spans);
    expect([...out].sort()).toEqual([3, 4, 5]);
  });

  it("미래 방학주: NEIS 비어도 날짜로 전 요일 방학 판정", () => {
    const out = resolveVacationWeekdays([], nextWeek, spans);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("방학 아닌 정상 주간: NEIS 없고 날짜도 구간 밖이면 방학 없음", () => {
    const normalWeek = {
      1: "2026-09-07",
      2: "2026-09-08",
      3: "2026-09-09",
      4: "2026-09-10",
      5: "2026-09-11",
    };
    expect(resolveVacationWeekdays([], normalWeek, spans).size).toBe(0);
  });
});

describe("classifyWeeklyOverlay", () => {
  it("어휘 표기차는 별칭 학습으로 변화 아님(오탐 제거)", () => {
    // 표준 '일어'가 월·수·금 5교시. NEIS 는 전부 '일본어' → 별칭 일어→일본어 학습.
    const std = slots([
      [1, 5, "일어"],
      [3, 5, "일어"],
      [5, 5, "일어"],
    ]);
    const act = slots([
      [1, 5, "일본어"],
      [3, 5, "일본어"],
      [5, 5, "일본어"],
    ]);
    expect(classifyWeeklyOverlay(std, act).size).toBe(0);
  });

  it("특별활동 대체는 special", () => {
    const std = slots([[5, 4, "영ⅠA"]]);
    const act = slots([[5, 4, "제헌절"]]);
    const out = classifyWeeklyOverlay(std, act);
    expect(out.get("5::4")).toEqual({ kind: "special", actual: "제헌절" });
  });

  it("같은 날 교시 교환은 swap (별칭 정규화 후 판정)", () => {
    // 표준: 1교시 수학, 3교시 영어가 여러 요일 반복(별칭 최빈값 안정).
    const std = slots([
      [1, 1, "수학"],
      [1, 3, "영어"],
      [2, 1, "수학"],
      [2, 3, "영어"],
      [3, 1, "수학"],
      [3, 3, "영어"],
    ]);
    // 월요일만 1·3교시 교환. 화·수는 그대로(별칭 학습원 다수).
    const act = slots([
      [1, 1, "영어"],
      [1, 3, "수학"],
      [2, 1, "수학"],
      [2, 3, "영어"],
      [3, 1, "수학"],
      [3, 3, "영어"],
    ]);
    const out = classifyWeeklyOverlay(std, act);
    expect(out.get("1::1")).toEqual({ kind: "swap", actual: "영어" });
    expect(out.get("1::3")).toEqual({ kind: "swap", actual: "수학" });
    expect(out.has("2::1")).toBe(false); // 화요일 변화 없음
  });

  it("다른 정규과목으로 대체는 changed", () => {
    // 수학이 여러 요일 반복(별칭 수학→수학 안정) + 월 2교시만 물리학으로 대체.
    const std = slots([
      [1, 2, "수학"],
      [2, 2, "수학"],
      [3, 2, "수학"],
    ]);
    const act = slots([
      [1, 2, "물리학"],
      [2, 2, "수학"],
      [3, 2, "수학"],
    ]);
    const out = classifyWeeklyOverlay(std, act);
    expect(out.get("1::2")).toEqual({ kind: "changed", actual: "물리학" });
  });

  it("요일 전체가 NEIS 무데이터면 표준 폴백(미표시)", () => {
    const std = slots([
      [1, 1, "수학"],
      [1, 2, "국어"],
      [2, 1, "영어"], // 화요일은 NEIS 에 아예 없음 → 판정 불가
    ]);
    const act = slots([
      [1, 1, "수학"],
      [1, 2, "국어"],
    ]);
    const out = classifyWeeklyOverlay(std, act);
    expect(out.size).toBe(0);
  });

  it("표준 없는 칸은 미표시(범위 한정)", () => {
    const std = slots([[1, 1, "수학"]]);
    const act = slots([
      [1, 1, "수학"],
      [1, 5, "진로활동"], // 표준에 없는 칸 → 분류 대상 아님
    ]);
    expect(classifyWeeklyOverlay(std, act).size).toBe(0);
  });

  it("요일은 있는데 그 교시만 비면 '수업 없음'(단축) — 방학식날 회귀", () => {
    // 2026-07-21 실측: 3-2 는 1~3교시만 하고 하교. 표준 4교시가 정상 수업처럼 표시됐다.
    const std = slots([
      [2, 1, "생과"],
      [2, 2, "심리"],
      [2, 4, "생과"],
    ]);
    const act = slots([
      [2, 1, "생활과 과학"],
      [2, 2, "심리학"],
      [2, 3, "자율활동"],
      // 4교시 없음 = 단축으로 사라진 교시
    ]);
    const alias = new Map([
      ["생과", "생활과 과학"],
      ["심리", "심리학"],
    ]);
    const out = classifyWeeklyOverlay(std, act, alias);
    expect(out.get("2::4")).toEqual({ kind: "none", actual: "" });
    expect(out.has("2::1")).toBe(false); // 별칭 정규화 → 변화 없음
    expect(out.has("2::2")).toBe(false);
    expect(out.size).toBe(1);
  });

  it("중간이 비는 건 '수업 없음'이 아니다 — 창체·방과후 미등록 관행 오탐 방지", () => {
    // NEIS 에 7교시(창체)를 안 올리는 학교면, 요일 단위로만 판정할 경우 표준 7교시가
    // 매주 전 요일 '수업 없음'으로 뜬다. 뒤쪽 절삭만 단축으로 본다.
    const std = slots([
      [1, 1, "국어"],
      [1, 3, "수학"], // NEIS 최대(4)보다 앞의 구멍 → 무데이터로 취급
      [1, 7, "창체"], // 최대보다 뒤 → 절삭으로 판정
    ]);
    const act = slots([
      [1, 1, "국어"],
      [1, 2, "영어"],
      [1, 4, "체육"], // 3교시를 건너뛰고 등록된 상태
    ]);
    const out = classifyWeeklyOverlay(std, act);
    expect(out.has("1::3")).toBe(false);
    expect(out.get("1::7")).toEqual({ kind: "none", actual: "" });
  });

  it("누적 별칭 맵을 주입하면 이번주 데이터가 부실해도 어휘 정규화", () => {
    // 이번 주 표준·실제는 딱 1칸(일어→일본어)만 — 그 주만으론 별칭이 빈약하지만,
    // 여러 주치로 학습한 aliasMap 을 주입하면 정규화되어 변화 아님.
    const std = slots([[1, 5, "일어"]]);
    const act = slots([[1, 5, "일본어"]]);
    const alias = new Map([["일어", "일본어"]]);
    expect(classifyWeeklyOverlay(std, act, alias).size).toBe(0);
    // 별칭 없이 이번주만으로도 이 경우는 학습되지만(같은 칸), 주입 경로 동작 확인.
  });

  it("learnSubjectAliases: 여러 주치에서 최빈값 학습(특별활동 제외)", () => {
    const std = slots([
      [1, 5, "일어"],
      [2, 5, "일어"],
      [3, 5, "일어"],
    ]);
    // 3주치처럼: 대부분 일본어, 한 번 여름방학(특별→무시).
    const act = slots([
      [1, 5, "일본어"],
      [2, 5, "일본어"],
      [3, 5, "여름방학"],
    ]);
    const alias = learnSubjectAliases(std, act);
    expect(alias.get("일어")).toBe("일본어");
  });

  it("buildAliasMapFromPairs: SQL 집계 쌍에서 별칭(특별 제외)", () => {
    const alias = buildAliasMapFromPairs([
      { std: "일어", act: "일본어", count: 8 },
      { std: "일어", act: "여름방학", count: 3 }, // 특별 → 제외
      { std: "생명", act: "생명과학", count: 10 },
      { std: "생명", act: "물리학", count: 1 }, // 소수 정규 → 최빈 아님
    ]);
    expect(alias.get("일어")).toBe("일본어");
    expect(alias.get("생명")).toBe("생명과학");
  });

  it("실제 학교 어휘 혼합: 여름방학은 강조, 정규 표기차는 무시", () => {
    const std = slots([
      [3, 5, "일어"],
      [3, 6, "기하"],
      [1, 5, "일어"], // 별칭 학습원(정상일)
      [1, 6, "기하"],
    ]);
    const act = slots([
      [3, 5, "여름방학"],
      [3, 6, "여름방학"],
      [1, 5, "일본어"], // 표기차 → 별칭으로 동일
      [1, 6, "기하"],
    ]);
    const out = classifyWeeklyOverlay(std, act);
    expect(out.get("3::5")?.kind).toBe("special");
    expect(out.get("3::6")?.kind).toBe("special");
    expect(out.has("1::5")).toBe(false);
    expect(out.has("1::6")).toBe(false);
  });
});
