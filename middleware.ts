import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { shouldRedirectMobileToToday } from "@/lib/device";
import { checkPublicRateLimit } from "@/lib/public/rate-limit";

/**
 * 루트 미들웨어 (계획 §3.2, QC v4 #9). 보호 경로에서 세션 갱신 + allowlist 강제.
 * 제외: /login, /auth/*, /api/health, Next 정적자원·이미지.
 *
 * 공개 /p/* (보안점검 2026-07 ②): 세션 처리 없이 IP 레이트리밋만 적용한다 —
 * 미인증 표면의 토큰 스캔·플러딩이 DB 까지 내려가지 않도록 1차 차단(초과 시 429).
 *
 * QC v4: 인증 통과한 모바일 단말이 루트(/)로 진입하면 /today 로 리다이렉트한다.
 * 루트 외 경로는 영향 없음. 미인증(리다이렉트 응답)은 그대로 /login 흐름 유지.
 *
 * QC v6 ⑥(AC-6.2): "첫 진입만 /today, 이후 메인 접근 허용". 세션당 1회 쿠키
 * (today_seen, 세션 쿠키=브라우저 종료 시 만료)로 가드한다. 쿠키가 있으면 모바일이라도
 * / 에 그대로 머문다(매 요청 리다이렉트 제거).
 */
const TODAY_SEEN_COOKIE = "today_seen";

export async function middleware(request: NextRequest) {
  // 공개 토큰 페이지: 인증·세션 없음 — 레이트리밋만 걸고 통과(페이지 GET + 서버액션 POST 공통).
  if (request.nextUrl.pathname.startsWith("/p/")) {
    const ip =
      request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    if (!checkPublicRateLimit(ip)) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    }
    return NextResponse.next();
  }

  const response = await updateSession(request);

  // updateSession 이 리다이렉트(미인증→/login)를 반환했으면 그대로 통과.
  const isRedirect = response.headers.has("location");
  if (
    !isRedirect &&
    shouldRedirectMobileToToday({
      pathname: request.nextUrl.pathname,
      userAgent: request.headers.get("user-agent"),
      hasTodaySeenCookie: request.cookies.has(TODAY_SEEN_COOKIE),
    })
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/today";
    const redirectRes = NextResponse.redirect(url);
    // 세션 쿠키(maxAge/expires 미지정) — 이후 같은 세션에서는 / 접근 허용.
    redirectRes.cookies.set(TODAY_SEEN_COOKIE, "1", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    return redirectRes;
  }

  return response;
}

export const config = {
  matcher: [
    // 제외 프리픽스는 세그먼트 경계((?:/|$))로 끝나야 한다 — 안 그러면
    // /loginfoo, /authoring 같은 향후 경로가 의도치 않게 보호에서 빠진다.
    // /p/* 는 매칭에 포함하되 위 분기에서 세션 없이 레이트리밋만 적용한다.
    "/((?!_next/static|_next/image|favicon.ico|login(?:/|$)|auth(?:/|$)|api/health(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
