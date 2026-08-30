import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { allowedEmail } from "@/lib/config/env";

/**
 * 인증 컨텍스트 → ownerId (계획 §3.2). owner_id = Supabase auth.uid().
 * 쿼리 계층은 ownerId 를 인자로 받으므로, 서버액션에서 이 값을 주입한다.
 *
 * 지연 개선(2026-07 ①): getUser()(요청마다 Auth 서버 HTTPS 왕복) 대신 getClaims().
 * 프로젝트가 비대칭 JWT 서명 키를 쓰면 JWKS(인메모리 캐시)로 **로컬 검증**(왕복 0회),
 * 아직 대칭 키(legacy)면 자동으로 Auth 서버 검증에 폴백한다 — 키 전환 전에도 안전.
 * React cache() 로 같은 요청 안(서버액션 + revalidate 리렌더, 다중 컴포넌트)의
 * 중복 검증을 1회로 dedup 한다.
 */

/** 앱이 실제로 쓰는 최소 인증 정보(id=auth.uid, email=allowlist 대조용). */
export interface AuthUser {
  id: string;
  email: string | null;
}

export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
});

/** 로그인 + allowlist 통과한 사용자의 id 를 반환. 아니면 throw(서버액션 가드). */
export async function getOwnerId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  // fail-closed: ALLOWED_EMAIL 미설정이면 거부 (미들웨어와 동일 정책).
  const allowed = allowedEmail();
  if (!allowed || user.email !== allowed) {
    throw new Error("허용되지 않은 계정입니다.");
  }
  return user.id;
}
