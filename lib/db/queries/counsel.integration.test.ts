import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import { counselingLogs, counselSlots, counselReservations } from "../schema/misc";
import {
  createCounselingLog,
  updateCounselingLog,
  openCounselSlot,
  closeCounselSlot,
  listCounselSlots,
  reserveCounselSlot,
  cancelReservation,
} from "./counseling";

/**
 * 상담실 슬롯 예약·기록수정 통합 테스트 (AC-9.2, AC-9.3, US-B9).
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;
let sy1: string;
let sy2: string;

describe.skipIf(!RUN)("상담실 — 슬롯 예약·기록 수정", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });

    const [p1] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: "김예약" })
      .returning({ id: persons.id });
    const [p2] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: "이예약" })
      .returning({ id: persons.id });

    [{ id: sy1 }] = await db
      .insert(studentYears)
      .values({
        ownerId: owner,
        personId: p1.id,
        schoolYear: YEAR,
        sid: "20901",
        grade: 2,
        classNo: 9,
        number: 1,
        name: "김예약",
      })
      .returning({ id: studentYears.id });

    [{ id: sy2 }] = await db
      .insert(studentYears)
      .values({
        ownerId: owner,
        personId: p2.id,
        schoolYear: YEAR,
        sid: "20902",
        grade: 2,
        classNo: 9,
        number: 2,
        name: "이예약",
      })
      .returning({ id: studentYears.id });
  });

  afterAll(async () => {
    await db
      .delete(counselReservations)
      .where(eq(counselReservations.ownerId, owner));
    await db.delete(counselSlots).where(eq(counselSlots.ownerId, owner));
    await db
      .delete(counselingLogs)
      .where(eq(counselingLogs.ownerId, owner));
    await db.delete(studentYears).where(eq(studentYears.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner));
    await sql.end();
  });

  // ── (a) 정원 내 예약 성공 ──────────────────────────────────────────────────

  it("(a) 슬롯 개설 후 정원 내 예약 성공", async () => {
    const slot = await openCounselSlot(db, owner, "2099-05-01", 2);
    expect(slot.id).toBeTruthy();

    const r1 = await reserveCounselSlot(db, owner, slot.id, sy1);
    expect(r1.id).toBeTruthy();

    const slots = await listCounselSlots(db, owner);
    const found = slots.find((s) => s.id === slot.id);
    expect(found).toBeDefined();
    expect(found!.reservedCount).toBe(1);
    expect(found!.remaining).toBe(1);
  });

  // ── (b) 정원 초과 시 throw (선착순) ─────────────────────────────────────────

  it("(b) 정원 초과 시 '정원 초과' throw", async () => {
    // capacity=1 슬롯 개설
    const slot = await openCounselSlot(db, owner, "2099-05-02", 1);

    // 첫 번째 예약은 성공
    await reserveCounselSlot(db, owner, slot.id, sy1);

    // 두 번째 예약은 정원 초과
    await expect(
      reserveCounselSlot(db, owner, slot.id, sy2),
    ).rejects.toThrow("정원 초과");
  });

  // ── (c) 동일 (슬롯, 학생) 중복 예약 시 throw ────────────────────────────────

  it("(c) 같은 학생 중복 예약 시 '이미 예약됨' throw", async () => {
    // capacity=2 로 정원 여유 있게
    const slot = await openCounselSlot(db, owner, "2099-05-03", 2);

    // 첫 예약
    await reserveCounselSlot(db, owner, slot.id, sy1);

    // 같은 학생 재예약
    await expect(
      reserveCounselSlot(db, owner, slot.id, sy1),
    ).rejects.toThrow("이미 예약됨");
  });

  // ── (d) 상담일지 수정 persist ────────────────────────────────────────────────

  it("(d) 상담일지 수정 후 변경 내용 조회", async () => {
    const log = await createCounselingLog(db, owner, {
      studentYearId: sy1,
      date: "2099-05-10",
      target: "student",
      body: "원본 내용",
    });

    await updateCounselingLog(db, owner, log.id, {
      body: "수정된 내용",
      target: "parent",
    });

    const { listCounselingLogs } = await import("./counseling");
    const list = await listCounselingLogs(db, owner, sy1);
    const updated = list.find((l) => l.id === log.id);
    expect(updated).toBeDefined();
    expect(updated!.body).toBe("수정된 내용");
    expect(updated!.target).toBe("parent");
  });

  // ── 슬롯 폐쇄 cascade ───────────────────────────────────────────────────────

  it("슬롯 폐쇄 시 예약도 cascade 삭제", async () => {
    const slot = await openCounselSlot(db, owner, "2099-05-20", 5);
    await reserveCounselSlot(db, owner, slot.id, sy1);

    await closeCounselSlot(db, owner, slot.id);

    const slots = await listCounselSlots(db, owner);
    expect(slots.find((s) => s.id === slot.id)).toBeUndefined();
  });
});
