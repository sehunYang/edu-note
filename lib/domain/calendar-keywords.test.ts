import { describe, it, expect } from "vitest";
import {
  classifyOne,
  classifySchedule,
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
