import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * 서버 전용 Drizzle 클라이언트 (계획 §3.5 /lib/db).
 * Supabase Postgres(서울 ap-northeast-2). DATABASE_URL 은 서버 env only.
 */
// 연결 풀을 globalThis 에 캐시한다. 개발 중 Next.js 핫리로드가 모듈을 재평가해도
// 새 풀을 만들지 않고 재사용 → Supabase Session pooler 상한(pool_size 15) 초과 방지.
const globalForDb = globalThis as unknown as {
  _eduPgClient?: ReturnType<typeof postgres>;
};

function pgClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL 이 설정되지 않았습니다. 서버 env 에 등록하세요.");
  }
  if (!globalForDb._eduPgClient) {
    globalForDb._eduPgClient = postgres(url, {
      prepare: false, // Supabase 풀러는 prepared statement 비활성 권장
      max: 3, // 단일 교사 앱 — 풀러 상한 보호용 소수 연결
      // 유휴 반납 10분(지연 개선 ③): 교사 클릭 간격(수십초~수분)에 연결이 죽어
      // 매번 TCP+TLS+SCRAM 재연결 비용을 물던 것을 제거. Fluid Compute 인스턴스가
      // 살아있는 동안 연결을 유지한다. max 3 이라 풀러 상한(15) 여유 충분.
      idle_timeout: 600,
    });
  }
  return globalForDb._eduPgClient;
}

// 모듈 로드 시점이 아니라 최초 사용 시 연결을 만든다(빌드 타임 평가 회피).
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
export function getDb() {
  if (!_db) _db = drizzle(pgClient(), { schema, casing: "snake_case" });
  return _db;
}

export { schema };
