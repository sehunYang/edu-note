import "server-only";
import postgres from "postgres";
import {
  parsePublicPagePayload,
  type PublicPageState,
} from "./dto";

/**
 * 공개 페이지 service-role 어댑터 (계획 §3.2/§3.5).
 *
 * 이 모듈만이 공개 표면에서 RLS 를 우회하는 권한으로 DB 에 접근한다(service-role 독점).
 * 클라이언트가 전달하는 것은 토큰뿐이며, 단일 SQL 함수 `get_public_page` 가
 * 토큰을 하나의 student_year_id 로 해석한다. 반환 jsonb 는 추가로 TS allowlist
 * 파서를 통과시켜(심층방어) DTO 외 키를 제거한다.
 *
 * 주의: PUBLIC_DATABASE_URL 은 service-role 권한 커넥션. 인증 앱 표면과 분리.
 */
// 핫리로드/연결 누수 방지: 풀을 globalThis 에 캐시(앱 풀과 별도, service-role 전용).
const globalForPublic = globalThis as unknown as {
  _eduPublicPgClient?: ReturnType<typeof postgres>;
};
function publicSql() {
  const url = process.env.PUBLIC_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("PUBLIC_DATABASE_URL(또는 DATABASE_URL) 미설정");
  if (!globalForPublic._eduPublicPgClient) {
    globalForPublic._eduPublicPgClient = postgres(url, {
      prepare: false,
      max: 2,
      idle_timeout: 20,
    });
  }
  return globalForPublic._eduPublicPgClient;
}

export async function getPublicPage(token: string): Promise<PublicPageState> {
  const sql = publicSql();
  const rows = await sql<{ get_public_page: unknown }[]>`
    select get_public_page(${token}) as get_public_page
  `;
  const result = rows[0]?.get_public_page as
    | { state?: string; payload?: unknown }
    | null
    | undefined;

  const state = result?.state;
  if (state === "revoked") return { status: "revoked" };
  if (state === "expired") return { status: "expired" };
  if (state !== "ok") return { status: "not_found" };

  // 심층방어: SQL 이 무엇을 돌려주든 allowlist 파서로 DTO 키만 통과.
  return { status: "ok", payload: parsePublicPagePayload(result?.payload) };
}
