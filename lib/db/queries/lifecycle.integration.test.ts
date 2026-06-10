import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears, yearLinks } from "../schema/identity";
import { listSchoolYears, deleteSchoolYear } from "./lifecycle";
import { listStudents } from "./students";

/**
 * 학년도 생명주기 실DB 통합 테스트 (AC-1.2~1.4).
 * RUN_DB_ITEST=1 + DATABASE_URL 일 때만 실행. owner=uuid 격리, afterAll 정리.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();

/** 한 영속학생 + 특정 연도 학적 1건 생성 helper. */
async function makeStudent(
  year: number,
  sid: string,
  name: string,
  personId?: string,
): Promise<{ personId: string; studentYearId: string }> {
  let pid = personId;
  if (!pid) {
    const [p] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: name })
      .returning({ id: persons.id });
    pid = p.id;
  }
  const grade = +sid[0];
  const classNo = +sid.slice(1, 3);
  const number = +sid.slice(3, 5);
  const [sy] = await db
    .insert(studentYears)
    .values({
      ownerId: owner,
      personId: pid,
      schoolYear: year,
      sid,
      grade,
      classNo,
      number,
      name,
    })
    .returning({ id: studentYears.id });
  return { personId: pid, studentYearId: sy.id };
}

describe.skipIf(!RUN)("학년도 생명주기 — 조회·삭제·참조보존", () => {
  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await db.delete(persons).where(eq(persons.ownerId, owner)); // cascade studentYears/yearLinks
    await sql.end();
  });

  it("(a) 활성연도 필터: listStudents 는 해당 연도만 반환", async () => {
    await makeStudent(2024, "10101", "과거학생");
    await makeStudent(2025, "10102", "현재학생");

    const y2025 = await listStudents(db, owner, 2025);
    expect(y2025.map((s) => s.sid)).toEqual(["10102"]);
    const y2024 = await listStudents(db, owner, 2024);
    expect(y2024.map((s) => s.sid)).toEqual(["10101"]);
  });

  it("(b) 과거연도 조회: listSchoolYears 가 보유 연도+학생수 반환", async () => {
    const years = await listSchoolYears(db, owner);
    const map = Object.fromEntries(years.map((y) => [y.schoolYear, y.studentCount]));
    expect(map[2024]).toBe(1);
    expect(map[2025]).toBe(1);
  });

  it("(c) 연도삭제: 미래연도 학적 보유 영속학생은 보존", async () => {
    // 영속학생 1명이 2025+2026 두 해에 존재 → 2025 삭제해도 person 보존
    const a = await makeStudent(2025, "20301", "지속학생");
    await makeStudent(2026, "30301", "지속학생", a.personId);

    const res = await deleteSchoolYear(db, owner, 2025);
    expect(res.removedStudentYears).toBeGreaterThanOrEqual(1);
    expect(res.preservedPersons).toBeGreaterThanOrEqual(1);

    // person 과 2026 학적은 살아있고, 2025 학적은 사라짐
    const stillThere = await db
      .select({ id: persons.id })
      .from(persons)
      .where(and(eq(persons.ownerId, owner), eq(persons.id, a.personId)));
    expect(stillThere).toHaveLength(1);
    const y2026 = await listStudents(db, owner, 2026);
    expect(y2026.find((s) => s.sid === "30301")).toBeTruthy();
    const y2025 = await listStudents(db, owner, 2025);
    expect(y2025.find((s) => s.sid === "20301")).toBeFalsy();
  });

  it("(c2) 연도삭제: resolvedAt 미래 yearLink 참조 영속학생 보존", async () => {
    // 2025 에만 학적이 있는 영속학생을, 2027 의 새 학적이 상속 확정으로 참조
    const past = await makeStudent(2025, "20302", "상속원본");
    const future = await makeStudent(2027, "30302", "상속대상");
    await db.insert(yearLinks).values({
      ownerId: owner,
      newStudentYearId: future.studentYearId,
      candidatePersonId: past.personId,
      linkStatus: "auto_linked",
      resolvedAt: new Date(),
    });

    await deleteSchoolYear(db, owner, 2025);
    const stillThere = await db
      .select({ id: persons.id })
      .from(persons)
      .where(and(eq(persons.ownerId, owner), eq(persons.id, past.personId)));
    expect(stillThere).toHaveLength(1); // 미래 상속 참조로 보존
  });

  it("(d) 연도삭제: 미래 참조 없는 영속학생은 cascade 제거", async () => {
    const lone = await makeStudent(2023, "10505", "단년학생");
    const res = await deleteSchoolYear(db, owner, 2023);
    expect(res.removedPersons).toBeGreaterThanOrEqual(1);

    const gone = await db
      .select({ id: persons.id })
      .from(persons)
      .where(and(eq(persons.ownerId, owner), eq(persons.id, lone.personId)));
    expect(gone).toHaveLength(0);
  });
});
