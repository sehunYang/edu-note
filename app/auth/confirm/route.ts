import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * 매직링크 착지점 (배포판 S3).
 *
 * Supabase 가 보낸 메일의 링크는 `/auth/v1/verify` 를 거쳐 여기로 `token_hash`+`type`
 * 을 달고 돌아온다. 그 쌍을 세션으로 교환한다.
 *
 * 구글 OAuth 의 `?code=` 는 /auth/callback 이 담당한다 — 흐름이 달라 라우트를 나눴다.
 * 이 경로는 미들웨어 matcher 에서 제외된다(/auth).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // 오픈 리다이렉트 방지: 내부 경로만 허용. "//host"·"/\host" 는 브라우저가
  // 프로토콜 상대 URL 로 해석해 외부로 이탈하므로 차단한다(/auth/callback 과 동일 규칙).
  const rawNext = searchParams.get("next") ?? "/";
  const next =
    rawNext.startsWith("/") &&
    !rawNext.startsWith("//") &&
    !rawNext.startsWith("/\\")
      ? rawNext
      : "/";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
