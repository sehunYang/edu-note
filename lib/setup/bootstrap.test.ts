import { describe, it, expect } from "vitest";
import { projectRefFromUrl, redirectUrlsFor } from "./bootstrap";

/**
 * 설치 마법사의 순수 로직 (배포판 S3).
 * Management API 호출은 네트워크라 여기서 다루지 않는다 — 실제 배포에서 확인한다.
 */

describe("projectRefFromUrl", () => {
  it("Supabase 프로젝트 URL 에서 ref 를 뽑는다", () => {
    expect(projectRefFromUrl("https://abcdefghijklmnopqrst.supabase.co")).toBe(
      "abcdefghijklmnopqrst",
    );
  });

  it("앞뒤 공백은 허용한다(붙여넣기 실수)", () => {
    expect(projectRefFromUrl("  https://abcdefghijklmnop.supabase.co  ")).toBe(
      "abcdefghijklmnop",
    );
  });

  it("Supabase 도메인이 아니면 null — 엉뚱한 곳에 토큰을 쓰지 않는다", () => {
    expect(projectRefFromUrl("https://evil.example.com")).toBeNull();
    expect(projectRefFromUrl("https://abcdefghijklmnop.supabase.co.evil.com")).toBeNull();
  });

  it("경로가 붙어 있으면 null — 정확히 프로젝트 루트만 인정", () => {
    expect(projectRefFromUrl("https://abcdefghijklmnop.supabase.co/rest/v1")).toBeNull();
  });

  it("http 는 거부한다", () => {
    expect(projectRefFromUrl("http://abcdefghijklmnop.supabase.co")).toBeNull();
  });

  it("빈 값이면 null", () => {
    expect(projectRefFromUrl("")).toBeNull();
  });
});

describe("redirectUrlsFor", () => {
  it("매직링크와 구글 콜백 주소를 모두 포함한다", () => {
    const urls = redirectUrlsFor("https://my-edu-note.vercel.app");
    expect(urls).toContain("https://my-edu-note.vercel.app/auth/confirm");
    expect(urls).toContain("https://my-edu-note.vercel.app/auth/callback");
  });

  it("끝 슬래시가 있어도 // 가 생기지 않는다", () => {
    const urls = redirectUrlsFor("https://my-edu-note.vercel.app/");
    expect(urls.every((u) => !u.includes(".app//"))).toBe(true);
  });

  it("배포마다 도메인이 달라도 그 도메인 기준으로 만든다", () => {
    expect(redirectUrlsFor("https://other.vercel.app")[0]).toBe(
      "https://other.vercel.app/auth/confirm",
    );
  });
});
