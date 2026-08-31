import "server-only";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { allowedEmail, supabaseSecretKey, siteUrl } from "@/lib/config/env";
import { supabaseUrl } from "@/lib/config/public-env";

/**
 * 설치 마법사의 서버 로직 (배포판 S3).
 *
 * 왜 이 단계가 필요한가: 매직링크가 앱으로 돌아오려면 Supabase Auth 의 Site URL 과
 * 리다이렉트 허용목록에 이 배포의 주소가 들어 있어야 한다. 신규 프로젝트 기본값은
 * `http://localhost:3000` 이고, 이 설정은 Management API(=Access Token)로만 바꿀 수
 * 있다. Vercel Marketplace 통합은 환경변수만 동기화할 뿐 Auth 설정은 건드리지 않는다.
 *
 * 교사에게 Supabase 대시보드에서 설정 두 곳을 찾아 고치게 하는 것보다, 토큰 한 번
 * 붙여넣게 하는 쪽이 실패율이 훨씬 낮다. 그래서 앱 안으로 끌고 왔다.
 *
 * 보안: 토큰은 **어디에도 저장하지 않는다**(요청 처리 중 메모리에만 존재, 로그 금지).
 * 이 화면이 안전한 이유는 ALLOWED_EMAIL 이 Vercel env 로 이미 고정돼 있기 때문이다 —
 * 먼저 도달한 제3자가 자기 토큰을 넣어도 "이미 정해진 소유자 이메일"로 Auth 를
 * 설정할 수 있을 뿐, 자신에게 접근권을 줄 수 없다.
 */
type DB = PostgresJsDatabase<typeof schema>;

const BOOTSTRAP_KEY = "bootstrapped";
const MGMT = "https://api.supabase.com";

export interface StepResult {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface BootstrapResult {
  ok: boolean;
  steps: StepResult[];
  message?: string;
}

/** 설치가 이미 끝났는가. 끝났으면 /setup 은 영구 폐쇄된다. */
export async function isBootstrapped(db: DB): Promise<boolean> {
  try {
    const [row] = await db
      .select({ value: schema.appSecrets.value })
      .from(schema.appSecrets)
      .where(eq(schema.appSecrets.key, BOOTSTRAP_KEY))
      .limit(1);
    return row?.value === "true";
  } catch {
    // 테이블조차 없다면 아직 설치 전이다.
    return false;
  }
}

async function markBootstrapped(db: DB): Promise<void> {
  await db
    .insert(schema.appSecrets)
    .values({ key: BOOTSTRAP_KEY, value: "true" })
    .onConflictDoNothing();
}

/** `https://<ref>.supabase.co` 에서 프로젝트 ref 를 뽑는다. */
export function projectRefFromUrl(url: string): string | null {
  const m = /^https:\/\/([a-z0-9]{16,})\.supabase\.(co|in)$/i.exec(url.trim());
  return m ? m[1] : null;
}

/** 이 배포에서 매직링크가 돌아올 수 있어야 하는 주소들. */
export function redirectUrlsFor(origin: string): string[] {
  const base = origin.replace(/\/+$/, "");
  return [`${base}/auth/confirm`, `${base}/auth/callback`, `${base}/**`];
}

async function mgmt(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${MGMT}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

/**
 * 설치를 실행한다. 각 단계는 독립적으로 성공/실패를 보고하며, 치명적이지 않은
 * 실패(예: 이미 초대된 계정)는 전체를 중단시키지 않는다.
 *
 * @param accessToken Supabase 개인 액세스 토큰(`sbp_...`). 저장하지 않는다.
 * @param origin      이 배포의 주소. 요청 헤더에서 얻은 실제 오리진을 넘긴다.
 */
export async function runBootstrap(
  db: DB,
  accessToken: string,
  origin: string,
): Promise<BootstrapResult> {
  const steps: StepResult[] = [];
  const token = accessToken.trim();

  if (!/^sbp_[A-Za-z0-9]{16,}$/.test(token)) {
    return {
      ok: false,
      steps,
      message:
        "토큰 형식이 올바르지 않습니다. Supabase 대시보드에서 발급한 'sbp_' 로 시작하는 액세스 토큰을 붙여넣어 주세요.",
    };
  }

  const owner = allowedEmail();
  if (!owner) {
    return {
      ok: false,
      steps,
      message:
        "ALLOWED_EMAIL 이 설정되어 있지 않습니다. Vercel 프로젝트 환경변수에 본인 이메일을 등록한 뒤 다시 배포해 주세요.",
    };
  }

  const ref = projectRefFromUrl(supabaseUrl);
  if (!ref) {
    return {
      ok: false,
      steps,
      message: `Supabase 프로젝트 주소를 해석할 수 없습니다(${supabaseUrl || "미설정"}).`,
    };
  }

  const base = (siteUrl() ?? origin).replace(/\/+$/, "");

  // 1) Auth 설정 — Site URL·리다이렉트 허용목록·신규가입 차단
  const authRes = await mgmt(token, `/v1/projects/${ref}/config/auth`, {
    method: "PATCH",
    body: JSON.stringify({
      site_url: base,
      uri_allow_list: redirectUrlsFor(base).join(","),
      disable_signup: true,
      mailer_otp_exp: 3600,
    }),
  });
  steps.push({
    label: "로그인 주소 등록 + 신규가입 차단",
    ok: authRes.ok,
    detail: authRes.ok
      ? base
      : `Supabase 응답 ${authRes.status} — 토큰 권한을 확인해 주세요.`,
  });
  if (!authRes.ok) {
    return {
      ok: false,
      steps,
      message:
        "Supabase Auth 설정에 실패했습니다. 토큰이 이 프로젝트에 접근할 수 있는지 확인해 주세요.",
    };
  }

  // 2) 소유자 초대 — 신규가입을 막았으므로 이 계정만 로그인할 수 있다.
  steps.push(await inviteOwner(owner));

  // 3) 설치 완료 표시 — 이후 /setup 은 404
  try {
    await markBootstrapped(db);
    steps.push({ label: "설치 완료 표시", ok: true });
  } catch {
    steps.push({
      label: "설치 완료 표시",
      ok: false,
      detail: "DB 기록에 실패했습니다(설치 화면이 계속 열려 있을 수 있습니다).",
    });
  }

  return {
    ok: true,
    steps,
    message: `설정이 끝났습니다. ${owner} 으로 로그인해 주세요.`,
  };
}

/**
 * 소유자 계정을 만든다. service role 키로 Auth Admin API 를 호출한다.
 *
 * ⚠ 초대 메일(/auth/v1/invite)을 보내지 않는다. **Supabase 무료 프로젝트의 내장 메일은
 * 시간당 2통**뿐이라, 초대 메일 1통을 쓰면 교사가 로그인 링크를 두 번만 요청해도 429 로
 * 막힌다(2026-08-31 실배포에서 실제로 발생). 대신 `email_confirm: true` 로 **확인된
 * 계정을 메일 없이 바로 생성**한다. 교사는 로그인 화면에서 매직링크를 받으면 되고,
 * 받은편지함에 정체 모를 초대 메일이 하나 덜 쌓인다.
 *
 * 신규가입(disable_signup)을 막아 둬도 Admin API 는 통과한다 — 그게 이 키의 권한이다.
 * 이미 존재하는 계정이면 성공으로 본다(재실행 가능해야 한다).
 */
async function inviteOwner(email: string): Promise<StepResult> {
  const label = "소유자 계정 등록";
  const secret = supabaseSecretKey();
  if (!secret) {
    return {
      label,
      ok: false,
      detail: "SUPABASE_SERVICE_ROLE_KEY(또는 SUPABASE_SECRET_KEY)가 없습니다.",
    };
  }
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: secret,
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, email_confirm: true }),
      cache: "no-store",
    });
    if (res.ok) return { label, ok: true, detail: `${email} (메일 발송 없음)` };
    // 이미 등록된 사용자 — 재실행 시 정상 경로다.
    if (res.status === 422 || res.status === 409 || res.status === 400) {
      return { label, ok: true, detail: `${email} (이미 등록됨)` };
    }
    return { label, ok: false, detail: `Supabase 응답 ${res.status}` };
  } catch {
    return { label, ok: false, detail: "네트워크 오류" };
  }
}
