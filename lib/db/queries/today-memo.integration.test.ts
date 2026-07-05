import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { todayCalendarMemos } from "../schema/misc";
import {
  listTodayMemos,
  listTodayMemosInRange,
  createTodayMemo,
  updateTodayMemo,
  deleteTodayMemo,
} from "./today-memo";

/**
 * 오늘의학교 메모(today_calendar_memos) 시간 필드(start_time/end_time) 실DB
 * 통합 테스트 (구글 캘린더 동기화 계획 v4, 4단계 — 0049 마이그레이션 검증).
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const DATE = "2026-09-01";

describe.skipIf(!RUN)("today_calendar_memos 시간 필드", () => {
  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await db
      .delete(todayCalendarMemos)
      .where(eq(todayCalendarMemos.ownerId, owner));
    await sql.end();
  });

  it("시간 미지정 생성 — startTime/endTime 이 null(종일) 로 저장·조회된다", async () => {
    const { id } = await createTodayMemo(db, owner, DATE, "종일 메모");
    const rows = await listTodayMemos(db, owner, DATE);
    const row = rows.find((r) => r.id === id);
    expect(row).toMatchObject({ content: "종일 메모", startTime: null, endTime: null });
    await deleteTodayMemo(db, owner, id);
  });

  it("시간 지정 생성 — HH:MM:SS 형식으로 왕복 저장·조회된다", async () => {
    const { id } = await createTodayMemo(
      db,
      owner,
      DATE,
      "회의",
      "14:00",
      "15:00",
    );
    const rows = await listTodayMemos(db, owner, DATE);
    const row = rows.find((r) => r.id === id);
    // drizzle time 컬럼은 HH:MM:SS 문자열로 반환된다(초 단위 포함).
    expect(row?.startTime?.slice(0, 5)).toBe("14:00");
    expect(row?.endTime?.slice(0, 5)).toBe("15:00");
    await deleteTodayMemo(db, owner, id);
  });

  it("listTodayMemosInRange 도 시간 필드를 포함한다", async () => {
    const { id } = await createTodayMemo(db, owner, DATE, "범위조회", "09:00", null);
    const rows = await listTodayMemosInRange(db, owner, DATE, DATE);
    const row = rows.find((r) => r.id === id);
    expect(row?.startTime?.slice(0, 5)).toBe("09:00");
    expect(row?.endTime).toBeNull();
    await deleteTodayMemo(db, owner, id);
  });

  it("updateTodayMemo — 시간 인자를 다시 전달하면 유지되고, 생략하면 null로 리셋된다(주의)", async () => {
    const { id } = await createTodayMemo(db, owner, DATE, "원본", "10:00", "11:00");

    // 같은 시간을 다시 전달 — 유지.
    await updateTodayMemo(db, owner, id, "수정1", "10:00", "11:00");
    let row = (await listTodayMemos(db, owner, DATE)).find((r) => r.id === id);
    expect(row?.startTime?.slice(0, 5)).toBe("10:00");

    // 시간 인자 생략 — null로 리셋됨(app/(shell)/today/actions.ts 가 항상 현재
    // 편집값을 재전달해 이 리셋을 피하는 방식으로 설계됨 — events-calendar.tsx 참고).
    await updateTodayMemo(db, owner, id, "수정2");
    row = (await listTodayMemos(db, owner, DATE)).find((r) => r.id === id);
    expect(row?.content).toBe("수정2");
    expect(row?.startTime).toBeNull();
    expect(row?.endTime).toBeNull();

    await deleteTodayMemo(db, owner, id);
  });
});
