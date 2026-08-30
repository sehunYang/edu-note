import "server-only";

/**
 * 서버 전용 환경변수 어댑터 (배포판 S2).
 *
 * 왜 필요한가: 배포판은 교사가 Vercel Marketplace 로 Supabase 를 붙여 만든다. 그때
 * 주입되는 변수 이름이 이 앱이 원래 읽던 이름과 다르다.
 *
 *   앱이 읽던 이름                 Marketplace 가 주는 이름
 *   ─────────────────────────────  ──────────────────────────────
 *   SUPABASE_SERVICE_ROLE_KEY      SUPABASE_SECRET_KEY
 *   DATABASE_URL                   POSTGRES_URL / POSTGRES_URL_NON_POOLING
 *
 * 어댑터가 없으면 원클릭 배포가 부팅부터 실패한다. **기존 이름을 항상 먼저 본다** —
 * 이미 운영 중인 배포(AC-9)가 영향을 받지 않아야 하기 때문.
 *
 * 값을 모듈 로드 시점에 고정하지 않고 함수로 읽는 이유: 빌드 타임 평가를 피하고,
 * 테스트에서 process.env 를 바꿔가며 검증할 수 있게 하기 위해서다.
 */

const pick = (...names: string[]): string | null => {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return null;
};

// ── DB ────────────────────────────────────────────────────────────────────────

/** 앱 쿼리용 접속 URL. 풀러(:6543)를 선호 — 요청당 짧은 커넥션이 많다. */
export function databaseUrl(): string | null {
  return pick("DATABASE_URL", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING");
}

/**
 * 공개 페이지(/p/[token]) 전용 접속 URL. RLS 를 우회하는 권한이라 앱 표면과 분리한다.
 * 전용 값이 없으면 앱 URL 로 폴백(현행 동작 유지).
 */
export function publicDatabaseUrl(): string | null {
  return pick("PUBLIC_DATABASE_URL") ?? databaseUrl();
}

// ── Supabase ──────────────────────────────────────────────────────────────────

/** service_role(=secret) 키. RLS 를 우회하므로 절대 클라이언트로 내보내지 않는다. */
export function supabaseSecretKey(): string | null {
  return pick("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
}

// ── 소유자 ────────────────────────────────────────────────────────────────────

/**
 * 로그인이 허용된 단 하나의 계정. 배포 시점에 Vercel env 로 고정되며, 이 값이
 * 앱 전체의 신뢰 기준점이다(설치 마법사가 이 이메일로만 초대장을 보낸다).
 * 미설정이면 null → 호출부는 통과가 아니라 **차단**해야 한다(fail-closed).
 */
export function allowedEmail(): string | null {
  return pick("ALLOWED_EMAIL", "OWNER_EMAIL");
}

// ── 선택 연동 ─────────────────────────────────────────────────────────────────

export function neisApiKey(): string | null {
  return pick("NEIS_API_KEY");
}

export function anthropicApiKey(): string | null {
  return pick("ANTHROPIC_API_KEY");
}

export function googleOAuth(): { clientId: string; clientSecret: string } | null {
  const clientId = pick("GOOGLE_CLIENT_ID");
  const clientSecret = pick("GOOGLE_CLIENT_SECRET");
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

// ── 크론 ──────────────────────────────────────────────────────────────────────

/**
 * 크론 인증 시크릿. 설정돼 있으면 Bearer 로 검증하고, 없으면 호출부가
 * Vercel 크론 내부 헤더로 판별한다(app/api/cron/* 참조).
 * 배포판은 입력칸을 늘리지 않으려고 선택으로 둔다.
 */
export function cronSecret(): string | null {
  return pick("CRON_SECRET");
}

// ── 사이트 주소 ───────────────────────────────────────────────────────────────

/**
 * 이 배포의 공개 주소(끝 슬래시 없음). 학생 링크·OG·설치 마법사의 리다이렉트 URL에
 * 쓰인다. 배포마다 도메인이 다르므로 Vercel 이 주는 값을 폴백으로 받는다.
 */
export function siteUrl(): string | null {
  const explicit = pick("NEXT_PUBLIC_SITE_URL", "SITE_URL");
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = pick("VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL");
  return vercel ? `https://${vercel.replace(/\/+$/, "")}` : null;
}
