import { describe, it, expect } from "vitest";
import {
  parseClassLabel,
  collectSyncClasses,
  weekMonToFri,
} from "./neis-timetable-sync";

describe("parseClassLabel", () => {
  it("'2-9' → {grade:2, classNo:9}", () => {
    expect(parseClassLabel("2-9")).toEqual({ grade: 2, classNo: 9 });
  });
  it("공백 허용", () => {
    expect(parseClassLabel(" 1 - 12 ")).toEqual({ grade: 1, classNo: 12 });
  });
  it("형식 불명은 null", () => {
    expect(parseClassLabel("공통")).toBeNull();
    expect(parseClassLabel("2반")).toBeNull();
    expect(parseClassLabel("")).toBeNull();
  });
});

describe("collectSyncClasses", () => {
  it("담임반 ∪ 수업반, 중복 제거", () => {
    const out = collectSyncClasses({ grade: 2, classNo: 9 }, ["2-9", "2-7", "1-3"]);
    expect(out).toEqual([
      { grade: 2, classNo: 9 },
      { grade: 2, classNo: 7 },
      { grade: 1, classNo: 3 },
    ]);
  });
  it("담임반 없음(null)도 처리", () => {
    expect(collectSyncClasses(null, ["3-1"])).toEqual([{ grade: 3, classNo: 1 }]);
  });
  it("형식 불명 라벨은 무시", () => {
    expect(collectSyncClasses(null, ["공통", "2-2"])).toEqual([
      { grade: 2, classNo: 2 },
    ]);
  });
});

describe("weekMonToFri", () => {
  it("일요일 기준 이번 주 월~금", () => {
    // 2026-07-19는 일요일 → 그 주 월=07-13, 금=07-17.
    const out = weekMonToFri("2026-07-19");
    expect(out).toEqual({
      fromDate: "2026-07-13",
      toDate: "2026-07-17",
      fromYmd: "20260713",
      toYmd: "20260717",
    });
  });
  it("수요일 기준도 같은 주", () => {
    const out = weekMonToFri("2026-07-15");
    expect(out.fromDate).toBe("2026-07-13");
    expect(out.toDate).toBe("2026-07-17");
  });
});
