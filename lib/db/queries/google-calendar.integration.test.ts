import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { googleCalendarConnections } from "../schema/misc";
import {
  getGoogleConnection,
  upsertGoogleConnection,
  deleteGoogleConnection,
  setGoogleSyncError,
  cacheAccessToken,
} from "./google-calendar";

/**
 * 구글 캘린더 연결(google_calendar_connections) 실DB 통합 테스트
 * (구글 캘린더 동기화 계획 v4, 4단계). owner_id 는 FK 없는 단순 uuid 컬럼이라
 * 다른 테이블 세팅 없이 임의 UUID로 독립 검증 가능.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();

describe.skipIf(!RUN)("google_calendar_connections 쿼리", () => {
  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await db
      .delete(googleCalendarConnections)
      .where(eq(googleCalendarConnections.ownerId, owner));
    await sql.end();
  });

  it("연결 없으면 null", async () => {
    expect(await getGoogleConnection(db, owner)).toBeNull();
  });

  it("upsert로 신규 생성 — 기본값(calendarId=primary, syncEnabled=true) 확인", async () => {
    await upsertGoogleConnection(db, owner, "enc-refresh-v1");
    const row = await getGoogleConnection(db, owner);
    expect(row).toMatchObject({
      ownerId: owner,
      refreshTokenEnc: "enc-refresh-v1",
      accessTokenEnc: null,
      calendarId: "primary",
      syncEnabled: true,
      lastError: null,
    });
  });

  it("cacheAccessToken — access token + 만료시각 저장", async () => {
    const expiresAt = new Date(Date.now() + 3600_000);
    await cacheAccessToken(db, owner, "enc-access-v1", expiresAt);
    const row = await getGoogleConnection(db, owner);
    expect(row?.accessTokenEnc).toBe("enc-access-v1");
    expect(row?.accessTokenExpiresAt?.getTime()).toBe(expiresAt.getTime());
  });

  it("setGoogleSyncError — 오류 기록 후 null로 해소", async () => {
    await setGoogleSyncError(db, owner, "구글 재연결 필요");
    expect((await getGoogleConnection(db, owner))?.lastError).toBe(
      "구글 재연결 필요",
    );
    await setGoogleSyncError(db, owner, null);
    expect((await getGoogleConnection(db, owner))?.lastError).toBeNull();
  });

  it("재연결(upsert) — refresh 교체 시 access 캐시·오류가 리셋된다", async () => {
    // 오류·access 캐시가 남아있는 상태에서 재연결.
    await cacheAccessToken(db, owner, "enc-access-stale", new Date());
    await setGoogleSyncError(db, owner, "이전 오류");
    await upsertGoogleConnection(db, owner, "enc-refresh-v2");
    const row = await getGoogleConnection(db, owner);
    expect(row).toMatchObject({
      refreshTokenEnc: "enc-refresh-v2",
      accessTokenEnc: null,
      accessTokenExpiresAt: null,
      syncEnabled: true,
      lastError: null,
    });
  });

  it("연결 해제 — 행 삭제", async () => {
    await deleteGoogleConnection(db, owner);
    expect(await getGoogleConnection(db, owner)).toBeNull();
  });
});
