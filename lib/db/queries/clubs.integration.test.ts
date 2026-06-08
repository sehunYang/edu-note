import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import { clubs, clubMembers } from "../schema/misc";
import {
  createClub,
  listClubs,
  deleteClub,
  addClubMember,
  listClubMembers,
  removeClubMember,
} from "./clubs";

/**
 * 동아리 실DB 통합 테스트 (Phase2-D). 생성·부원 추가(멱등)·목록·제거·cascade 삭제.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;
let sy1: string;
let sy2: string;

describe.skipIf(!RUN)("동아리 — 명부 관리", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
    const [p1] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: "김부원" })
      .returning({ id: persons.id });
    const [p2] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: "이부원" })
      .returning({ id: persons.id });
    [{ id: sy1 }] = await db
      .insert(studentYears)
      .values({
        ownerId: owner,
        personId: p1.id,
        schoolYear: YEAR,
        sid: "20701",
        grade: 2,
        classNo: 7,
        number: 1,
        name: "김부원",
      })
      .returning({ id: studentYears.id });
    [{ id: sy2 }] = await db
      .insert(studentYears)
      .values({
        ownerId: owner,
        personId: p2.id,
        schoolYear: YEAR,
        sid: "20702",
        grade: 2,
        classNo: 7,
        number: 2,
        name: "이부원",
      })
      .returning({ id: studentYears.id });
  });

  afterAll(async () => {
    await db.delete(clubMembers).where(eq(clubMembers.ownerId, owner));
    await db.delete(clubs).where(eq(clubs.ownerId, owner));
    await db.delete(studentYears).where(eq(studentYears.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner));
    await sql.end();
  });

  it("동아리 생성 후 부원 추가·목록 조회", async () => {
    const club = await createClub(db, owner, "과학탐구반");
    await addClubMember(db, owner, {
      clubId: club.id,
      studentYearId: sy1,
      desiredCareer: "물리학자",
    });
    await addClubMember(db, owner, { clubId: club.id, studentYearId: sy2 });

    const members = await listClubMembers(db, owner, club.id);
    expect(members).toHaveLength(2);
    expect(members[0].sid).toBe("20701"); // 학번순
    expect(members[0].desiredCareer).toBe("물리학자");

    const list = await listClubs(db, owner);
    const row = list.find((c) => c.id === club.id)!;
    expect(row.memberCount).toBe(2);
  });

  it("같은 학생 재추가는 멱등 — 희망진로만 갱신", async () => {
    const club = await createClub(db, owner, "토론반");
    await addClubMember(db, owner, {
      clubId: club.id,
      studentYearId: sy1,
      desiredCareer: "변호사",
    });
    await addClubMember(db, owner, {
      clubId: club.id,
      studentYearId: sy1,
      desiredCareer: "판사",
    });
    const members = await listClubMembers(db, owner, club.id);
    expect(members).toHaveLength(1); // 중복 없음
    expect(members[0].desiredCareer).toBe("판사"); // 갱신됨
  });

  it("부원 제거 후 카운트 감소", async () => {
    const club = await createClub(db, owner, "밴드부");
    const m = await addClubMember(db, owner, {
      clubId: club.id,
      studentYearId: sy1,
    });
    await removeClubMember(db, owner, m.id);
    const members = await listClubMembers(db, owner, club.id);
    expect(members).toHaveLength(0);
  });

  it("동아리 삭제 시 부원도 cascade 삭제", async () => {
    const club = await createClub(db, owner, "삭제될반");
    await addClubMember(db, owner, { clubId: club.id, studentYearId: sy1 });
    await deleteClub(db, owner, club.id);
    const list = await listClubs(db, owner);
    expect(list.find((c) => c.id === club.id)).toBeUndefined();
    // 부원 행도 사라졌는지 직접 확인
    const remaining = await db
      .select({ id: clubMembers.id })
      .from(clubMembers)
      .where(eq(clubMembers.clubId, club.id));
    expect(remaining).toHaveLength(0);
  });
});
