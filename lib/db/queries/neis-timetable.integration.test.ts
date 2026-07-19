import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "../schema";
import { neisTimetableSlots } from "../schema/misc";
import {
  replaceNeisTimetableWeek,
  listNeisActualForDate,
  listNeisActualForWeek,
} from "./index";
import type { NeisTimetableEntry } from "@/lib/integrations/neis";

/**
 * NEIS '이번 주 실제' 시간표 캐시 통합 테스트. 0057(neis_timetable_slots) 적용 후 실행.
 * replace 멱등성(2회 동일) + 날짜/주 조회 + 구간 밖 방어 필터를 검증한다.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();

const FROM = "2099-03-02"; // 월
const TO = "2099-03-06"; // 금
const entries: NeisTimetableEntry[] = [
  { date: "2099-03-02", grade: 2, classNo: 9, period: 1, subject: "일본어" },
  { date: "2099-03-02", grade: 2, classNo: 9, period: 2, subject: "문학" },
  { date: "2099-03-05", grade: 2, classNo: 9, period: 5, subject: "진로활동" },
];

describe.skipIf(!RUN)("NEIS 이번 주 실제 시간표 캐시", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
  });
  afterAll(async () => {
    await db
      .delete(neisTimetableSlots)
      .where(eq(neisTimetableSlots.ownerId, owner));
    await sql.end();
  });

  it("replace 는 멱등(2회 실행 동일 결과)", async () => {
    const r1 = await replaceNeisTimetableWeek(db, owner, 2, 9, FROM, TO, entries);
    expect(r1.count).toBe(3);
    const r2 = await replaceNeisTimetableWeek(db, owner, 2, 9, FROM, TO, entries);
    expect(r2.count).toBe(3);
    const rows = await db
      .select()
      .from(neisTimetableSlots)
      .where(
        and(
          eq(neisTimetableSlots.ownerId, owner),
          eq(neisTimetableSlots.grade, 2),
          eq(neisTimetableSlots.classNo, 9),
        ),
      );
    expect(rows).toHaveLength(3); // 중복 없음
  });

  it("listNeisActualForDate 는 그날 반·교시만", async () => {
    const out = await listNeisActualForDate(db, owner, "2099-03-02");
    expect(out.map((r) => r.subjectName).sort()).toEqual(["문학", "일본어"]);
  });

  it("listNeisActualForWeek 는 구간 전체(날짜·교시순)", async () => {
    const out = await listNeisActualForWeek(db, owner, 2, 9, FROM, TO);
    expect(out).toHaveLength(3);
    expect(out[out.length - 1].subjectName).toBe("진로활동");
  });

  it("구간 밖/타 반 입력은 방어적으로 제외", async () => {
    const mixed: NeisTimetableEntry[] = [
      { date: "2099-03-02", grade: 2, classNo: 9, period: 3, subject: "화학" },
      { date: "2099-03-09", grade: 2, classNo: 9, period: 1, subject: "다음주" }, // 구간 밖
      { date: "2099-03-02", grade: 1, classNo: 1, period: 1, subject: "타반" }, // 타 반
    ];
    const r = await replaceNeisTimetableWeek(db, owner, 2, 9, FROM, TO, mixed);
    expect(r.count).toBe(1); // 화학만
    const out = await listNeisActualForWeek(db, owner, 2, 9, FROM, TO);
    expect(out.map((r) => r.subjectName)).toEqual(["화학"]);
  });
});
