import { describe, it, expect } from "vitest";
import { electiveCandidates, type GradeOffering } from "./elective";

/**
 * 선택과목 후보 도출 단위 테스트 (AC-12.4).
 */
describe("electiveCandidates", () => {
  const offerings: GradeOffering[] = [
    { weekday: 1, period: 3, subjectName: "물리학Ⅱ" },
    { weekday: 1, period: 3, subjectName: "생활과학" },
    { weekday: 1, period: 3, subjectName: "국어" }, // 고정반
    { weekday: 1, period: 3, subjectName: "물리학Ⅱ" }, // 중복(다른 반)
    { weekday: 2, period: 1, subjectName: "지구과학" },
  ];
  const fixed = new Set(["국어", "수학"]);

  it("해당 (요일,교시) 의 선택과목 후보만, 고정반 제외, 중복 제거, 정렬", () => {
    expect(electiveCandidates(offerings, fixed, 1, 3)).toEqual([
      "물리학Ⅱ",
      "생활과학",
    ]);
  });

  it("다른 (요일,교시) 는 그 칸의 제공 과목만 본다", () => {
    expect(electiveCandidates(offerings, fixed, 2, 1)).toEqual(["지구과학"]);
  });

  it("제공 과목이 모두 고정반이면 빈 배열", () => {
    expect(
      electiveCandidates(
        [{ weekday: 3, period: 2, subjectName: "수학" }],
        fixed,
        3,
        2,
      ),
    ).toEqual([]);
  });

  it("해당 칸에 제공이 없으면 빈 배열", () => {
    expect(electiveCandidates(offerings, fixed, 5, 7)).toEqual([]);
  });

  it("fixedSubjects 를 배열로 받아도 동작한다", () => {
    expect(electiveCandidates(offerings, ["국어"], 1, 3)).toEqual([
      "물리학Ⅱ",
      "생활과학",
    ]);
  });
});
