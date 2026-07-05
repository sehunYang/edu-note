import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 세션 갱신 + 단일 이메일 allowlist 강제 (계획 §3.2, AC — 본인 외 전면 차단).
 *
 * 미들웨어 matcher 가 /login·/auth·/p/·/api/health·정적자원을 제외하므로,
 * 여기 도달하는 모든 경로는 보호 대상이다. 로그인 안 했거나 ALLOWED_EMAIL 과
 * 다르면 /login 으로 리다이렉트한다.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims(): 비대칭 서명 키면 JWKS(캐시)로 로컬 검증(왕복 0회), legacy 대칭 키면
  // Auth 서버 검증 폴백 — getUser() 와 동일한 보안 수준을 왕복 없이 얻는다(지연 개선 ①).
  // 만료 토큰의 자동 갱신(쿠키 setAll)은 supabase-js 가 내부에서 그대로 수행한다.
  const { data, error } = await supabase.auth.getClaims();
  const claims = error ? null : (data?.claims ?? null);

  // fail-closed: ALLOWED_EMAIL 미설정이면 전면 차단. (미설정 시 아무 계정이나
  // 통과시키는 fail-open 은 env 누락 한 번으로 조용히 전체 개방되는 구조였음)
  const allowed = process.env.ALLOWED_EMAIL;
  const authorized = !!claims && !!allowed && claims.email === allowed;

  if (!authorized) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (claims && claims.email !== allowed) {
      url.searchParams.set("error", "forbidden");
    }
    return NextResponse.redirect(url);
  }

  return response;
}
