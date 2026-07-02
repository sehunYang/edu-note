import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * 인증 컨텍스트 → ownerId (계획 §3.2). owner_id = Supabase auth.uid().
 * 쿼리 계층은 ownerId 를 인자로 받으므로, 서버액션에서 이 값을 주입한다.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** 로그인 + allowlist 통과한 사용자의 id 를 반환. 아니면 throw(서버액션 가드). */
export async function getOwnerId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  // fail-closed: ALLOWED_EMAIL 미설정이면 거부 (미들웨어와 동일 정책).
  const allowed = process.env.ALLOWED_EMAIL;
  if (!allowed || user.email !== allowed) {
    throw new Error("허용되지 않은 계정입니다.");
  }
  return user.id;
}
