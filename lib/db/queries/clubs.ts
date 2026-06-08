import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { clubs, clubMembers } from "../schema/misc";
import { studentYears } from "../schema/identity";

/**
 * 동아리 쿼리 계층 (계획 §3.3 clubs/club_members, §4 Phase2-D).
 *
 * 동아리 생성·삭제, 부원 추가/제거(희망진로 메모), 부원 목록(학생 표시정보 조인).
 * 동아리 활동 세특은 창체활동(area=club)을 재사용하므로 여기서는 명부만 관리한다.
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface ClubRow {
  id: string;
  name: string;
  memberCount: number;
  createdAt: Date;
}

/** 동아리 생성. 생성된 행 id 반환. */
export async function createClub(
  db: DB,
  ownerId: string,
  name: string,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(clubs)
    .values({ ownerId, name })
    .returning({ id: clubs.id });
  return row;
}

/** 소유자의 동아리 목록(부원 수 포함, 최신순). */
export async function listClubs(db: DB, ownerId: string): Promise<ClubRow[]> {
  return db
    .select({
      id: clubs.id,
      name: clubs.name,
      memberCount: sql<number>`count(${clubMembers.id})::int`,
      createdAt: clubs.createdAt,
    })
    .from(clubs)
    .leftJoin(
      clubMembers,
      and(eq(clubMembers.clubId, clubs.id), eq(clubMembers.ownerId, ownerId)),
    )
    .where(eq(clubs.ownerId, ownerId))
    .groupBy(clubs.id)
    .orderBy(desc(clubs.createdAt));
}

/** 동아리 삭제(소유자 본인 행만). 부원은 FK cascade 로 함께 삭제. */
export async function deleteClub(
  db: DB,
  ownerId: string,
  id: string,
): Promise<void> {
  await db
    .delete(clubs)
    .where(and(eq(clubs.id, id), eq(clubs.ownerId, ownerId)));
}

export interface ClubMemberRow {
  id: string;
  studentYearId: string;
  sid: string;
  name: string;
  desiredCareer: string | null;
}

/** 동아리 부원 목록(학생 학번/이름 조인, 학번순). */
export async function listClubMembers(
  db: DB,
  ownerId: string,
  clubId: string,
): Promise<ClubMemberRow[]> {
  return db
    .select({
      id: clubMembers.id,
      studentYearId: clubMembers.studentYearId,
      sid: studentYears.sid,
      name: studentYears.name,
      desiredCareer: clubMembers.desiredCareer,
    })
    .from(clubMembers)
    .innerJoin(studentYears, eq(studentYears.id, clubMembers.studentYearId))
    .where(and(eq(clubMembers.ownerId, ownerId), eq(clubMembers.clubId, clubId)))
    .orderBy(asc(studentYears.sid));
}

export interface AddClubMemberInput {
  clubId: string;
  studentYearId: string;
  desiredCareer?: string | null;
}

/**
 * 부원 추가. (club, student) 유니크 제약(uq_club_members)으로 중복 방지 —
 * 이미 있으면 희망진로만 갱신(멱등).
 */
export async function addClubMember(
  db: DB,
  ownerId: string,
  input: AddClubMemberInput,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(clubMembers)
    .values({
      ownerId,
      clubId: input.clubId,
      studentYearId: input.studentYearId,
      desiredCareer: input.desiredCareer ?? null,
    })
    .onConflictDoUpdate({
      target: [clubMembers.clubId, clubMembers.studentYearId],
      set: { desiredCareer: input.desiredCareer ?? null, updatedAt: new Date() },
    })
    .returning({ id: clubMembers.id });
  return row;
}

/** 부원 제거(소유자 본인 행만). */
export async function removeClubMember(
  db: DB,
  ownerId: string,
  memberId: string,
): Promise<void> {
  await db
    .delete(clubMembers)
    .where(and(eq(clubMembers.id, memberId), eq(clubMembers.ownerId, ownerId)));
}
