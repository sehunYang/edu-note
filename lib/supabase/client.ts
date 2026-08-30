import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, supabaseAnonKey } from "@/lib/config/public-env";

/**
 * 브라우저용 Supabase 클라이언트 (로그인 버튼 등 클라이언트 컴포넌트 전용).
 * anon 키만 사용. 비밀키는 절대 클라이언트에 오지 않는다.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
