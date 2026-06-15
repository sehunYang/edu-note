import { describe, it, expect } from "vitest";
import { computeProgressRates, progressColor } from "./progress";

describe("computeProgressRates", () => {
  it("차시 수 기준 비율(0..1)", () => {
    expect(
      computeProgressRates({
        plannedOrdinalsToToday: 10,
        actualDoneOrdinals: 8,
        examTargetTotalOrdinals: 20,
      }),
    ).toEqual({ targetRate: 0.5, actualRate: 0.4 });
  });
  it("분모 0 이하는 0으로 가드", () => {
    expect(
      computeProgressRates({
        plannedOrdinalsToToday: 5,
        actualDoneOrdinals: 3,
        examTargetTotalOrdinals: 0,
      }),
    ).toEqual({ targetRate: 0, actualRate: 0 });
  });
});

describe("progressColor", () => {
  it("2차시 이상 뒤지면 빨강", () => {
    expect(
      progressColor({ plannedOrdinalsToToday: 10, actualDoneOrdinals: 8 }),
    ).toBe("red");
    expect(
      progressColor({ plannedOrdinalsToToday: 10, actualDoneOrdinals: 7 }),
    ).toBe("red");
  });
  it("1차시 뒤짐 또는 앞서감은 초록", () => {
    expect(
      progressColor({ plannedOrdinalsToToday: 10, actualDoneOrdinals: 9 }),
    ).toBe("green");
    expect(
      progressColor({ plannedOrdinalsToToday: 10, actualDoneOrdinals: 10 }),
    ).toBe("green");
    expect(
      progressColor({ plannedOrdinalsToToday: 10, actualDoneOrdinals: 12 }),
    ).toBe("green");
  });
});
