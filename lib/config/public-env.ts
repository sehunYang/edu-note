/**
 * 브라우저에도 실리는 공개 환경변수 (배포판 S2).
 *
 * 왜 별도 파일인가: 서버 전용 값과 섞으면 `server-only` 가드를 걸 수 없다.
 * 여기 있는 값은 전부 공개돼도 안전한 것뿐이다(Supabase URL·anon 키는 RLS 로 보호).
 *
 * ⚠ Next 는 `process.env.NEXT_PUBLIC_*` **직접 참조**만 빌드 시점에 값으로 치환한다.
 * 그래서 폴백을 쓰려면 아래처럼 각 이름을 그대로 써야 한다. 변수로 받아 인덱싱하면
 * (`process.env[name]`) 치환이 안 돼 브라우저에서 undefined 가 된다.
 *
 * 이름이 두 벌인 이유: Vercel Marketplace 로 Supabase 를 붙이면 신규 키 체계
 * (`PUBLISHABLE`)로 주입되고, 직접 만든 프로젝트는 기존 이름(`ANON`)을 쓴다.
 * 배포판은 둘 다 받아야 한다. 기존 이름을 먼저 보는 이유는 이미 운영 중인 배포를
 * 건드리지 않기 위해서다.
 */

/** Supabase 프로젝트 URL. 두 체계 모두 이 이름을 쓴다. */
export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** 공개 키(anon = publishable). RLS 가 실제 보호막이므로 노출돼도 안전하다. */
export const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

/**
 * Supabase 접속 정보가 갖춰졌는가. 없으면 앱이 뜨자마자 인증에서 무너지므로,
 * 호출부가 알아보기 쉬운 메시지로 실패시키는 데 쓴다.
 */
export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

/** 설정이 없을 때 던질 공통 오류 — 스택 대신 할 일을 알려준다. */
export function assertSupabaseConfig(): void {
  if (hasSupabaseConfig) return;
  throw new Error(
    "Supabase 접속 정보가 없습니다. Vercel 프로젝트 환경변수에 " +
      "NEXT_PUBLIC_SUPABASE_URL 과 NEXT_PUBLIC_SUPABASE_ANON_KEY" +
      "(또는 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)를 등록한 뒤 다시 배포하세요.",
  );
}
