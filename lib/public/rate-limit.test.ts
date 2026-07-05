import { beforeEach, describe, expect, it } from "vitest";
import {
  checkPublicRateLimit,
  resetPublicRateLimit,
  RATE_MAX_PER_WINDOW,
  RATE_WINDOW_MS,
} from "./rate-limit";

describe("checkPublicRateLimit (공개 표면 IP 고정창 리밋)", () => {
  beforeEach(() => resetPublicRateLimit());

  it("창 내 한도까지 허용, 초과분은 거부", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_MAX_PER_WINDOW; i++) {
      expect(checkPublicRateLimit("1.2.3.4", t0 + i)).toBe(true);
    }
    expect(checkPublicRateLimit("1.2.3.4", t0 + RATE_MAX_PER_WINDOW)).toBe(
      false,
    );
  });

  it("창 경과 후 카운터 리셋", () => {
    const t0 = 1_000_000;
    for (let i = 0; i <= RATE_MAX_PER_WINDOW; i++) {
      checkPublicRateLimit("1.2.3.4", t0);
    }
    expect(checkPublicRateLimit("1.2.3.4", t0)).toBe(false);
    expect(checkPublicRateLimit("1.2.3.4", t0 + RATE_WINDOW_MS)).toBe(true);
  });

  it("IP 별 독립 카운터 — 한 IP 초과가 다른 IP 를 막지 않음", () => {
    const t0 = 1_000_000;
    for (let i = 0; i <= RATE_MAX_PER_WINDOW; i++) {
      checkPublicRateLimit("10.0.0.1", t0);
    }
    expect(checkPublicRateLimit("10.0.0.1", t0)).toBe(false);
    expect(checkPublicRateLimit("10.0.0.2", t0)).toBe(true);
  });
});
