import { describe, it, expect } from "vitest";
import {
  selectionWeights,
  weightedPickLeastRecorded,
  assembleNudges,
  type RecordCountItem,
  type NudgeInput,
} from "./nudge";

const students: RecordCountItem[] = [
  { id: "a", recordCount: 0 },
  { id: "b", recordCount: 2 },
  { id: "c", recordCount: 5 },
];

describe("selectionWeights", () => {
  it("기록이 적을수록 가중치가 크다(항상 ≥1)", () => {
    const w = selectionWeights(students);
    // max=5 → weight = 5 - count + 1
    expect(w).toEqual([
      { id: "a", weight: 6 },
      { id: "b", weight: 4 },
      { id: "c", weight: 1 },
    ]);
  });

  it("빈 배열은 빈 가중치", () => {
    expect(selectionWeights([])).toEqual([]);
  });
});

describe("weightedPickLeastRecorded", () => {
  it("rng=0 이면 첫(최소기록) 후보", () => {
    expect(weightedPickLeastRecorded(students, () => 0)).toBe("a");
  });

  it("rng 가 끝쪽이면 마지막 후보(최다기록)", () => {
    // total=11, rng*11≈10.9 → a(6) b(4) 소진 후 c
    expect(weightedPickLeastRecorded(students, () => 0.999)).toBe("c");
  });

  it("exclude 된 학생은 후보에서 제외", () => {
    const r = weightedPickLeastRecorded(students, () => 0, ["a"]);
    expect(r).toBe("b"); // a 제외 후 최소기록
  });

  it("후보가 없으면 null", () => {
    expect(weightedPickLeastRecorded([], () => 0)).toBeNull();
    expect(weightedPickLeastRecorded(students, () => 0, ["a", "b", "c"])).toBeNull();
  });

  it("분포: 최소기록(a)이 최다기록(c)보다 자주 뽑힌다", () => {
    let aCount = 0;
    let cCount = 0;
    let seed = 0;
    // 결정론적 의사난수
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < 3000; i++) {
      const r = weightedPickLeastRecorded(students, rng);
      if (r === "a") aCount++;
      if (r === "c") cCount++;
    }
    expect(aCount).toBeGreaterThan(cCount);
  });
});

describe("assembleNudges", () => {
  const base: NudgeInput = {
    observationCounts: students,
    behaviorPendingStudentIds: ["x", "y"],
    pendingReportTiers: ["normal", "warning", "critical", "critical"],
  };
  const at = (hour: number) => new Date(2026, 5, 8, hour, 0, 0);

  it("미기록 수업 추천 1명(가중랜덤) + 후보 수", () => {
    const r = assembleNudges(base, { now: at(10), rng: () => 0 });
    expect(r.unrecordedObservation).toEqual({
      suggestedStudentId: "a",
      candidateCount: 3,
    });
  });

  it("행특 넛지는 16시 전엔 없음", () => {
    const r = assembleNudges(base, { now: at(15), rng: () => 0 });
    expect(r.behaviorNotes).toBeNull();
  });

  it("행특 넛지는 16시 후 미작성 수만큼", () => {
    const r = assembleNudges(base, { now: at(16), rng: () => 0 });
    expect(r.behaviorNotes).toEqual({ pendingCount: 2 });
  });

  it("미제출 신고서 티어별 집계", () => {
    const r = assembleNudges(base, { now: at(16), rng: () => 0 });
    expect(r.pendingReports).toEqual({ total: 4, warning: 1, critical: 2 });
  });

  it("아무 넛지도 없으면 hasAny=false", () => {
    const r = assembleNudges(
      {
        observationCounts: [],
        behaviorPendingStudentIds: [],
        pendingReportTiers: [],
      },
      { now: at(17) },
    );
    expect(r.hasAny).toBe(false);
    expect(r.unrecordedObservation).toBeNull();
  });
});
