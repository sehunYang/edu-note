import { describe, it, expect } from "vitest";
import { detectFixedClasses } from "./fixed-class";
import type {
  DecodedTimetable,
  SimultaneousOffering,
  TimetableSlot,
} from "@/lib/integrations/comcigan";

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
function decoded(
  slots: TimetableSlot[],
  extra?: Partial<Pick<DecodedTimetable, "classSlots" | "simultaneousGroups">>,
): DecodedTimetable {
  return {
    schoolName: "테스트고",
    teachers: [],
    subjects: [],
    classCount: [],
    classTimes: [],
    slots,
    classSlots: extra?.classSlots ?? [],
    simultaneousGroups: extra?.simultaneousGroups ?? [],
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

// ── 신형(2026-08 2학기~): 동시그룹 기반 판별 ──
// 배경(실측): 신형 자료542 는 칸마다 반별 1과목만 실어 '같은 칸 다중=선택' 원리가 죽었다
// (전 과목 공통 오판). 대신 동시그룹 키가 이동수업 묶음을 명시한다.
describe("detectFixedClasses — 동시그룹(신형)", () => {
  const off = (grade: number, classNo: number, subjectName: string): SimultaneousOffering => ({
    grade,
    classNo,
    subjectName,
  });
  // 표준(classSlots): 2-9 는 역학(반 전체 공통)·세포(이동반 개설 교실)·미적Ⅰ.
  const classSlots = [
    slot(2, 9, 1, 1, "미적Ⅰ"),
    slot(2, 9, 1, 2, "세포"),
    slot(2, 9, 1, 4, "역학"),
  ];
  // 이동수업 묶음: 2-9 교실엔 세포, 2-7 엔 역학, 2-5/2-6 엔 일문·중문.
  const groups = [
    [off(2, 7, "역학"), off(2, 8, "물질"), off(2, 9, "세포")],
    [off(2, 5, "일문"), off(2, 6, "중문")],
  ];
  // 신형 542: 각 칸에 반별 1과목뿐(구형 원리로는 전부 단독=공통으로 보인다).
  const slots542 = [
    slot(2, 9, 1, 1, "미적Ⅰ"),
    slot(2, 9, 1, 2, "세포"),
    slot(2, 9, 1, 4, "역학"),
  ];

  it("동시그룹에 (이 학년, 이 반)으로 등장한 과목만 선택, 나머지 공통", () => {
    const d = decoded(slots542, { classSlots, simultaneousGroups: groups });
    const by = Object.fromEntries(
      detectFixedClasses(d, 2, 9).map((r) => [r.subjectName, r.isFixed]),
    );
    expect(by["세포"]).toBe(false); // 2-9 교실에서 도는 이동반
    expect(by["역학"]).toBe(true); // 2-7 교실 개설이지 2-9 에선 반 전체 공통
    expect(by["미적Ⅰ"]).toBe(true);
  });

  it("판별 소스는 표준(classSlots) — 금주(slots)가 조각·부재여도 동작", () => {
    const d = decoded([], { classSlots, simultaneousGroups: groups });
    const out = detectFixedClasses(d, 2, 9);
    expect(out).toHaveLength(3);
    expect(out.find((r) => r.subjectName === "세포")?.isFixed).toBe(false);
  });

  it("다른 반의 동시그룹 항목은 이 반 판별에 영향 없음", () => {
    const d = decoded([], {
      classSlots: [slot(2, 9, 1, 1, "일문")], // 2-9 의 일문은 반 전체 수업
      simultaneousGroups: groups, // 일문은 2-5 개설로만 등장
    });
    expect(detectFixedClasses(d, 2, 9)).toEqual([
      { subjectName: "일문", isFixed: true },
    ]);
  });

  it("동시그룹은 있는데 이 반 표준 과목이 없으면 구형 폴백(빈 배열)", () => {
    const d = decoded([], { classSlots: [slot(1, 1, 1, 1, "국어")], simultaneousGroups: groups });
    expect(detectFixedClasses(d, 2, 9)).toEqual([]);
  });

  it("동시그룹 부재(구형 데이터)면 기존 칸 다중 판별로 폴백", () => {
    const d = decoded(
      [slot(2, 9, 1, 6, "화학"), slot(2, 9, 1, 6, "생명")],
      { classSlots },
    );
    const by = Object.fromEntries(
      detectFixedClasses(d, 2, 9).map((r) => [r.subjectName, r.isFixed]),
    );
    expect(by["화학"]).toBe(false);
    expect(by["생명"]).toBe(false);
  });
});
