import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import { homeroomClasses, homeroomMembers } from "../schema/classes";
import {
  studentActivityEntries,
  homeroomBehaviorNotes,
  studentExtraNotes,
  classRoles,
  specialNoteDrafts,
} from "../schema/records";
import { teacherProfile } from "../schema/misc";
import { byteLength, BYTE_LIMITS } from "@/lib/domain/byte-count";
import {
  collectRecordSources,
  saveHomeroomRecordDraft,
  listHomeroomRecordDrafts,
} from "./homeroom-record";

/**
 * 생기부 작성 코워크 실DB 통합(US-B12, AC-11.x). 담임반 학생 3영역 원천 수집 +
 * 초안 저장/목록. 자율/진로/행발 원천이 각 영역에 정확히 합류하는지 검증.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2098;
let syId: string;

describe.skipIf(!RUN)("생기부 작성 코워크 — 3영역 원천/초안", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });

    await db.insert(teacherProfile).values({ ownerId: owner, name: "담임교사" });

    const [p] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: "한생기" })
      .returning({ id: persons.id });
    [{ id: syId }] = await db
      .insert(studentYears)
      .values({
        ownerId: owner,
        personId: p.id,
        schoolYear: YEAR,
        sid: "20801",
        grade: 2,
        classNo: 8,
        number: 1,
        name: "한생기",
      })
      .returning({ id: studentYears.id });

    const [hc] = await db
      .insert(homeroomClasses)
      .values({ ownerId: owner, schoolYear: YEAR, grade: 2, classNo: 8 })
      .returning({ id: homeroomClasses.id });
    await db
      .insert(homeroomMembers)
      .values({ ownerId: owner, homeroomId: hc.id, studentYearId: syId });

    // 자율 + 진로 활동 기입.
    await db.insert(studentActivityEntries).values([
      {
        ownerId: owner,
        studentYearId: syId,
        tag: "autonomy",
        placement: "autonomy",
        body: "학급 자치 회의를 주도하여 학급 규칙을 제안함",
      },
      {
        ownerId: owner,
        studentYearId: syId,
        tag: "career",
        placement: "career",
        body: "공학 계열 진로 탐색 보고서를 작성함",
      },
    ]);
    // 행발 원천: 행특 + 추가메모(subjectId null) + 학급역할.
    await db.insert(homeroomBehaviorNotes).values({
      ownerId: owner,
      studentYearId: syId,
      notedOn: `${YEAR}-03-10`,
      body: "성실하고 책임감이 강하여 맡은 일을 끝까지 수행함",
    });
    await db.insert(studentExtraNotes).values({
      ownerId: owner,
      studentYearId: syId,
      subjectId: null,
      body: "또래 상담 활동에 자발적으로 참여함",
    });
    await db.insert(classRoles).values({
      ownerId: owner,
      studentYearId: syId,
      roleName: "학급회장",
      roleDesc: "급우 의견 수렴 및 회의 진행",
    });
  });

  afterAll(async () => {
    await db.delete(specialNoteDrafts).where(eq(specialNoteDrafts.ownerId, owner));
    await db
      .delete(studentActivityEntries)
      .where(eq(studentActivityEntries.ownerId, owner));
    await db
      .delete(homeroomBehaviorNotes)
      .where(eq(homeroomBehaviorNotes.ownerId, owner));
    await db.delete(studentExtraNotes).where(eq(studentExtraNotes.ownerId, owner));
    await db.delete(classRoles).where(eq(classRoles.ownerId, owner));
    await db.delete(homeroomMembers).where(eq(homeroomMembers.ownerId, owner));
    await db.delete(homeroomClasses).where(eq(homeroomClasses.ownerId, owner));
    await db.delete(studentYears).where(eq(studentYears.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner));
    await db.delete(teacherProfile).where(eq(teacherProfile.ownerId, owner));
    await sql.end();
  });

  it("AC-11.1 — 3영역 원천을 학생별로 정확히 합류한다", async () => {
    const sources = await collectRecordSources(db, owner, YEAR);
    expect(sources).toHaveLength(1);
    const s = sources[0];
    expect(s.sid).toBe("20801");
    // 자율: 활동(placement=autonomy)만.
    expect(s.autonomy.some((b) => b.includes("학급 자치"))).toBe(true);
    expect(s.autonomy.some((b) => b.includes("진로 탐색"))).toBe(false);
    // 진로: 활동(placement=career)만.
    expect(s.career.some((b) => b.includes("진로 탐색"))).toBe(true);
    // 행발: 행특 + 추가메모 + 학급역할 모두 합류.
    expect(s.behavior.some((b) => b.includes("책임감"))).toBe(true);
    expect(s.behavior.some((b) => b.includes("또래 상담"))).toBe(true);
    expect(s.behavior.some((b) => b.includes("학급회장"))).toBe(true);
  });

  it("AC-11.2/11.3 — 초안 저장 + 목록 반환(영역 필터)", async () => {
    const content = "자기 주도적으로 학급 활동을 기획하고 실행함";
    const saved = await saveHomeroomRecordDraft(db, owner, syId, "autonomy", content);
    expect(saved.byteCount).toBe(byteLength(content));
    expect(saved.byteLimit).toBe(BYTE_LIMITS.autonomy);

    const all = await listHomeroomRecordDrafts(db, owner, YEAR);
    expect(all.some((d) => d.id === saved.id && d.area === "autonomy")).toBe(true);

    const autonomyOnly = await listHomeroomRecordDrafts(db, owner, YEAR, "autonomy");
    expect(autonomyOnly.every((d) => d.area === "autonomy")).toBe(true);
    expect(autonomyOnly.some((d) => d.id === saved.id)).toBe(true);

    const behaviorOnly = await listHomeroomRecordDrafts(db, owner, YEAR, "behavior");
    expect(behaviorOnly.some((d) => d.id === saved.id)).toBe(false);
  });
});
