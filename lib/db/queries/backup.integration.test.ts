import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import { exportOwnerData } from "./backup";

/**
 * 백업 내보내기 실DB 통합. owner 핵심 테이블 포함 + 타 owner 데이터 미혼입 검증.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner1 = randomUUID();
const owner2 = randomUUID();
const YEAR = 2099;

async function seed(owner: string, name: string) {
  const [p] = await db
    .insert(persons)
    .values({ ownerId: owner, displayName: name })
    .returning({ id: persons.id });
  await db.insert(studentYears).values({
    ownerId: owner,
    personId: p.id,
    schoolYear: YEAR,
    sid: "20709",
    grade: 2,
    classNo: 7,
    number: 9,
    name,
  });
}

describe.skipIf(!RUN)("백업 내보내기 — owner 격리", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
    await seed(owner1, "내학생");
    await seed(owner2, "남의학생");
  });

  afterAll(async () => {
    for (const o of [owner1, owner2]) {
      await db.delete(studentYears).where(eq(studentYears.ownerId, o));
      await db.delete(persons).where(eq(persons.ownerId, o));
    }
    await sql.end();
  });

  it("owner1 백업에 owner1 학생 포함, owner2 미포함", async () => {
    const backup = await exportOwnerData(db, owner1);
    const names = (backup.tables.persons as { displayName: string }[]).map(
      (p) => p.displayName,
    );
    expect(names).toContain("내학생");
    expect(names).not.toContain("남의학생");

    // student_years 도 owner1 만
    const syOwners = (backup.tables.student_years as { ownerId: string }[]).map(
      (s) => s.ownerId,
    );
    expect(syOwners.every((o) => o === owner1)).toBe(true);
    expect(syOwners.length).toBeGreaterThanOrEqual(1);
  });

  it("백업은 핵심 테이블 키를 모두 포함한다", async () => {
    const backup = await exportOwnerData(db, owner1);
    for (const key of [
      "persons",
      "student_years",
      "attendance_records",
      "special_note_drafts",
      "report_tracking",
      "audit_log",
    ]) {
      expect(backup.tables).toHaveProperty(key);
    }
  });
});
