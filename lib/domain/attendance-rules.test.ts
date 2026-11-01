import { describe, it, expect } from "vitest";
import { isReportRequired } from "./attendance-rules";

/**
 * 신고서 필요 = (인정, 교외체험 자동 생성분 제외) OR (질병 AND 결석) OR (비고 '생리통').
 */
describe("isReportRequired", () => {
  it("질병결석만 신고서 필요", () => {
    expect(isReportRequired({ kind: "absent", reason: "illness" })).toBe(true);
  });

  it("질병의 지각/조퇴/결과는 불필요", () => {
    expect(isReportRequired({ kind: "late", reason: "illness" })).toBe(false);
    expect(isReportRequired({ kind: "early_leave", reason: "illness" })).toBe(
      false,
    );
    expect(isReportRequired({ kind: "absent_period", reason: "illness" })).toBe(
      false,
    );
  });

  it("인정(accepted)은 종류 무관 필요, 비고 없어도", () => {
    for (const kind of ["absent", "late", "early_leave", "absent_period"] as const) {
      expect(isReportRequired({ kind, reason: "accepted" })).toBe(true);
      expect(
        isReportRequired({ kind, reason: "accepted", fieldTripId: null }),
      ).toBe(true);
    }
  });

  it("교외체험이 만든 인정결석은 사후보고서로 받으므로 불필요", () => {
    expect(
      isReportRequired({
        kind: "absent",
        reason: "accepted",
        noteField: "체험학습",
        fieldTripId: "trip-1",
      }),
    ).toBe(false);
  });

  it("교외체험 출결이라도 인정이 아니거나 '생리통'이면 원래 규칙대로 필요", () => {
    expect(
      isReportRequired({ kind: "absent", reason: "illness", fieldTripId: "trip-1" }),
    ).toBe(true);
    expect(
      isReportRequired({
        kind: "absent",
        reason: "accepted",
        noteField: "생리통",
        fieldTripId: "trip-1",
      }),
    ).toBe(true);
  });

  it("미인정(무단)·기타 결석은 불필요", () => {
    expect(isReportRequired({ kind: "absent", reason: "unaccepted" })).toBe(
      false,
    );
    expect(isReportRequired({ kind: "absent", reason: "etc" })).toBe(false);
    expect(isReportRequired({ kind: "late", reason: "etc" })).toBe(false);
  });

  it("비고에 '생리통' 포함 시 종류·사유 무관 필요", () => {
    expect(
      isReportRequired({
        kind: "early_leave",
        reason: "etc",
        noteField: "생리통으로 조퇴",
      }),
    ).toBe(true);
    expect(
      isReportRequired({ kind: "late", reason: "unaccepted", noteField: "생리통" }),
    ).toBe(true);
  });

  it("비고가 무관한 텍스트면 영향 없음", () => {
    expect(
      isReportRequired({ kind: "late", reason: "etc", noteField: "감기" }),
    ).toBe(false);
  });
});
