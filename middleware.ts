import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isMobileUserAgent } from "@/lib/device";

/**
 * 루트 미들웨어 (계획 §3.2, QC v4 #9). 보호 경로에서 세션 갱신 + allowlist 강제.
 * 제외: /login, /auth/*, 공개 /p/*, /api/health, Next 정적자원·이미지.
 *
 * QC v4: 인증 통과한 모바일 단말이 루트(/)로 진입하면 /today 로 리다이렉트한다.
 * 루트 외 경로는 영향 없음. 미인증(리다이렉트 응답)은 그대로 /login 흐름 유지.
 */
export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  // updateSession 이 리다이렉트(미인증→/login)를 반환했으면 그대로 통과.
  const isRedirect = response.headers.has("location");
  if (
    !isRedirect &&
    request.nextUrl.pathname === "/" &&
    isMobileUserAgent(request.headers.get("user-agent"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/today";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|login|auth|p/|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
