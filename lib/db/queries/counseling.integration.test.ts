import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import { counselingLogs } from "../schema/misc";
import {
  createCounselingLog,
  listCounselingLogs,
  deleteCounselingLog,
} from "./counseling";

/**
 * 상담일지 실DB 통합 테스트 (Phase2-G). 작성·목록(최신일순)·삭제.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;
let studentYearId: string;

describe.skipIf(!RUN)("상담 — 일지 기록", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
    const [p] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: "박상담" })
      .returning({ id: persons.id });
    [{ id: studentYearId }] = await db
      .insert(studentYears)
      .values({
        ownerId: owner,
        personId: p.id,
        schoolYear: YEAR,
        sid: "20703",
        grade: 2,
        classNo: 7,
        number: 3,
        name: "박상담",
      })
      .returning({ id: studentYears.id });
  });

  afterAll(async () => {
    await db.delete(counselingLogs).where(eq(counselingLogs.ownerId, owner));
    await db.delete(studentYears).where(eq(studentYears.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner));
    await sql.end();
  });

  it("학생·학부모 상담 작성 후 최신일순 조회", async () => {
    await createCounselingLog(db, owner, {
      studentYearId,
      date: "2099-03-01",
      target: "student",
      body: "학습 습관 상담",
    });
    await createCounselingLog(db, owner, {
      studentYearId,
      date: "2099-03-10",
      target: "parent",
      body: "진로 관련 학부모 상담",
    });
    const list = await listCounselingLogs(db, owner, studentYearId);
    expect(list).toHaveLength(2);
    expect(list[0].date).toBe("2099-03-10"); // 최신일 먼저
    expect(list[0].target).toBe("parent");
  });

  it("상담 삭제", async () => {
    const created = await createCounselingLog(db, owner, {
      studentYearId,
      date: "2099-04-01",
      target: "student",
      body: "삭제될 상담",
    });
    await deleteCounselingLog(db, owner, created.id);
    const list = await listCounselingLogs(db, owner, studentYearId);
    expect(list.find((l) => l.id === created.id)).toBeUndefined();
  });
});
