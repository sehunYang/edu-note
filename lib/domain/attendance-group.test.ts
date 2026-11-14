import { describe, it, expect } from "vitest";
import {
  collapseAbsenceGroups,
  groupAnchor,
  isJoinableAbsence,
} from "./attendance-group";

describe("groupAnchor — 묶음 추적은 서류가 필요한 마지막 날에", () => {
  it("가장 늦은 날짜의 서류 필요 행", () => {
    const rows = [
      { id: "a", date: "2026-11-02", reportRequired: true },
      { id: "c", date: "2026-11-04", reportRequired: true },
      { id: "b", date: "2026-11-03", reportRequired: true },
    ];
    expect(groupAnchor(rows)?.id).toBe("c");
  });

  it("마지막 날이 서류 불필요로 바뀌면 그 앞날로 옮긴다", () => {
    const rows = [
      { id: "a", date: "2026-11-02", reportRequired: true },
      { id: "b", date: "2026-11-03", reportRequired: true },
      { id: "c", date: "2026-11-04", reportRequired: false },
    ];
    expect(groupAnchor(rows)?.id).toBe("b");
  });

  it("서류 필요 행이 없으면 null(추적행 없음)", () => {
    expect(groupAnchor([{ id: "a", date: "2026-11-02", reportRequired: false }])).toBeNull();
    expect(groupAnchor([])).toBeNull();
  });
});

describe("collapseAbsenceGroups — 기간 결석은 서류 1건", () => {
  it("같은 묶음은 1건으로, 첫날 대표·마지막 날 기준", () => {
    const rows = [
      { id: "r2", date: "2026-11-03", absenceGroupId: "g1" },
      { id: "r1", date: "2026-11-02", absenceGroupId: "g1" },
      { id: "r3", date: "2026-11-05", absenceGroupId: "g1" },
    ];
    const out = collapseAbsenceGroups(rows);
    expect(out).toHaveLength(1);
    expect(out[0].first.id).toBe("r1");
    expect(out[0].lastDate).toBe("2026-11-05");
  });

  it("묶음 없는 행은 각자 1건 — 같은 날짜여도 합치지 않는다", () => {
    const rows = [
      { id: "x", date: "2026-11-02", absenceGroupId: null },
      { id: "y", date: "2026-11-02", absenceGroupId: null },
    ];
    const out = collapseAbsenceGroups(rows);
    expect(out).toHaveLength(2);
    for (const g of out) expect(g.lastDate).toBe(g.first.date);
  });

  it("다른 묶음·묶음 없는 행이 섞여도 따로 센다", () => {
    const rows = [
      { id: "a1", date: "2026-11-02", absenceGroupId: "A" },
      { id: "solo", date: "2026-11-02", absenceGroupId: null },
      { id: "b1", date: "2026-11-09", absenceGroupId: "B" },
      { id: "a2", date: "2026-11-03", absenceGroupId: "A" },
      { id: "b2", date: "2026-11-10", absenceGroupId: "B" },
    ];
    const out = collapseAbsenceGroups(rows);
    expect(out.map((g) => [g.first.id, g.lastDate])).toEqual([
      ["a1", "2026-11-03"],
      ["solo", "2026-11-02"],
      ["b1", "2026-11-10"],
    ]);
  });
});

describe("isJoinableAbsence — 따로 입력한 연속 결석을 묶을 수 있는가", () => {
  const base = {
    kind: "absent",
    reason: "illness",
    reportRequired: true,
    reportSubmitted: false,
    fieldTripId: null,
  };

  it("같은 사유의 미제출 결석끼리는 묶는다(비고는 보지 않는다)", () => {
    expect(isJoinableAbsence(base, { ...base })).toBe(true);
  });

  it("사유가 다르면 묶지 않는다", () => {
    expect(isJoinableAbsence(base, { ...base, reason: "accepted" })).toBe(false);
  });

  it("어느 한쪽이라도 이미 제출됐으면 묶지 않는다", () => {
    expect(isJoinableAbsence(base, { ...base, reportSubmitted: true })).toBe(false);
    expect(isJoinableAbsence({ ...base, reportSubmitted: true }, base)).toBe(false);
  });

  it("결석이 아니거나 서류가 필요 없거나 교외체험 결석이면 묶지 않는다", () => {
    expect(isJoinableAbsence(base, { ...base, kind: "late" })).toBe(false);
    expect(isJoinableAbsence({ ...base, kind: "early_leave" }, base)).toBe(false);
    expect(isJoinableAbsence(base, { ...base, reportRequired: false })).toBe(false);
    expect(isJoinableAbsence(base, { ...base, fieldTripId: "t1" })).toBe(false);
  });
});
