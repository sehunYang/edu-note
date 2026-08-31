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
 * 우선순위는 **DB → env** 다. 앱에서 저장한 값이 이긴다.
 *
 * 왜 DB 가 먼저인가(2026-08-31 변경): 둘 다 같은 교사가 넣는 값인데, 앱에서 저장하는
 * 쪽이 언제나 더 나중의 더 분명한 의사표시다. env 를 우선하면 배포 때 잘못 넣은 값을
 * 앱에서 고칠 수 없어 Vercel 대시보드로 내몰린다 — 배포판의 약속과 정반대다.
 * (실제로 Deploy 폼이 이 칸을 강제하는 바람에 임의값을 넣은 교사가 앱에서 고치지
 * 못하는 일이 있었다.) 앱에서 비우고 저장하면 다시 env 값으로 돌아간다.
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
  return (await storedNeisKey()) ?? neisApiKey();
}

/** app_secrets 에 저장된 값(없으면 null). 60초 캐시. */
async function storedNeisKey(): Promise<string | null> {
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

/** 지금 쓰이는 키가 어디서 왔는지. 화면 안내 문구를 가르는 데 쓴다. */
export type NeisKeySource = "app" | "env" | "none";

export async function neisKeySource(): Promise<NeisKeySource> {
  if (await storedNeisKey()) return "app";
  return neisApiKey() ? "env" : "none";
}

/**
 * 인증키가 실제로 통하는지 NEIS 에 물어본다.
 *
 * 왜 필요한가: 아무 문자열이나 넣어도 "켜짐"으로 보이면 교사는 연동이 됐다고 믿고
 * 학사일정이 안 나오는 이유를 영영 못 찾는다. 저장 전에 한 번 확인한다.
 *
 * 실측(2026-08-31): 잘못된 키는 HTTP 200 에 최상위 `RESULT.CODE = "ERROR-290"`
 * ("인증키가 유효하지 않습니다")을 돌려준다. 정상 키는 head 블록에 INFO-000 이 온다.
 * 참고로 NEIS 는 키가 아예 없어도 소량 조회는 허용한다 — 그래서 '무응답'이 아니라
 * ERROR 코드로 판별해야 한다.
 */
export async function verifyNeisKey(
  key: string,
): Promise<{ ok: boolean; message?: string }> {
  const params = new URLSearchParams({
    Type: "json",
    pIndex: "1",
    pSize: "5",
    SCHUL_NM: "한빛고등학교",
    KEY: key,
  });
  try {
    const res = await fetch(`https://open.neis.go.kr/hub/schoolInfo?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, message: `NEIS 응답 오류(HTTP ${res.status})` };
    const json = (await res.json()) as {
      RESULT?: { CODE?: string; MESSAGE?: string };
    };
    const code = json.RESULT?.CODE;
    if (code && code.startsWith("ERROR")) {
      return { ok: false, message: json.RESULT?.MESSAGE ?? code };
    }
    return { ok: true };
  } catch {
    // 네트워크 문제로 확인을 못 한 것뿐이다. 저장을 막지는 않는다.
    return { ok: true, message: "확인하지 못했습니다(네트워크). 값은 저장합니다." };
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

/** 환경변수에 값이 있는가(앱에서 비웠을 때 무엇으로 돌아가는지 안내용). */
export function neisKeyInEnv(): boolean {
  return neisApiKey() !== null;
}

/** 테스트 전용 — 캐시 초기화. */
export function __resetNeisKeyCache(): void {
  cache = null;
}
