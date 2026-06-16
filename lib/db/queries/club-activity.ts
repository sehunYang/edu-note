import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { clubActivitySessions, clubs, calendarEvents } from "../schema/misc";
import { studentYears } from "../schema/identity";
import {
  creativeActivityRecords,
  creativeActivityStudentOverrides,
  specialNoteDrafts,
} from "../schema/records";
import { byteLength, BYTE_LIMITS } from "@/lib/domain/byte-count";

/**
 * 동아리 활동 쿼리 계층 (QC v5 c9 Phase D, 마이그 0038).
 *
 * D.4 활동계획: calendarEvents.eventKind='club' 날짜 시퀀스 → representativeDates
 *   패턴으로 정렬 → ordinal(날짜순 파생) 부여. reconcile 키 = (clubId, date) 로
 *   사용자 입력 plannedActivity 보존(ordinal 은 재계산되는 파생 비-unique 컬럼).
 * D.5 활동입력: 차시별 공통 creativeActivityRecords(area='club', clubId, commonBody)
 *   + 학생별 creativeActivityStudentOverrides(body). 차시 = club_activity_sessions.
 * D.6 생기부: collectClubRecordSources(공통+개별 병합) → specialNoteDrafts type='club'.
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface ClubActivitySessionRow {
  id: string;
  clubId: string;
  ordinal: number;
  date: string; // YYYY-MM-DD
  plannedActivity: string | null;
}

/** 동아리 차시(예정활동) 목록(날짜순 = ordinal순). */
export async function listClubActivitySessions(
  db: DB,
  ownerId: string,
  clubId: string,
): Promise<ClubActivitySessionRow[]> {
  return db
    .select({
      id: clubActivitySessions.id,
      clubId: clubActivitySessions.clubId,
      ordinal: clubActivitySessions.ordinal,
      date: clubActivitySessions.date,
      plannedActivity: clubActivitySessions.plannedActivity,
    })
    .from(clubActivitySessions)
    .where(
      and(
        eq(clubActivitySessions.ownerId, ownerId),
        eq(clubActivitySessions.clubId, clubId),
      ),
    )
    .orderBy(asc(clubActivitySessions.date));
}

/**
 * D.4 차시 자동생성/재생성(reconcile). calendarEvents.eventKind='club' 날짜 시퀀스를
 * representativeDates 패턴으로 정렬 → ordinal(날짜순 파생) 부여 → (clubId, date)
 * 키로 upsert. 사용자 입력 plannedActivity 는 date 기준으로 보존(onConflictDoUpdate
 * 가 ordinal 만 갱신). 달력에서 사라진 날짜의 행은 삭제하지 않고 보존한다(보수적 —
 * plannedActivity 손실 방지). 반환은 최신 차시 목록(날짜순).
 */
export async function reconcileClubActivitySessions(
  db: DB,
  ownerId: string,
  clubId: string,
): Promise<ClubActivitySessionRow[]> {
  // club 이벤트 날짜 시퀀스(중복 제거 후 representativeDates 패턴으로 정렬).
  const events = await db
    .select({ date: calendarEvents.date })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.ownerId, ownerId),
        eq(calendarEvents.eventKind, "club"),
      ),
    );
  // representativeDates 패턴(날짜 중복 제거 + 오름차순 정렬)을 차용. 동아리는 요일
  // 슬롯이 아니라 club 이벤트 날짜 자체가 차시이므로 요일 필터 없이 모든 날짜 사용.
  const dates = Array.from(new Set(events.map((e) => e.date))).sort();

  if (dates.length > 0) {
    // (clubId, date) 키 upsert. ordinal 은 날짜순 파생값(1..N) 으로 재계산.
    const rows = dates.map((date, i) => ({
      ownerId,
      clubId,
      ordinal: i + 1,
      date,
      plannedActivity: null as string | null,
    }));
    await db
      .insert(clubActivitySessions)
      .values(rows)
      .onConflictDoUpdate({
        target: [clubActivitySessions.clubId, clubActivitySessions.date],
        // ordinal 만 재계산 반영. plannedActivity 는 보존(set 에 미포함).
        set: {
          ordinal: sql`excluded.ordinal`,
          updatedAt: new Date(),
        },
      });
  }
  return listClubActivitySessions(db, ownerId, clubId);
}

/** 차시 예정활동(plannedActivity) 저장(소유자 본인 행만). */
export async function updateClubActivityPlan(
  db: DB,
  ownerId: string,
  sessionId: string,
  plannedActivity: string | null,
): Promise<void> {
  await db
    .update(clubActivitySessions)
    .set({ plannedActivity, updatedAt: new Date() })
    .where(
      and(
        eq(clubActivitySessions.id, sessionId),
        eq(clubActivitySessions.ownerId, ownerId),
      ),
    );
}

// ── D.5 활동입력(차시별 공통 + 학생별) ──

export interface ClubEntryRecordRow {
  id: string;
  activityDate: string;
  commonBody: string | null;
  overrides: { id: string; studentYearId: string; body: string | null }[];
}

/**
 * 동아리 활동입력 레코드 목록(area='club', clubId 필터). 차시(날짜)별 공통내용 +
 * 학생별 오버라이드를 묶어 반환(activityDate 순).
 */
export async function listClubActivityRecords(
  db: DB,
  ownerId: string,
  clubId: string,
): Promise<ClubEntryRecordRow[]> {
  const records = await db
    .select({
      id: creativeActivityRecords.id,
      activityDate: creativeActivityRecords.activityDate,
      commonBody: creativeActivityRecords.commonBody,
    })
    .from(creativeActivityRecords)
    .where(
      and(
        eq(creativeActivityRecords.ownerId, ownerId),
        eq(creativeActivityRecords.area, "club"),
        eq(creativeActivityRecords.clubId, clubId),
      ),
    )
    .orderBy(asc(creativeActivityRecords.activityDate));
  if (records.length === 0) return [];

  const recIds = records.map((r) => r.id);
  const overrides = await db
    .select({
      id: creativeActivityStudentOverrides.id,
      recordId: creativeActivityStudentOverrides.recordId,
      studentYearId: creativeActivityStudentOverrides.studentYearId,
      body: creativeActivityStudentOverrides.body,
    })
    .from(creativeActivityStudentOverrides)
    .where(
      and(
        eq(creativeActivityStudentOverrides.ownerId, ownerId),
        inArray(creativeActivityStudentOverrides.recordId, recIds),
      ),
    );

  return records.map((r) => ({
    id: r.id,
    activityDate: r.activityDate,
    commonBody: r.commonBody,
    overrides: overrides
      .filter((o) => o.recordId === r.id)
      .map((o) => ({
        id: o.id,
        studentYearId: o.studentYearId,
        body: o.body,
      })),
  }));
}

/**
 * 차시별 공통내용 upsert(area='club', clubId, activityDate 기준). 같은 (clubId, date)
 * 레코드가 있으면 commonBody 갱신, 없으면 신규 생성. 생성/갱신된 record id 반환.
 */
export async function upsertClubActivityRecord(
  db: DB,
  ownerId: string,
  clubId: string,
  activityDate: string,
  commonBody: string | null,
): Promise<{ id: string }> {
  const existing = await db
    .select({ id: creativeActivityRecords.id })
    .from(creativeActivityRecords)
    .where(
      and(
        eq(creativeActivityRecords.ownerId, ownerId),
        eq(creativeActivityRecords.area, "club"),
        eq(creativeActivityRecords.clubId, clubId),
        eq(creativeActivityRecords.activityDate, activityDate),
      ),
    )
    .limit(1);
  if (existing[0]) {
    await db
      .update(creativeActivityRecords)
      .set({ commonBody, updatedAt: new Date() })
      .where(eq(creativeActivityRecords.id, existing[0].id));
    return { id: existing[0].id };
  }
  const [row] = await db
    .insert(creativeActivityRecords)
    .values({ ownerId, area: "club", clubId, activityDate, commonBody })
    .returning({ id: creativeActivityRecords.id });
  return row;
}

/** 학생별 오버라이드 upsert(recordId + studentYearId 기준). */
export async function upsertClubStudentOverride(
  db: DB,
  ownerId: string,
  recordId: string,
  studentYearId: string,
  body: string | null,
): Promise<{ id: string }> {
  const existing = await db
    .select({ id: creativeActivityStudentOverrides.id })
    .from(creativeActivityStudentOverrides)
    .where(
      and(
        eq(creativeActivityStudentOverrides.ownerId, ownerId),
        eq(creativeActivityStudentOverrides.recordId, recordId),
        eq(creativeActivityStudentOverrides.studentYearId, studentYearId),
      ),
    )
    .limit(1);
  if (existing[0]) {
    await db
      .update(creativeActivityStudentOverrides)
      .set({ body, updatedAt: new Date() })
      .where(eq(creativeActivityStudentOverrides.id, existing[0].id));
    return { id: existing[0].id };
  }
  const [row] = await db
    .insert(creativeActivityStudentOverrides)
    .values({ ownerId, recordId, studentYearId, body })
    .returning({ id: creativeActivityStudentOverrides.id });
  return row;
}

// ── D.6 생기부(공통+개별 병합 → type='club' 초안) ──

/** 한 동아리 부원의 동아리 활동 원천자료(공통 + 본인 오버라이드). */
export interface ClubRecordSource {
  studentYearId: string;
  sid: string;
  name: string;
  /** 동아리 활동 원천(공통내용 + 본인 개별내용). */
  club: string[];
}

/**
 * D.6 — 동아리 부원별 동아리 활동 원천자료 수집(area='club', clubId 필터).
 * homeroom-record.collectRecordSources 패턴. 부원 1명당 한 묶음.
 * 각 차시의 공통내용(commonBody) + 본인 오버라이드(body)를 차시순으로 병합한다.
 * 부원이 없으면 빈 배열. ownerId 가드 + 배치 조회(N+1 회피).
 */
export async function collectClubRecordSources(
  db: DB,
  ownerId: string,
  clubId: string,
): Promise<ClubRecordSource[]> {
  // 부원 명단(학번순).
  const members = await db
    .select({
      studentYearId: schema.clubMembers.studentYearId,
      sid: studentYears.sid,
      name: studentYears.name,
    })
    .from(schema.clubMembers)
    .innerJoin(studentYears, eq(studentYears.id, schema.clubMembers.studentYearId))
    .where(
      and(
        eq(schema.clubMembers.ownerId, ownerId),
        eq(schema.clubMembers.clubId, clubId),
      ),
    )
    .orderBy(asc(studentYears.sid));
  if (members.length === 0) return [];

  // 차시별 공통내용 + 오버라이드(area='club', clubId).
  const records = await listClubActivityRecords(db, ownerId, clubId);

  const bucket = new Map<string, ClubRecordSource>();
  for (const m of members) {
    bucket.set(m.studentYearId, {
      studentYearId: m.studentYearId,
      sid: m.sid,
      name: m.name,
      club: [],
    });
  }
  for (const rec of records) {
    const common = rec.commonBody?.trim() ?? "";
    const overrideByStudent = new Map(
      rec.overrides.map((o) => [o.studentYearId, o.body?.trim() ?? ""]),
    );
    for (const m of members) {
      const row = bucket.get(m.studentYearId)!;
      const parts: string[] = [];
      if (common) parts.push(common);
      const ov = overrideByStudent.get(m.studentYearId);
      if (ov) parts.push(ov);
      if (parts.length > 0) row.club.push(parts.join(" "));
    }
  }
  return members.map((m) => bucket.get(m.studentYearId)!);
}

export interface SaveClubRecordDraftResult {
  id: string;
  byteCount: number;
  byteLimit: number;
}

/**
 * D.6 — 동아리 생기부 초안 1건 저장. special_note_drafts(type='club', subjectId=null,
 * source='cowork'). byteLimit = BYTE_LIMITS['club'](=3000). saveHomeroomRecordDraft 패턴.
 */
export async function saveClubRecordDraft(
  db: DB,
  ownerId: string,
  studentYearId: string,
  content: string,
): Promise<SaveClubRecordDraftResult> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("내용이 비어 있습니다.");
  const byteCount = byteLength(content);
  const byteLimit = BYTE_LIMITS["club"];
  if (byteCount > byteLimit) {
    throw new Error(`바이트 상한 초과(${byteCount}/${byteLimit}).`);
  }
  const [row] = await db
    .insert(specialNoteDrafts)
    .values({
      ownerId,
      studentYearId,
      type: "club",
      subjectId: null,
      content,
      byteCount,
      byteLimit,
      status: "draft",
      source: "cowork",
      generatedAt: new Date(),
    })
    .returning({ id: specialNoteDrafts.id });
  return { id: row.id, byteCount, byteLimit };
}

export interface ClubRecordDraftRow {
  id: string;
  studentYearId: string;
  content: string;
  byteCount: number;
  byteLimit: number;
  createdAt: Date;
}

/** 저장된 동아리 생기부 초안 목록(부원 한정, 최신순). */
export async function listClubRecordDrafts(
  db: DB,
  ownerId: string,
  clubId: string,
): Promise<ClubRecordDraftRow[]> {
  const members = await db
    .select({ id: schema.clubMembers.studentYearId })
    .from(schema.clubMembers)
    .where(
      and(
        eq(schema.clubMembers.ownerId, ownerId),
        eq(schema.clubMembers.clubId, clubId),
      ),
    );
  if (members.length === 0) return [];
  const ids = members.map((m) => m.id);
  const rows = await db
    .select({
      id: specialNoteDrafts.id,
      studentYearId: specialNoteDrafts.studentYearId,
      content: specialNoteDrafts.content,
      byteCount: specialNoteDrafts.byteCount,
      byteLimit: specialNoteDrafts.byteLimit,
      createdAt: specialNoteDrafts.createdAt,
    })
    .from(specialNoteDrafts)
    .where(
      and(
        eq(specialNoteDrafts.ownerId, ownerId),
        eq(specialNoteDrafts.type, "club"),
        inArray(specialNoteDrafts.studentYearId, ids),
      ),
    )
    .orderBy(asc(specialNoteDrafts.createdAt));
  return rows;
}
