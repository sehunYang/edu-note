import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import {
  subjectObservations,
  homeroomBehaviorNotes,
} from "../schema/records";
import {
  addSubjectObservation,
  listSubjectObservations,
  addBehaviorNote,
  listBehaviorNotes,
  countSubjectObservationsByStudent,
  studentsWithoutBehaviorNoteToday,
} from "./observations";

/**
 * 관찰/행특 실DB 통합 테스트. 키워드 배열 보존 + 학생별 기록수 집계(넛지 입력) 검증.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;
let s1: string;
let s2: string;

async function mkStudent(sid: string, name: string): Promise<string> {
  const [p] = await db
    .insert(persons)
    .values({ ownerId: owner, displayName: name })
    .returning({ id: persons.id });
  const [sy] = await db
    .insert(studentYears)
    .values({
      ownerId: owner,
      personId: p.id,
      schoolYear: YEAR,
      sid,
      grade: 2,
      classNo: 7,
      number: Number(sid.slice(3)),
      name,
    })
    .returning({ id: studentYears.id });
  return sy.id;
}

describe.skipIf(!RUN)("관찰/행특 기록", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
    s1 = await mkStudent("20701", "김하나");
    s2 = await mkStudent("20702", "이두리");
  });

  afterAll(async () => {
    await db.delete(subjectObservations).where(eq(subjectObservations.ownerId, owner));
    await db.delete(homeroomBehaviorNotes).where(eq(homeroomBehaviorNotes.ownerId, owner));
    await db.delete(studentYears).where(eq(studentYears.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner));
    await sql.end();
  });

  it("교과 관찰 추가 — 키워드 배열 보존", async () => {
    await addSubjectObservation(db, owner, {
      studentYearId: s1,
      body: "실험 설계에서 변인 통제를 정확히 적용함",
      keywords: ["탐구", "변인통제"],
    });
    const list = await listSubjectObservations(db, owner, { studentYearId: s1 });
    expect(list).toHaveLength(1);
    expect(list[0].keywords).toEqual(["탐구", "변인통제"]);
  });

  it("학생별 관찰 기록수 집계 — 0건 학생 포함", async () => {
    const counts = await countSubjectObservationsByStudent(db, owner, YEAR);
    const byId = new Map(counts.map((c) => [c.id, c.recordCount]));
    expect(byId.get(s1)).toBe(1);
    expect(byId.get(s2)).toBe(0); // 0건도 포함되어야 넛지 가중치가 동작
  });

  it("행특 추가 + 오늘 미작성 학생 산출", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await addBehaviorNote(db, owner, {
      studentYearId: s1,
      notedOn: today,
      body: "학급 청소 활동에 자발적으로 참여함",
      keywords: ["성실"],
    });
    const notes = await listBehaviorNotes(db, owner, { studentYearId: s1 });
    expect(notes).toHaveLength(1);

    const without = await studentsWithoutBehaviorNoteToday(db, owner, YEAR, today);
    expect(without).toContain(s2);
    expect(without).not.toContain(s1);
  });
});
