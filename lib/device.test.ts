import { describe, it, expect } from "vitest";
import { isMobileUserAgent, shouldRedirectMobileToToday } from "./device";

describe("isMobileUserAgent", () => {
  it("모바일 UA는 true", () => {
    expect(
      isMobileUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      ),
    ).toBe(true);
    expect(
      isMobileUserAgent(
        "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 Mobile Safari/537.36",
      ),
    ).toBe(true);
    expect(
      isMobileUserAgent(
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      ),
    ).toBe(true);
  });

  it("데스크톱 UA는 false", () => {
    expect(
      isMobileUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      ),
    ).toBe(false);
    expect(
      isMobileUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
      ),
    ).toBe(false);
  });

  it("헤더 없음(null/빈문자열)은 데스크톱 취급", () => {
    expect(isMobileUserAgent(null)).toBe(false);
    expect(isMobileUserAgent(undefined)).toBe(false);
    expect(isMobileUserAgent("")).toBe(false);
  });
});

describe("shouldRedirectMobileToToday (QC v6 ⑥ 세션당 1회)", () => {
  const MOBILE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
  const DESKTOP_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120";

  it("모바일 첫 진입(쿠키 없음, /)이면 리다이렉트", () => {
    expect(
      shouldRedirectMobileToToday({
        pathname: "/",
        userAgent: MOBILE_UA,
        hasTodaySeenCookie: false,
      }),
    ).toBe(true);
  });

  it("모바일 2회차(쿠키 있음)면 리다이렉트 안 함 — 메인 머무름", () => {
    expect(
      shouldRedirectMobileToToday({
        pathname: "/",
        userAgent: MOBILE_UA,
        hasTodaySeenCookie: true,
      }),
    ).toBe(false);
  });

  it("데스크톱은 쿠키 없어도 리다이렉트 안 함", () => {
    expect(
      shouldRedirectMobileToToday({
        pathname: "/",
        userAgent: DESKTOP_UA,
        hasTodaySeenCookie: false,
      }),
    ).toBe(false);
  });

  it("루트(/) 외 경로는 모바일·쿠키무관 리다이렉트 안 함", () => {
    expect(
      shouldRedirectMobileToToday({
        pathname: "/today",
        userAgent: MOBILE_UA,
        hasTodaySeenCookie: false,
      }),
    ).toBe(false);
  });
});
