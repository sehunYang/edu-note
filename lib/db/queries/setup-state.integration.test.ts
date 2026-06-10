import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { setupState } from "../schema/misc";
import {
  getSetupState,
  markSetupComplete,
  clearSetupComplete,
  isStageUnlocked,
  getStageStatuses,
} from "./setup-state";

/**
 * 세팅실 게이팅 헬퍼 실DB 통합 테스트 (AC-0.1).
 * RUN_DB_ITEST=1 + DATABASE_URL 일 때만 실행. owner=uuid 로 격리, afterAll 정리.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();

describe.skipIf(!RUN)("세팅실 순차 게이팅 — setup_state", () => {
  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await db.delete(setupState).where(eq(setupState.ownerId, owner));
    await sql.end();
  });

  it("초기 상태: 첫 단계(year)만 해제, 나머지 잠금", async () => {
    expect(await isStageUnlocked(db, owner, "year")).toBe(true);
    expect(await isStageUnlocked(db, owner, "profile")).toBe(false);
    expect(await isStageUnlocked(db, owner, "calendar")).toBe(false);
    expect(await isStageUnlocked(db, owner, "students")).toBe(false);
    expect(await isStageUnlocked(db, owner, "courses")).toBe(false);
  });

  it("선행 단계 완료 시 다음 단계 해제(순차)", async () => {
    await markSetupComplete(db, owner, "year");
    expect(await isStageUnlocked(db, owner, "profile")).toBe(true);
    // 그러나 그 다음 단계는 여전히 잠금
    expect(await isStageUnlocked(db, owner, "calendar")).toBe(false);

    await markSetupComplete(db, owner, "profile");
    expect(await isStageUnlocked(db, owner, "calendar")).toBe(true);
    expect(await isStageUnlocked(db, owner, "students")).toBe(false);
  });

  it("markSetupComplete 는 멱등(중복 행 없음) + completedAt 기록", async () => {
    await markSetupComplete(db, owner, "year");
    const state = await getSetupState(db, owner);
    expect(state.year).toBeInstanceOf(Date);
    const rows = await db
      .select({ id: setupState.id })
      .from(setupState)
      .where(eq(setupState.ownerId, owner));
    // year, profile 두 단계만 존재(year 재기록해도 중복 없음)
    expect(rows.length).toBe(2);
  });

  it("clearSetupComplete 후 후속 단계 재잠금", async () => {
    await clearSetupComplete(db, owner, "profile");
    expect(await isStageUnlocked(db, owner, "calendar")).toBe(false);
    // year 는 여전히 완료 → profile 자체는 해제 상태
    expect(await isStageUnlocked(db, owner, "profile")).toBe(true);
  });

  it("getStageStatuses 가 완료/해제 위계를 반영", async () => {
    // 현재: year=완료, profile=미완료
    const statuses = await getStageStatuses(db, owner);
    const byFeature = Object.fromEntries(statuses.map((s) => [s.feature, s]));
    expect(byFeature.year).toMatchObject({ completed: true, unlocked: true });
    expect(byFeature.profile).toMatchObject({ completed: false, unlocked: true });
    expect(byFeature.calendar).toMatchObject({ completed: false, unlocked: false });
  });
});
