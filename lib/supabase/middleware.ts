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

  // getUser() 는 Supabase 서버에 토큰을 검증한다(getSession 보다 안전).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const allowed = process.env.ALLOWED_EMAIL;
  const authorized = !!user && (!allowed || user.email === allowed);

  if (!authorized) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (user && allowed && user.email !== allowed) {
      url.searchParams.set("error", "forbidden");
    }
    return NextResponse.redirect(url);
  }

  return response;
}
