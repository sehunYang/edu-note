import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * 매직링크 착지점 회귀 테스트.
 *
 * 왜 있는가: 2026-08-31 실배포에서 로그인이 항상 실패했다. 원인은 이 라우트가
 * `token_hash`(커스텀 템플릿용)만 읽는데 실제로는 `code`(기본 템플릿 + PKCE)가
 * 오기 때문이었다. "어떤 파라미터를 받아야 하는가"를 아무도 검증하지 않아
 * 배포까지 그대로 갔다. 그 계약을 여기서 고정한다.
 */
const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession, verifyOtp } }),
}));

async function get(query: string) {
  const { GET } = await import("./route");
  return GET(new NextRequest(`https://app.example.com/auth/confirm${query}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  exchangeCodeForSession.mockResolvedValue({ error: null });
  verifyOtp.mockResolvedValue({ error: null });
});

describe("기본 이메일 템플릿 경로 (?code=) — 실제로 오는 형태", () => {
  it("code 를 세션으로 교환하고 홈으로 보낸다", async () => {
    const res = await get("?code=abc123");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(res.headers.get("location")).toBe("https://app.example.com/");
  });

  it("next 가 있으면 그 내부 경로로 보낸다", async () => {
    const res = await get("?code=abc123&next=/today");
    expect(res.headers.get("location")).toBe("https://app.example.com/today");
  });
});

describe("커스텀 템플릿 경로 (?token_hash=)", () => {
  it("verifyOtp 로 교환한다", async () => {
    const res = await get("?token_hash=hash1&type=email");
    expect(verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "hash1" });
    expect(res.headers.get("location")).toBe("https://app.example.com/");
  });

  it("type 이 없으면 시도하지 않는다", async () => {
    const res = await get("?token_hash=hash1");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("/login?error=auth");
  });
});

describe("실패 처리", () => {
  it("파라미터가 아무것도 없으면 로그인으로 되돌린다", async () => {
    const res = await get("");
    expect(res.headers.get("location")).toBe(
      "https://app.example.com/login?error=auth",
    );
  });

  it("code 교환이 실패하면 token_hash 로 넘어간다", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("bad code") });
    const res = await get("?code=bad&token_hash=hash1&type=email");
    expect(verifyOtp).toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://app.example.com/");
  });

  it("둘 다 실패하면 로그인으로", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("x") });
    verifyOtp.mockResolvedValue({ error: new Error("y") });
    const res = await get("?code=bad&token_hash=h&type=email");
    expect(res.headers.get("location")).toContain("/login?error=auth");
  });
});

describe("오픈 리다이렉트 차단", () => {
  it("//evil.com 은 프로토콜 상대 URL 이라 차단한다", async () => {
    const res = await get("?code=ok&next=//evil.com");
    expect(res.headers.get("location")).toBe("https://app.example.com/");
  });

  it("/\\evil.com 도 차단한다", async () => {
    const res = await get("?code=ok&next=/%5Cevil.com");
    expect(res.headers.get("location")).toBe("https://app.example.com/");
  });

  it("절대 URL 은 차단한다", async () => {
    const res = await get("?code=ok&next=https://evil.com");
    expect(res.headers.get("location")).toBe("https://app.example.com/");
  });
});
