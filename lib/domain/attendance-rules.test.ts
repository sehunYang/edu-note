import { describe, it, expect } from "vitest";
import { isReportRequired } from "./attendance-rules";

/**
 * QC v4 AC-4.1 — 신고서 필요 = (질병 AND 결석) OR (비고 '생리통').
 * 기존 규칙(absent 항상 필요, 인정 항상 필요)을 뒤집는다.
 */
describe("isReportRequired (QC v4)", () => {
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

  it("인정(accepted)은 이제 불필요(기존 규칙 반전)", () => {
    expect(isReportRequired({ kind: "absent", reason: "accepted" })).toBe(false);
    expect(isReportRequired({ kind: "late", reason: "accepted" })).toBe(false);
    expect(isReportRequired({ kind: "early_leave", reason: "accepted" })).toBe(
      false,
    );
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
