import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { neisApiKey } from "./env";

/**
 * 런타임에 추가할 수 있는 키 (배포판 S5).
 *
 * 왜 DB 에 두는가: 배포판의 목표는 "교사가 Vercel 대시보드에 갈 일이 없다" 이다.
 * NEIS 인증키는 설치 시점에 없어도 되고 나중에 받아 오는 경우가 대부분이라,
 * 앱 안(세팅실 → 시스템 상태)에서 넣을 수 있어야 한다. 환경변수는 앱이 스스로
 * 바꿀 수 없으므로 app_secrets(0063)에 저장한다.
 *
 * 우선순위는 **env → DB** 다. 환경변수로 넣어 둔 배포(내 것 포함)는 그대로 동작한다.
 *
 * 보안: NEIS 키는 읽기 전용 공공데이터 조회용이고 서버에서만 쓰인다. app_secrets 는
 * RLS 로 전면 차단돼 있어 anon 키로 읽히지 않는다.
 */
const NEIS_ROW_KEY = "neis_api_key";

/**
 * 캐시 TTL 60초. 프로세스 수명 내내 캐시하면 교사가 방금 저장한 키가 이미 떠 있는
 * 인스턴스에 반영되지 않는다. 저장 직후 무효화도 하지만, 서버리스라 다른 인스턴스는
 * 그 호출을 못 받는다 — TTL 이 그 간극을 스스로 메운다.
 */
const TTL_MS = 60_000;
let cache: { value: string | null; at: number } | null = null;

export async function resolveNeisKey(): Promise<string | null> {
  const fromEnv = neisApiKey();
  if (fromEnv) return fromEnv;

  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  try {
    const [row] = await getDb()
      .select({ value: schema.appSecrets.value })
      .from(schema.appSecrets)
      .where(eq(schema.appSecrets.key, NEIS_ROW_KEY))
      .limit(1);
    const value = row?.value?.trim() || null;
    cache = { value, at: Date.now() };
    return value;
  } catch {
    // DB 를 못 읽어도 앱이 무너지면 안 된다 — 기능만 꺼진다.
    return null;
  }
}

/** 세팅실에서 저장. 빈 문자열이면 삭제(= 기능 끄기). */
export async function saveNeisKey(value: string): Promise<void> {
  const db = getDb();
  const trimmed = value.trim();
  if (!trimmed) {
    await db.delete(schema.appSecrets).where(eq(schema.appSecrets.key, NEIS_ROW_KEY));
  } else {
    await db
      .insert(schema.appSecrets)
      .values({ key: NEIS_ROW_KEY, value: trimmed })
      .onConflictDoUpdate({
        target: schema.appSecrets.key,
        set: { value: trimmed },
      });
  }
  cache = null;
}

/** env 로 고정돼 있어 앱에서 바꿀 수 없는 상태인가(안내 문구 분기용). */
export function neisKeyIsFromEnv(): boolean {
  return neisApiKey() !== null;
}

/** 테스트 전용 — 캐시 초기화. */
export function __resetNeisKeyCache(): void {
  cache = null;
}
