import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db";
import { upsertGoogleConnection } from "@/lib/db/queries";
import { encryptToken } from "@/lib/integrations/google-calendar";
import { allowedEmail } from "@/lib/config/env";

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
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // 증분 동의로 캘린더 스코프와 함께 로그인한 경우, 구글 refresh token 을
      // 암호화해 저장한다(계획 6단계). ALLOWED_EMAIL 일치 시에만 저장(fail-closed).
      const refreshToken = (data.session as any)?.provider_refresh_token as
        | string
        | undefined;
      if (
        refreshToken &&
        data.session?.user?.email &&
        data.session.user.email === allowedEmail()
      ) {
        const db = getDb();
        await upsertGoogleConnection(db, data.session.user.id, encryptToken(refreshToken));
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
