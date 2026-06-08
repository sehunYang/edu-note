import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import {
  subjectObservations,
  studentActivityEntries,
  specialNoteDrafts,
} from "../schema/records";
import { byteLength } from "@/lib/domain/byte-count";
import { buildSourceBundle, saveDraft, listDrafts } from "./setech";

/**
 * 세특 내보내기 실DB 통합. 원천 묶음 수집 + 검수 저장(차단/정상) + byteCount 일치 검증.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;
let studentYearId: string;

describe.skipIf(!RUN)("세특 내보내기 — 묶음/검수/저장", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
    const [p] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: "박세특" })
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
        name: "박세특",
      })
      .returning({ id: studentYears.id });
    await db.insert(subjectObservations).values({
      ownerId: owner,
      studentYearId,
      observedOn: "2099-03-02",
      body: "실험 데이터를 표로 정리하고 오차 원인을 분석함",
      keywords: ["탐구", "분석"],
    });
    await db.insert(studentActivityEntries).values({
      ownerId: owner,
      studentYearId,
      tag: "autonomy",
      placement: "autonomy",
      body: "학급 1인 1역 도서부장으로 학급문고를 관리함",
    });
  });

  afterAll(async () => {
    await db.delete(specialNoteDrafts).where(eq(specialNoteDrafts.ownerId, owner));
    await db.delete(subjectObservations).where(eq(subjectObservations.ownerId, owner));
    await db
      .delete(studentActivityEntries)
      .where(eq(studentActivityEntries.ownerId, owner));
    await db.delete(studentYears).where(eq(studentYears.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner));
    await sql.end();
  });

  it("교과 묶음은 관찰·키워드를 수집한다", async () => {
    const bundle = await buildSourceBundle(db, owner, studentYearId, "subject");
    expect(bundle.studentName).toBe("박세특");
    expect(bundle.observations.length).toBeGreaterThan(0);
    expect(bundle.keywords).toContain("탐구");
  });

  it("자율 묶음은 placement=autonomy 활동을 수집한다", async () => {
    const bundle = await buildSourceBundle(db, owner, studentYearId, "autonomy");
    expect(bundle.activities.some((a) => a.includes("도서부장"))).toBe(true);
  });

  it("정상 텍스트 저장 — byteCount 가 byteLength 와 일치", async () => {
    const text = "관찰한 사실을 바탕으로 탐구 역량을 보여 줌";
    const saved = await saveDraft(db, owner, {
      studentYearId,
      noteType: "subject",
      content: text,
    });
    expect(saved.byteCount).toBe(byteLength(text));
    const drafts = await listDrafts(db, owner, studentYearId);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].byteCount).toBe(byteLength(text));
  });

  it("상한 초과·빈 내용은 저장 거부(throw)", async () => {
    await expect(
      saveDraft(db, owner, {
        studentYearId,
        noteType: "subject",
        content: "a".repeat(3001), // limit 3000
      }),
    ).rejects.toThrow();
    await expect(
      saveDraft(db, owner, {
        studentYearId,
        noteType: "subject",
        content: "   ",
      }),
    ).rejects.toThrow();
  });
});
