import { describe, it, expect } from "vitest";
import { isReportRequired } from "./attendance-rules";

describe("isReportRequired", () => {
  it("결석은 사유와 무관하게 항상 필요", () => {
    expect(isReportRequired({ kind: "absent", reason: "etc" })).toBe(true);
    expect(isReportRequired({ kind: "absent", reason: "unaccepted" })).toBe(
      true,
    );
    expect(isReportRequired({ kind: "absent", reason: "illness" })).toBe(true);
  });

  it("지각/조퇴/결과는 인정 사유일 때만 필요", () => {
    expect(isReportRequired({ kind: "late", reason: "accepted" })).toBe(true);
    expect(isReportRequired({ kind: "early_leave", reason: "accepted" })).toBe(
      true,
    );
    expect(isReportRequired({ kind: "absent_period", reason: "accepted" })).toBe(
      true,
    );
  });

  it("지각/조퇴/결과 + 비인정 사유는 불필요", () => {
    expect(isReportRequired({ kind: "late", reason: "illness" })).toBe(false);
    expect(isReportRequired({ kind: "early_leave", reason: "etc" })).toBe(false);
    expect(isReportRequired({ kind: "absent_period", reason: "unaccepted" })).toBe(
      false,
    );
  });

  it("비고에 '생리통' 포함 시 사유 무관 필요", () => {
    expect(
      isReportRequired({
        kind: "early_leave",
        reason: "illness",
        noteField: "생리통으로 조퇴",
      }),
    ).toBe(true);
    expect(
      isReportRequired({ kind: "late", reason: "etc", noteField: "생리통" }),
    ).toBe(true);
  });

  it("비고가 무관한 텍스트면 영향 없음", () => {
    expect(
      isReportRequired({ kind: "late", reason: "etc", noteField: "감기" }),
    ).toBe(false);
  });
});
