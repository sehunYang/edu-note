import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * 루트 미들웨어 (계획 §3.2). 보호 경로에서 세션 갱신 + allowlist 강제.
 * 제외: /login, /auth/*, 공개 /p/*, /api/health, Next 정적자원·이미지.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|login|auth|p/|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
