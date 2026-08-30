import "server-only";
import { createHmac } from "node:crypto";
import { supabaseSecretKey, databaseUrl } from "./env";

/**
 * 시크릿 파생 (배포판 S2).
 *
 * `env.ts` 에서 분리한 이유: env.ts 는 미들웨어(Edge 런타임)에서도 쓰이는데,
 * Edge 번들은 `node:crypto` 를 처리하지 못해 빌드가 깨진다. 파생은 Node 런타임에서만
 * 필요하므로 여기로 떼어 냈다.
 */

/**
 * 구글 refresh token 암호화 키(32바이트).
 *
 * 배포판에서는 교사에게 물을 수 없는 값이라, 명시 설정이 없으면 서버 시크릿에서
 * HKDF 로 파생한다. **명시 env 가 항상 우선** — 이미 그 키로 암호화된 토큰이
 * 저장돼 있는 배포(내 것)를 깨뜨리면 안 된다(AC-9).
 *
 * DB 에 저장하지 않는 이유: 암호문이 그 DB 안에 있다. 키를 같은 곳에 두면
 * 암호화가 의미를 잃는다. 그래서 env 에서만 파생한다.
 *
 * ⚠ 파생 모드에서 Supabase 키를 회전하면 저장된 토큰을 못 푼다. 그때는 파괴가
 * 아니라 "구글 재연동 필요" 로 처리한다(선택 기능이므로 무해).
 */
export function googleTokenEncKey(): Buffer | null {
  const explicit = process.env.GOOGLE_TOKEN_ENC_KEY?.trim() || null;
  if (explicit) {
    const key = Buffer.from(explicit, "base64");
    if (key.length !== 32) {
      throw new Error("GOOGLE_TOKEN_ENC_KEY는 base64 인코딩된 32바이트여야 합니다.");
    }
    return key;
  }
  const root = supabaseSecretKey() ?? databaseUrl();
  if (!root) return null;
  return deriveKey(root, "edu-note:google-token-enc:v1");
}

/** HMAC-SHA256 기반 파생(HKDF-Expand 1블록 = 32바이트). */
export function deriveKey(root: string, info: string): Buffer {
  return createHmac("sha256", root).update(info).digest();
}
