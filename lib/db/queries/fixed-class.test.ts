import { describe, it, expect } from "vitest";
import { detectFixedClasses } from "./fixed-class";
import type { DecodedTimetable, TimetableSlot } from "@/lib/integrations/comcigan";

// 헬퍼: 담임반(2-9) 슬롯 합성. code/teacher 는 판별에 안 쓰이므로 더미.
function slot(
  grade: number,
  classNo: number,
  weekday: number,
  period: number,
  subject: string,
): TimetableSlot {
  return { grade, classNo, weekday, period, subject, teacher: "교사", code: 0 };
}
function decoded(slots: TimetableSlot[]): DecodedTimetable {
  return {
    schoolName: "테스트고",
    teachers: [],
    subjects: [],
    classCount: [],
    classTimes: [],
    slots,
    classSlots: [],
  };
}

describe("detectFixedClasses", () => {
  it("같은 칸에 과목 2개 이상이면 선택, 하나면 공통", () => {
    // 2-9 월1 = 대수 단독(공통). 월6 = 화학+생명(선택 — 반이 쪼개짐).
    const d = decoded([
      slot(2, 9, 1, 1, "대수"),
      slot(2, 9, 1, 6, "화학"),
      slot(2, 9, 1, 6, "생명"), // 같은 칸 두 번째 과목 → 선택
      slot(2, 9, 2, 1, "물리"),
    ]);
    const out = detectFixedClasses(d, 2, 9);
    const by = Object.fromEntries(out.map((r) => [r.subjectName, r.isFixed]));
    expect(by["대수"]).toBe(true);
    expect(by["물리"]).toBe(true);
    expect(by["화학"]).toBe(false);
    expect(by["생명"]).toBe(false);
  });

  it("한 과목이 어떤 칸은 단독, 다른 칸은 다중이면 선택으로 확정", () => {
    // 화학이 월3 단독으로 한 번 나오지만, 월6 에서 생명과 겹치면 선택.
    const d = decoded([
      slot(2, 9, 1, 3, "화학"),
      slot(2, 9, 1, 6, "화학"),
      slot(2, 9, 1, 6, "생명"),
    ]);
    const by = Object.fromEntries(
      detectFixedClasses(d, 2, 9).map((r) => [r.subjectName, r.isFixed]),
    );
    expect(by["화학"]).toBe(false); // 다중 칸에 한 번이라도 나오면 선택
  });

  it("다른 반 슬롯은 무시(담임반만 판별)", () => {
    const d = decoded([
      slot(2, 9, 1, 1, "대수"),
      slot(2, 8, 1, 1, "화학"), // 다른 반 — 2-9 판별에 영향 없어야
      slot(2, 8, 1, 1, "생명"),
    ]);
    const out = detectFixedClasses(d, 2, 9);
    expect(out).toEqual([{ subjectName: "대수", isFixed: true }]);
  });

  it("담임반 슬롯이 없으면 빈 배열", () => {
    expect(detectFixedClasses(decoded([slot(1, 1, 1, 1, "국어")]), 2, 9)).toEqual([]);
  });
});
