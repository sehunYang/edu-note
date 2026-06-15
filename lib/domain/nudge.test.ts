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
    sectionObservations: [
      {
        sectionKey: "sec1",
        sectionLabel: "수학 3-1",
        studentCounts: students,
        studentNames: { a: "10101 김가", b: "10102 이나", c: "10103 박다" },
      },
      {
        sectionKey: "sec2",
        sectionLabel: "수학 3-2",
        studentCounts: [
          { id: "d", recordCount: 1 },
          { id: "e", recordCount: 4 },
        ],
      },
    ],
    behaviorPendingStudentIds: ["x", "y"],
    pendingReportTiers: ["normal", "warning", "critical", "critical"],
  };
  const at = (hour: number) => new Date(2026, 5, 8, hour, 0, 0);

  it("오늘 분반 수업당 1개씩 추천(가중랜덤 1명 확정 + 후보 수)", () => {
    const r = assembleNudges(base, { now: at(10), rng: () => 0 });
    expect(r.unrecordedObservations).toEqual([
      {
        sectionKey: "sec1",
        sectionLabel: "수학 3-1",
        suggestedStudentId: "a",
        suggestedStudentName: "10101 김가",
        candidateCount: 3,
      },
      {
        sectionKey: "sec2",
        sectionLabel: "수학 3-2",
        suggestedStudentId: "d",
        suggestedStudentName: undefined,
        candidateCount: 2,
      },
    ]);
  });

  it("관찰 기록된 분반은 상위에서 제외되어 넛지 미생성(resolved-on-record)", () => {
    // sec1 만 전달 = sec2 는 오늘 이미 기록되어 제외된 상태를 모사.
    const r = assembleNudges(
      { ...base, sectionObservations: [base.sectionObservations[0]] },
      { now: at(10), rng: () => 0 },
    );
    expect(r.unrecordedObservations).toHaveLength(1);
    expect(r.unrecordedObservations[0].sectionKey).toBe("sec1");
  });

  it("수강생 없는 분반은 추천 미생성", () => {
    const r = assembleNudges(
      {
        ...base,
        sectionObservations: [
          { sectionKey: "empty", sectionLabel: "빈반", studentCounts: [] },
        ],
      },
      { now: at(10), rng: () => 0 },
    );
    expect(r.unrecordedObservations).toHaveLength(0);
  });

  it("행특 넛지는 종일 표시(16시 게이트 제거)", () => {
    const before = assembleNudges(base, { now: at(9), rng: () => 0 });
    const after = assembleNudges(base, { now: at(16), rng: () => 0 });
    expect(before.behaviorNotes).toEqual({ pendingCount: 2 });
    expect(after.behaviorNotes).toEqual({ pendingCount: 2 });
  });

  it("미제출 신고서 티어별 집계", () => {
    const r = assembleNudges(base, { now: at(16), rng: () => 0 });
    expect(r.pendingReports).toEqual({ total: 4, warning: 1, critical: 2 });
  });

  it("아무 넛지도 없으면 hasAny=false", () => {
    const r = assembleNudges(
      {
        sectionObservations: [],
        behaviorPendingStudentIds: [],
        pendingReportTiers: [],
      },
      { now: at(17) },
    );
    expect(r.hasAny).toBe(false);
    expect(r.unrecordedObservations).toHaveLength(0);
  });
});
