import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth 콜백 (계획 §3.2). Google 로그인 후 code 를 세션으로 교환하고 홈으로.
 * 이 경로는 미들웨어 matcher 에서 제외된다(/auth).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // 오픈 리다이렉트 방지: 내부 경로만 허용. "//host"·"/\host" 는 브라우저가
  // 프로토콜 상대 URL 로 해석해 외부로 이탈하므로 차단한다.
  const rawNext = searchParams.get("next") ?? "/";
  const next =
    rawNext.startsWith("/") &&
    !rawNext.startsWith("//") &&
    !rawNext.startsWith("/\\")
      ? rawNext
      : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
