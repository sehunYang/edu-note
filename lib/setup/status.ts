import "server-only";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { siteUrl, cronSecret } from "@/lib/config/env";
import { supabaseUrl } from "@/lib/config/public-env";
import { resolveFeatures, type Features } from "@/lib/config/features";
import { neisKeyIsFromEnv } from "@/lib/config/runtime-key";
import { isBootstrapped } from "./bootstrap";

/**
 * 설치 상태 진단 (배포판 S5).
 *
 * v1 계획의 `npx edu-note-setup --doctor` 를 화면으로 옮긴 것이다. 교사가 터미널을
 * 열지 않아도 "무엇이 켜져 있고, 무엇이 빠졌고, 어떻게 채우는지"를 알 수 있어야
 * 지원 부담이 줄어든다.
 */
export interface SystemStatus {
  features: Features;
  neisFromEnv: boolean;
  cronSecretSet: boolean;
  bootstrapped: boolean;
  siteUrl: string | null;
  supabaseUrl: string;
  migrations: { applied: number; latest: string | null } | null;
  version: string | null;
}

export async function getSystemStatus(
  db: PostgresJsDatabase<typeof schema>,
  version: string | null,
): Promise<SystemStatus> {
  const [features, bootstrapped, migrations] = await Promise.all([
    resolveFeatures(),
    isBootstrapped(db),
    readMigrations(db),
  ]);

  return {
    features,
    neisFromEnv: neisKeyIsFromEnv(),
    cronSecretSet: cronSecret() !== null,
    bootstrapped,
    siteUrl: siteUrl(),
    supabaseUrl,
    migrations,
    version,
  };
}

/**
 * 적용된 마이그레이션 개수와 마지막 버전. 빌드 단계에서 자동 적용되므로 보통
 * 최신이지만, 빌드가 실패했거나 수동으로 손댄 배포를 알아채는 데 쓴다.
 */
async function readMigrations(
  db: PostgresJsDatabase<typeof schema>,
): Promise<{ applied: number; latest: string | null } | null> {
  try {
    const rows = (await db.execute(sql`
      select count(*)::int as applied, max(version) as latest from schema_migrations
    `)) as unknown as { applied: number; latest: string | null }[];
    const row = rows[0];
    return row ? { applied: Number(row.applied), latest: row.latest } : null;
  } catch {
    return null;
  }
}
