import { describe, it, expect } from "vitest";
import {
  resolvePlacement,
  DEFAULT_BOTH_PLACEMENT,
} from "./activity-placement";

describe("resolvePlacement", () => {
  it("단일 태그는 그대로 배치", () => {
    expect(resolvePlacement("autonomy")).toBe("autonomy");
    expect(resolvePlacement("career")).toBe("career");
  });

  it("both 는 기본 정책(자율 우선)으로 1곳 확정", () => {
    expect(resolvePlacement("both")).toBe(DEFAULT_BOTH_PLACEMENT);
    expect(resolvePlacement("both")).toBe("autonomy");
  });
});
