import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * 매직링크 착지점 (배포판 S3).
 *
 * 여기로 오는 형태가 두 가지다. 둘 다 받아야 한다.
 *
 * 1) `?code=...`  — **기본 이메일 템플릿**의 경우. 템플릿의 `{{ .ConfirmationURL }}` 은
 *    `/auth/v1/verify?token=..&type=..&redirect_to=..` 를 가리키고, Supabase 가 검증한
 *    뒤 redirect_to 로 되돌려보내면서 인가 코드를 붙인다. `@supabase/ssr` 은
 *    flowType 을 PKCE 로 고정하므로(createBrowserClient.js) 이 코드는 쿠키에 저장된
 *    verifier 와 함께 exchangeCodeForSession 으로 교환해야 한다.
 *
 * 2) `?token_hash=..&type=..` — 이메일 템플릿을 `{{ .TokenHash }}` 로 커스터마이즈한
 *    경우. verifyOtp 로 교환한다.
 *
 * ⚠ 2026-08-31 실배포에서 발견: 1)만 오는데 2)만 처리하고 있어서 로그인이 항상
 *    "링크가 만료됐을 수 있습니다"로 실패했다. 템플릿을 건드리지 않는 배포가 기본이므로
 *    code 경로가 오히려 주 경로다.
 *
 * 구글 OAuth 의 code 는 /auth/callback 이 처리한다(refresh token 캡처가 따로 있다).
 * 이 경로는 미들웨어 matcher 에서 제외된다(/auth).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  // 오픈 리다이렉트 방지: 내부 경로만 허용. "//host"·"/\host" 는 브라우저가
  // 프로토콜 상대 URL 로 해석해 외부로 이탈하므로 차단한다(/auth/callback 과 동일 규칙).
  const rawNext = searchParams.get("next") ?? "/";
  const next =
    rawNext.startsWith("/") &&
    !rawNext.startsWith("//") &&
    !rawNext.startsWith("/\\")
      ? rawNext
      : "/";

  const supabase = await createClient();

  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
