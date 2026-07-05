import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { googleCalendarConnections } from "../schema/misc";

/**
 * 구글 캘린더 연동 자격증명 쿼리 계층 (구글 캘린더 동기화 계획 v4, 마이그 0049).
 * 교사 1인당 1행. 토큰은 암호문만 다루며 복호화는 lib/integrations/google-calendar.ts 책임.
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface GoogleConnectionRow {
  ownerId: string;
  refreshTokenEnc: string;
  accessTokenEnc: string | null;
  accessTokenExpiresAt: Date | null;
  calendarId: string;
  syncEnabled: boolean;
  lastError: string | null;
}

/** 연동 자격증명 단건 조회(없으면 null = 미연결). */
export async function getGoogleConnection(
  db: DB,
  ownerId: string,
): Promise<GoogleConnectionRow | null> {
  const [row] = await db
    .select({
      ownerId: googleCalendarConnections.ownerId,
      refreshTokenEnc: googleCalendarConnections.refreshTokenEnc,
      accessTokenEnc: googleCalendarConnections.accessTokenEnc,
      accessTokenExpiresAt: googleCalendarConnections.accessTokenExpiresAt,
      calendarId: googleCalendarConnections.calendarId,
      syncEnabled: googleCalendarConnections.syncEnabled,
      lastError: googleCalendarConnections.lastError,
    })
    .from(googleCalendarConnections)
    .where(eq(googleCalendarConnections.ownerId, ownerId))
    .limit(1);
  return row ?? null;
}

/**
 * 연동 upsert(최초 연결/재연결). 재연결 시 새 refresh token 으로 갈아끼우므로
 * 기존 access token 캐시는 무효화(null 리셋)하고 sync_enabled·last_error 도 초기화한다.
 */
export async function upsertGoogleConnection(
  db: DB,
  ownerId: string,
  refreshTokenEnc: string,
): Promise<void> {
  await db
    .insert(googleCalendarConnections)
    .values({ ownerId, refreshTokenEnc })
    .onConflictDoUpdate({
      target: googleCalendarConnections.ownerId,
      set: {
        refreshTokenEnc,
        accessTokenEnc: null,
        accessTokenExpiresAt: null,
        syncEnabled: true,
        lastError: null,
        updatedAt: new Date(),
      },
    });
}

/** 연동 해제(행 삭제). 이후 CRUD 는 구글 호출 0회(AC-10). */
export async function deleteGoogleConnection(
  db: DB,
  ownerId: string,
): Promise<void> {
  await db
    .delete(googleCalendarConnections)
    .where(eq(googleCalendarConnections.ownerId, ownerId));
}

/** 동기화 오류 상태만 갱신(성공 시 null 로 클리어). */
export async function setGoogleSyncError(
  db: DB,
  ownerId: string,
  message: string | null,
): Promise<void> {
  await db
    .update(googleCalendarConnections)
    .set({ lastError: message, updatedAt: new Date() })
    .where(eq(googleCalendarConnections.ownerId, ownerId));
}

/** access token 만료캐시 갱신(AC-12). */
export async function cacheAccessToken(
  db: DB,
  ownerId: string,
  accessTokenEnc: string,
  expiresAt: Date,
): Promise<void> {
  await db
    .update(googleCalendarConnections)
    .set({ accessTokenEnc, accessTokenExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(googleCalendarConnections.ownerId, ownerId));
}
