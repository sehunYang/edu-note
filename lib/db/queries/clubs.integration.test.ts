import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import {
  clubs,
  clubMembers,
  clubActivitySessions,
  calendarEvents,
} from "../schema/misc";
import {
  creativeActivityRecords,
  creativeActivityStudentOverrides,
} from "../schema/records";
import {
  createClub,
  listClubs,
  deleteClub,
  addClubMember,
  listClubMembers,
  removeClubMember,
} from "./clubs";
import {
  reconcileClubActivitySessions,
  updateClubActivityPlan,
  upsertClubActivityRecord,
  upsertClubStudentOverride,
  collectClubRecordSources,
} from "./club-activity";

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

/**
 * 동아리 활동 흐름 통합 테스트 (QC v5 c9 D.4~D.6). reconcile (clubId,date) 키로
 * plannedActivity 보존 + collectClubRecordSources 공통/개별 병합 검증.
 */
describe.skipIf(!RUN)("동아리 활동 — 차시/입력/생기부", () => {
  let sql2: ReturnType<typeof postgres>;
  let db2: PostgresJsDatabase<typeof schema>;
  const owner2 = randomUUID();
  let ay1: string;
  let ay2: string;

  beforeAll(async () => {
    sql2 = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db2 = drizzle(sql2, { schema, casing: "snake_case" });
    const [p1] = await db2
      .insert(persons)
      .values({ ownerId: owner2, displayName: "박활동" })
      .returning({ id: persons.id });
    const [p2] = await db2
      .insert(persons)
      .values({ ownerId: owner2, displayName: "최활동" })
      .returning({ id: persons.id });
    [{ id: ay1 }] = await db2
      .insert(studentYears)
      .values({
        ownerId: owner2,
        personId: p1.id,
        schoolYear: YEAR,
        sid: "20801",
        grade: 2,
        classNo: 8,
        number: 1,
        name: "박활동",
      })
      .returning({ id: studentYears.id });
    [{ id: ay2 }] = await db2
      .insert(studentYears)
      .values({
        ownerId: owner2,
        personId: p2.id,
        schoolYear: YEAR,
        sid: "20802",
        grade: 2,
        classNo: 8,
        number: 2,
        name: "최활동",
      })
      .returning({ id: studentYears.id });
  });

  afterAll(async () => {
    await db2
      .delete(creativeActivityStudentOverrides)
      .where(eq(creativeActivityStudentOverrides.ownerId, owner2));
    await db2
      .delete(creativeActivityRecords)
      .where(eq(creativeActivityRecords.ownerId, owner2));
    await db2
      .delete(clubActivitySessions)
      .where(eq(clubActivitySessions.ownerId, owner2));
    await db2.delete(calendarEvents).where(eq(calendarEvents.ownerId, owner2));
    await db2.delete(clubMembers).where(eq(clubMembers.ownerId, owner2));
    await db2.delete(clubs).where(eq(clubs.ownerId, owner2));
    await db2.delete(studentYears).where(eq(studentYears.ownerId, owner2));
    await db2.delete(persons).where(eq(persons.ownerId, owner2));
    await sql2.end();
  });

  it("reconcile 는 (club_id,date) 키로 plannedActivity 를 보존한다", async () => {
    const club = await createClub(db2, owner2, "사진반");
    // club 캘린더 이벤트 2건(날짜 시퀀스).
    await db2.insert(calendarEvents).values([
      {
        ownerId: owner2,
        date: "2099-03-10",
        source: "manual",
        title: "동아리1",
        eventKind: "club",
      },
      {
        ownerId: owner2,
        date: "2099-03-24",
        source: "manual",
        title: "동아리2",
        eventKind: "club",
      },
    ]);

    const first = await reconcileClubActivitySessions(db2, owner2, club.id);
    expect(first).toHaveLength(2);
    expect(first[0].ordinal).toBe(1); // 날짜순
    expect(first[0].date).toBe("2099-03-10");

    // 2차시에 예정활동 입력.
    await updateClubActivityPlan(db2, owner2, first[1].id, "출사");

    // 더 이른 날짜 이벤트 추가 → reconcile 재실행(ordinal 재계산).
    await db2.insert(calendarEvents).values({
      ownerId: owner2,
      date: "2099-03-03",
      source: "manual",
      title: "동아리0",
      eventKind: "club",
    });
    const second = await reconcileClubActivitySessions(db2, owner2, club.id);
    expect(second).toHaveLength(3);
    expect(second[0].date).toBe("2099-03-03");
    expect(second[0].ordinal).toBe(1); // 신규가 1차시로
    // 기존 03-24 행의 plannedActivity 가 보존(ordinal 만 3 으로 재계산).
    const kept = second.find((s) => s.date === "2099-03-24")!;
    expect(kept.plannedActivity).toBe("출사");
    expect(kept.ordinal).toBe(3);
  });

  it("collectClubRecordSources 는 공통+개별을 부원별로 병합한다", async () => {
    const club = await createClub(db2, owner2, "독서반");
    await addClubMember(db2, owner2, { clubId: club.id, studentYearId: ay1 });
    await addClubMember(db2, owner2, { clubId: club.id, studentYearId: ay2 });

    // 차시 1: 공통 + ay1 개별.
    const rec1 = await upsertClubActivityRecord(
      db2,
      owner2,
      club.id,
      "2099-04-01",
      "고전 함께 읽기",
    );
    await upsertClubStudentOverride(db2, owner2, rec1.id, ay1, "발제 우수");
    // 차시 2: 공통만.
    await upsertClubActivityRecord(
      db2,
      owner2,
      club.id,
      "2099-04-08",
      "독후 토론",
    );

    const sources = await collectClubRecordSources(db2, owner2, club.id);
    expect(sources).toHaveLength(2);
    const s1 = sources.find((s) => s.studentYearId === ay1)!;
    // ay1: 차시1 = 공통+개별 병합, 차시2 = 공통만.
    expect(s1.club).toEqual(["고전 함께 읽기 발제 우수", "독후 토론"]);
    const s2 = sources.find((s) => s.studentYearId === ay2)!;
    // ay2: 개별 없음 → 공통만(차시순).
    expect(s2.club).toEqual(["고전 함께 읽기", "독후 토론"]);
  });
});
