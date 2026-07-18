import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { checkPublicRateLimit } from "@/lib/public/rate-limit";

/**
 * 루트 미들웨어 (계획 §3.2). 보호 경로에서 세션 갱신 + allowlist 강제.
 * 제외: /login, /auth/*, /api/health, Next 정적자원·이미지.
 *
 * 공개 /p/* (보안점검 2026-07 ②): 세션 처리 없이 IP 레이트리밋만 적용한다 —
 * 미인증 표면의 토큰 스캔·플러딩이 DB 까지 내려가지 않도록 1차 차단(초과 시 429).
 */
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

  return updateSession(request);
}

export const config = {
  matcher: [
    // 제외 프리픽스는 세그먼트 경계((?:/|$))로 끝나야 한다 — 안 그러면
    // /loginfoo, /authoring 같은 향후 경로가 의도치 않게 보호에서 빠진다.
    // /p/* 는 매칭에 포함하되 위 분기에서 세션 없이 레이트리밋만 적용한다.
    // PWA 셸 자산(manifest/sw/오프라인 폴백)은 $ 앵커로 정확히 그 경로만 제외 —
    // 데이터가 아닌 정적 자산이라 미인증 접근이 안전하다(계획 pwa-installability, AC-6).
    "/((?!_next/static|_next/image|favicon.ico|login(?:/|$)|auth(?:/|$)|api/health(?:/|$)|api/cron(?:/|$)|manifest\\.webmanifest$|sw\\.js$|offline\\.html$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
