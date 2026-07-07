import { describe, it, expect } from "vitest";
import {
  classifyOne,
  classifySchedule,
  deriveVacationSpans,
  type ScheduleEntry,
} from "./calendar-keywords";

/**
 * 학사일정 키워드 분류 단위테스트 (QC v2 2-1 B).
 * classifyOne(제목 단건) + classifySchedule(시퀀스: 방학구간·휴업일·지필학기·미분류 경고).
 */
describe("classifyOne — 제목 단건", () => {
  it("지필: 1학기 중간고사 → exam 학기1 회차1", () => {
    expect(classifyOne("1학기 중간고사")).toEqual({
      eventKind: "exam",
      examSemester: 1,
      examOrdinal: 1,
    });
  });

  it("지필: 1차 지필평가(학기 미표기) → exam 회차1 학기 미상", () => {
    expect(classifyOne("1차 지필평가")).toEqual({
      eventKind: "exam",
      examSemester: undefined,
      examOrdinal: 1,
    });
  });

  it("수능·모의고사가 지필보다 우선: 전국연합학력평가 → mock_exam (exam 아님)", () => {
    expect(classifyOne("전국연합학력평가")).toEqual({ eventKind: "mock_exam" });
    expect(classifyOne("3월 모의고사")).toEqual({ eventKind: "mock_exam" });
    expect(classifyOne("대학수학능력시험")).toEqual({ eventKind: "mock_exam" });
  });

  it("방학식 → vacation, 동아리 → club, 자율/진로활동", () => {
    expect(classifyOne("여름방학식")).toEqual({ eventKind: "vacation" });
    expect(classifyOne("동아리 한마당")).toEqual({ eventKind: "club" });
    expect(classifyOne("자율활동의 날")).toEqual({ eventKind: "self_activity" });
    expect(classifyOne("진로활동 주간")).toEqual({ eventKind: "career_activity" });
  });

  it("수행평가는 지필 아님, 미분류는 null", () => {
    expect(classifyOne("국어 수행평가")).toBeNull();
    expect(classifyOne("졸업식")).toBeNull();
    expect(classifyOne("   ")).toBeNull();
  });
});

describe("classifySchedule — 시퀀스 분류", () => {
  function entry(
    date: string,
    title: string,
    isSchoolDay = true,
  ): ScheduleEntry {
    return { date, title, isSchoolDay };
  }
  function kindOf(list: ReturnType<typeof classifySchedule>, date: string) {
    return list.find((e) => e.date === date)!;
  }

  it("방학 구간: 방학식~개학식 사이 모든 일정 vacation, 개학식 당일은 제외", () => {
    const res = classifySchedule([
      entry("2026-07-20", "여름방학식"),
      entry("2026-07-25", "도서관 개방"), // 구간 내(키워드 없음) → vacation
      entry("2026-08-18", "2학기 개학식"), // 구간 종료, 당일은 vacation 아님
      entry("2026-08-20", "수업일 행사"),
    ]);
    expect(kindOf(res, "2026-07-20").eventKind).toBe("vacation");
    expect(kindOf(res, "2026-07-25").eventKind).toBe("vacation");
    expect(kindOf(res, "2026-08-18").eventKind).not.toBe("vacation");
    expect(kindOf(res, "2026-08-20").eventKind).not.toBe("vacation");
  });

  it("휴업일: 비수업일 ∧ 방학 아님 → holiday (국경일 등 키워드 불필요)", () => {
    const res = classifySchedule([
      entry("2026-08-15", "광복절", false), // 키워드 없음 + 비수업일 → holiday
    ]);
    expect(kindOf(res, "2026-08-15").eventKind).toBe("holiday");
  });

  it("방학 우선: 방학 구간 내 비수업일도 holiday 아닌 vacation", () => {
    const res = classifySchedule([
      entry("2026-07-20", "여름방학식"),
      entry("2026-07-26", "일요일", false), // 비수업일이지만 방학 구간 → vacation
      entry("2026-08-18", "개학식"),
    ]);
    expect(kindOf(res, "2026-07-26").eventKind).toBe("vacation");
  });

  it("지필 학기 8/15 자동(제목 명시 우선)", () => {
    const res = classifySchedule([
      entry("2026-05-01", "중간고사"), // 5월 → 1학기 자동
      entry("2026-11-01", "기말고사"), // 11월 → 2학기 자동
      entry("2026-11-05", "1학기 추가 지필"), // 제목 명시 → 1학기 우선
    ]);
    expect(kindOf(res, "2026-05-01")).toMatchObject({
      eventKind: "exam",
      examSemester: 1,
    });
    expect(kindOf(res, "2026-11-01")).toMatchObject({
      eventKind: "exam",
      examSemester: 2,
    });
    expect(kindOf(res, "2026-11-05").examSemester).toBe(1);
  });

  it("미분류(수업일·키워드 없음) → self_activity + needsReview", () => {
    const res = classifySchedule([entry("2026-09-02", "학생자치회의")]);
    const e = kindOf(res, "2026-09-02");
    expect(e.eventKind).toBe("self_activity");
    expect(e.needsReview).toBe(true);
  });

  it("자동 분류 성공 항목은 needsReview=false", () => {
    const res = classifySchedule([
      entry("2026-05-01", "중간고사"),
      entry("2026-08-15", "광복절", false),
    ]);
    expect(kindOf(res, "2026-05-01").needsReview).toBe(false);
    expect(kindOf(res, "2026-08-15").needsReview).toBe(false);
  });

  it("입력 순서 무관(정렬) — 역순 입력도 방학 구간 정확", () => {
    const res = classifySchedule([
      entry("2026-08-18", "개학식"),
      entry("2026-07-25", "도서관 개방"),
      entry("2026-07-20", "여름방학식"),
    ]);
    expect(kindOf(res, "2026-07-25").eventKind).toBe("vacation");
  });
});

describe("classifySchedule — cluster-local 방학 종료 (후속)", () => {
  function entry(
    date: string,
    title: string,
    isSchoolDay = true,
  ): ScheduleEntry {
    return { date, title, isSchoolDay };
  }
  function kindOf(list: ReturnType<typeof classifySchedule>, date: string) {
    return list.find((e) => e.date === date)!;
  }

  it("AC-1 개학 없음 → 마지막 '방학'일까지 방학, 그 이후는 비-방학(개학 간주)", () => {
    const res = classifySchedule([
      entry("2026-07-20", "여름방학식"), // opener
      entry("2026-07-25", "도서관 개방"), // 사이 중립 → vacation
      entry("2026-08-01", "방학중 보충수업"), // 방학 키워드(lastVac)
      entry("2026-08-10", "가을 소풍 준비"), // 마지막 방학일 이후 중립 → 비-방학
    ]);
    expect(kindOf(res, "2026-07-20").eventKind).toBe("vacation");
    expect(kindOf(res, "2026-07-25").eventKind).toBe("vacation");
    expect(kindOf(res, "2026-08-01").eventKind).toBe("vacation");
    const after = kindOf(res, "2026-08-10");
    expect(after.eventKind).not.toBe("vacation");
    expect(after.eventKind).toBe("self_activity"); // 수업일 중립 fallback
    expect(after.needsReview).toBe(true);
  });

  it("AC-3 cross-term merge 방지 — 닫힌 방학 뒤 학기는 삼키지 않음(떠도는 '방학' 공지 포함)", () => {
    const res = classifySchedule([
      entry("2026-07-20", "여름방학식"),
      entry("2026-08-20", "2학기 개학식"), // 여름 방학 종료
      entry("2026-09-10", "2학기 방학 안내문"), // 떠도는 '방학' 행 → 짧은 bounded 스팬만
      entry("2026-10-15", "중간고사"), // 가을학기 exam → vacation 으로 안 삼켜짐
    ]);
    expect(kindOf(res, "2026-10-15").eventKind).toBe("exam"); // 핵심: 학기 보존
    expect(kindOf(res, "2026-08-20").eventKind).not.toBe("vacation");
  });

  it("AC-4 경계 — 단일 방학행 / 마지막 entry 방학행 / 끝 인접 방학행 2개", () => {
    // (a) 단일 entry
    expect(classifySchedule([entry("2026-07-20", "여름방학식")])[0].eventKind).toBe(
      "vacation",
    );
    // (b) 배열 마지막 entry 가 방학행(이후 행 없음 — 내부 루프 미실행)
    const b = classifySchedule([
      entry("2026-05-01", "중간고사"),
      entry("2026-12-30", "겨울방학식"),
    ]);
    expect(kindOf(b, "2026-12-30").eventKind).toBe("vacation");
    expect(kindOf(b, "2026-05-01").eventKind).toBe("exam");
    // (c) 끝에 인접 방학행 2개
    const c = classifySchedule([
      entry("2026-12-28", "겨울방학식"),
      entry("2026-12-30", "방학중 등교일"),
    ]);
    expect(kindOf(c, "2026-12-28").eventKind).toBe("vacation");
    expect(kindOf(c, "2026-12-30").eventKind).toBe("vacation");
  });

  it("AC-6 중립 보간 — 마지막 방학일 이후 중립 school day=self_activity, 비수업일=holiday", () => {
    const res = classifySchedule([
      entry("2026-07-20", "여름방학식"),
      entry("2026-08-01", "방학중 보충수업"), // lastVac
      entry("2026-08-05", "교직원 연수"), // 이후 중립 수업일 → self_activity
      entry("2026-08-07", "임시 공휴일", false), // 이후 중립 비수업일 → holiday
      entry("2026-09-01", "동아리 발표회"), // club(positive)
    ]);
    expect(kindOf(res, "2026-08-05").eventKind).toBe("self_activity");
    expect(kindOf(res, "2026-08-07").eventKind).toBe("holiday");
    expect(kindOf(res, "2026-09-01").eventKind).toBe("club");
  });

  it("AC-7 방학 키워드 행은 isVac 분기로 소비(클러스터 확장, positive 로 안 끊김)", () => {
    const res = classifySchedule([
      entry("2026-07-20", "여름방학식"),
      entry("2026-07-28", "겨울방학 생활계획"), // '방학' 포함 → 확장(끊지 않음)
      entry("2026-08-18", "개학식"),
    ]);
    expect(kindOf(res, "2026-07-28").eventKind).toBe("vacation");
  });

  it("AC-8 알려진 한계 — 방학 중 키워드 보유(positive) 행은 클러스터를 조기 종료(교사 보정 전제)", () => {
    const res = classifySchedule([
      entry("2026-07-20", "여름방학식"),
      entry("2026-08-01", "여름 동아리 캠프"), // club(positive) → 클러스터 종료
    ]);
    expect(kindOf(res, "2026-08-01").eventKind).toBe("club"); // vacation 아님(의도된 동작)
  });

  it("AC-9 etc 는 자동 분류로 부여되지 않음(fallback 은 self_activity 유지)", () => {
    // classifyOne 은 어떤 입력에도 etc 를 반환하지 않는다.
    for (const t of ["졸업식", "개교기념 행사", "학부모 총회", "임의문구"]) {
      expect(classifyOne(t)?.eventKind).not.toBe("etc");
    }
    // 미분류 시퀀스 fallback 도 self_activity(needsReview), etc 아님.
    const res = classifySchedule([entry("2026-09-02", "학생자치회의")]);
    expect(res[0].eventKind).toBe("self_activity");
  });
});

describe("deriveVacationSpans — 방학 구간(주말 포함 밴드)", () => {
  function e(
    date: string,
    title: string,
    dayCategory: string | null = null,
  ): ScheduleEntry {
    return { date, title, isSchoolDay: dayCategory === null, dayCategory };
  }

  it("방학식~개학식: 구간=[방학식, 개학식 전날] 연속 범위(주말 자동 포함)", () => {
    const spans = deriveVacationSpans([
      e("2026-07-20", "여름방학식"),
      e("2026-08-18", "2학기 개학식"),
    ]);
    expect(spans).toEqual([{ start: "2026-07-20", end: "2026-08-17" }]);
  });

  it("취약점 보강 ①: 개학식 누락 → 마지막 방학 신호일까지(제목만 있어도)", () => {
    const spans = deriveVacationSpans([
      e("2026-07-20", "여름방학식"),
      e("2026-08-10", "방학중 보충수업"),
    ]);
    expect(spans).toEqual([{ start: "2026-07-20", end: "2026-08-10" }]);
  });

  it("취약점 보강 ②: 방학식/개학식 제목 없이 dayCategory='방학'만으로도 구간 도출", () => {
    const spans = deriveVacationSpans([
      e("2026-07-21", "", "방학"),
      e("2026-07-22", "도서관 개방", "방학"),
      e("2026-07-24", "", "방학"),
    ]);
    // 시작=첫 방학 신호, 종료=마지막 방학 신호(사이 주말은 렌더 시 범위로 포함).
    expect(spans).toEqual([{ start: "2026-07-21", end: "2026-07-24" }]);
  });

  it("취약점 보강 ③: dayCategory 방학 + 개학식 조합 → 개학 전날까지", () => {
    const spans = deriveVacationSpans([
      e("2026-12-24", "겨울방학식"),
      e("2026-12-28", "", "방학"),
      e("2027-02-01", "2027 개학식"),
    ]);
    expect(spans).toEqual([{ start: "2026-12-24", end: "2027-01-31" }]);
  });

  it("방학 중 학교 가동 신호(positive)는 구간 종료 — 마지막 방학일까지만", () => {
    const spans = deriveVacationSpans([
      e("2026-07-20", "여름방학식"),
      e("2026-08-01", "여름 동아리 캠프"), // club(positive) → 종료
    ]);
    expect(spans).toEqual([{ start: "2026-07-20", end: "2026-07-20" }]);
  });

  it("두 방학(여름·겨울)은 별개 구간으로 분리", () => {
    const spans = deriveVacationSpans([
      e("2026-07-20", "여름방학식"),
      e("2026-08-18", "개학식"),
      e("2026-12-24", "겨울방학식"),
      e("2027-02-02", "개학식"),
    ]);
    expect(spans).toEqual([
      { start: "2026-07-20", end: "2026-08-17" },
      { start: "2026-12-24", end: "2027-02-01" },
    ]);
  });

  it("방학 신호 없으면 빈 배열", () => {
    expect(deriveVacationSpans([e("2026-05-01", "중간고사")])).toEqual([]);
  });

  it("입력 순서 무관(정렬)", () => {
    const spans = deriveVacationSpans([
      e("2026-08-18", "개학식"),
      e("2026-07-20", "여름방학식"),
    ]);
    expect(spans).toEqual([{ start: "2026-07-20", end: "2026-08-17" }]);
  });
});
