import { describe, it, expect } from "vitest";
import { validateEvalWeights } from "./eval-weight";

/** 평가 비율 검증 단위테스트 (QC v1 C5). 100% 합·미시행 0 강제·수행 최대 5개. */
describe("validateEvalWeights", () => {
  it("수행 합 + 지필 = 100 이면 통과", () => {
    const r = validateEvalWeights({
      performance: [20, 20],
      jipilMid: 30,
      jipilFinal: 30,
      midEnabled: true,
      finalEnabled: true,
    });
    expect(r.ok).toBe(true);
    expect(r.total).toBe(100);
  });

  it("합이 100이 아니면 실패", () => {
    const r = validateEvalWeights({
      performance: [20],
      jipilMid: 30,
      jipilFinal: 30,
      midEnabled: true,
      finalEnabled: true,
    });
    expect(r.ok).toBe(false);
    expect(r.total).toBe(80);
    expect(r.errors.some((e) => e.includes("100"))).toBe(true);
  });

  it("기말 미시행인데 비율>0 이면 실패", () => {
    const r = validateEvalWeights({
      performance: [40],
      jipilMid: 60,
      jipilFinal: 10,
      midEnabled: true,
      finalEnabled: false,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("기말"))).toBe(true);
  });

  it("기말 미시행 + 비율 0 + 수행/중간 합 100 이면 통과", () => {
    const r = validateEvalWeights({
      performance: [40, 10],
      jipilMid: 50,
      jipilFinal: 0,
      midEnabled: true,
      finalEnabled: false,
    });
    expect(r.ok).toBe(true);
  });

  it("수행평가 6개면 실패(최대 5)", () => {
    const r = validateEvalWeights({
      performance: [10, 10, 10, 10, 10, 10],
      jipilMid: 40,
      jipilFinal: 0,
      midEnabled: true,
      finalEnabled: false,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("최대"))).toBe(true);
  });

  it("양 지필 미시행 + 수행만 100 이면 통과", () => {
    const r = validateEvalWeights({
      performance: [50, 30, 20],
      jipilMid: 0,
      jipilFinal: 0,
      midEnabled: false,
      finalEnabled: false,
    });
    expect(r.ok).toBe(true);
  });
});
