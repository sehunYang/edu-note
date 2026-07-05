import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * 구글 캘린더 연동 어댑터 (구글 캘린더 단방향 동기화 계획 3단계). refresh/access
 * token 암호화(AES-256-GCM)와 Calendar API v3 호출(insert/patch/delete)을
 * 캡슐화한다. 이 모듈은 네트워크·crypto를 다루므로 순수하지 않다 — 결정론 파생
 * id·payload 생성 등 순수 로직은 `lib/domain/google-event.ts` 참고.
 */

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3/calendars";

/** refreshAccessToken 실패 원인이 'invalid_grant'(재연결 필요)임을 구분하는 에러. */
export class GoogleAuthExpiredError extends Error {
  readonly code = "invalid_grant" as const;
  constructor(message = "구글 인증이 만료되어 재연결이 필요합니다.") {
    super(message);
    this.name = "GoogleAuthExpiredError";
  }
}

function getEncryptionKey(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENC_KEY;
  if (!raw) {
    throw new Error("GOOGLE_TOKEN_ENC_KEY 환경변수가 설정되지 않았습니다.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("GOOGLE_TOKEN_ENC_KEY는 base64 인코딩된 32바이트여야 합니다.");
  }
  return key;
}

/** AES-256-GCM 암호화. 저장 포맷: `base64(iv):base64(authTag):base64(ciphertext)`. */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * `encryptToken` 복호화. 형식이 깨졌거나 authTag 불일치(변조)면 그대로 throw한다
 * — "재연결 필요"로의 강등은 호출측 책임(계획 사전부검 2).
 */
export function decryptToken(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("잘못된 암호문 형식입니다.");
  }
  const [ivB64, authTagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}

/** refresh token으로 access token 갱신(AC-12). invalid_grant는 별도 타입으로 구분. */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(5000),
  });
  const json: { access_token?: string; expires_in?: number; error?: string } =
    await res.json().catch(() => ({}));
  if (!res.ok) {
    if (json.error === "invalid_grant") {
      throw new GoogleAuthExpiredError();
    }
    throw new Error(`구글 토큰 갱신 실패: HTTP ${res.status} ${json.error ?? ""}`);
  }
  return {
    accessToken: json.access_token!,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 0) * 1000),
  };
}

function eventsUrl(calendarId: string, eventId?: string): string {
  const base = `${CALENDAR_BASE}/${encodeURIComponent(calendarId)}/events`;
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
}

/**
 * 이벤트 생성(결정론 파생 id를 body의 `id`로 지정). 409(이미 존재·취소된 이벤트
 * 포함)면 `patchEvent`로 부활 폴백(AC-4/AC-11).
 */
export async function insertEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  payload: object,
): Promise<void> {
  const res = await fetch(eventsUrl(calendarId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...payload, id: eventId }),
    signal: AbortSignal.timeout(3000),
  });
  if (res.ok) return;
  if (res.status === 409) {
    await patchEvent(accessToken, calendarId, eventId, {
      ...payload,
      status: "confirmed",
    });
    return;
  }
  throw new Error(`구글 이벤트 생성 실패: HTTP ${res.status}`);
}

/** 이벤트 수정. 404/410(구글에서 이미 삭제됨)이면 `insertEvent`로 재생성 폴백(AC-11). */
export async function patchEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  payload: object,
): Promise<void> {
  const res = await fetch(eventsUrl(calendarId, eventId), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(3000),
  });
  if (res.ok) return;
  if (res.status === 404 || res.status === 410) {
    await insertEvent(accessToken, calendarId, eventId, payload);
    return;
  }
  throw new Error(`구글 이벤트 수정 실패: HTTP ${res.status}`);
}

/** 이벤트 삭제. 404/410은 이미 목표 달성으로 간주해 무시(AC-5). */
export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(eventsUrl(calendarId, eventId), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(3000),
  });
  if (res.ok || res.status === 404 || res.status === 410) return;
  throw new Error(`구글 이벤트 삭제 실패: HTTP ${res.status}`);
}
