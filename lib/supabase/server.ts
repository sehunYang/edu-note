import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseUrl, supabaseAnonKey } from "@/lib/config/public-env";

/**
 * 서버 컴포넌트/액션/라우트용 Supabase 클라이언트 (계획 §3.2 인증).
 * 쿠키 기반 세션. anon 키는 NEXT_PUBLIC(브라우저 공개 가능) — RLS 로 보호됨.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // 서버 컴포넌트에서 set 호출 시 무시(미들웨어가 세션 갱신 담당).
          }
        },
      },
    },
  );
}
