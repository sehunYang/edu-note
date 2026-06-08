import { and, asc, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { subjects, courseSections, timetableSlots } from "../schema/classes";
import { teacherProfile } from "../schema/misc";
import type { TimetableSlot } from "@/lib/integrations/comcigan";

/**
 * 시간표 sync 쿼리 계층 (계획 §3.3 B, §4 B). 컴시간에서 디코딩한 교사 슬롯을
 * subjects → course_sections → timetable_slots 로 멱등 upsert 한다.
 * 재실행 시 source='comcigan' 슬롯을 모두 교체해 중복을 방지한다(단일 교사 가정).
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface TimetableSyncResult {
  subjects: number;
  sections: number;
  slots: number;
}

async function getOrCreateSubject(
  db: DB,
  ownerId: string,
  schoolYear: number,
  name: string,
): Promise<string> {
  const found = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(
      and(
        eq(subjects.ownerId, ownerId),
        eq(subjects.schoolYear, schoolYear),
        eq(subjects.name, name),
      ),
    )
    .limit(1);
  if (found.length) return found[0].id;
  const [row] = await db
    .insert(subjects)
    .values({ ownerId, schoolYear, name })
    .returning({ id: subjects.id });
  return row.id;
}

async function getOrCreateSection(
  db: DB,
  ownerId: string,
  subjectId: string,
  label: string,
): Promise<string> {
  const found = await db
    .select({ id: courseSections.id })
    .from(courseSections)
    .where(
      and(
        eq(courseSections.ownerId, ownerId),
        eq(courseSections.subjectId, subjectId),
        eq(courseSections.label, label),
      ),
    )
    .limit(1);
  if (found.length) return found[0].id;
  const [row] = await db
    .insert(courseSections)
    .values({ ownerId, subjectId, label })
    .returning({ id: courseSections.id });
  return row.id;
}

export async function syncTeacherTimetable(
  db: DB,
  ownerId: string,
  schoolYear: number,
  slots: TimetableSlot[],
): Promise<TimetableSyncResult> {
  const subjectIdByName = new Map<string, string>();
  for (const name of new Set(slots.map((s) => s.subject))) {
    subjectIdByName.set(
      name,
      await getOrCreateSubject(db, ownerId, schoolYear, name),
    );
  }

  // (과목, 학년-반) → section
  const sectionKey = (s: TimetableSlot) => `${s.subject}|${s.grade}-${s.classNo}`;
  const sectionIdByKey = new Map<string, string>();
  for (const s of slots) {
    const key = sectionKey(s);
    if (sectionIdByKey.has(key)) continue;
    const subjectId = subjectIdByName.get(s.subject)!;
    sectionIdByKey.set(
      key,
      await getOrCreateSection(db, ownerId, subjectId, `${s.grade}-${s.classNo}`),
    );
  }

  // source='comcigan' 슬롯 전량 교체(멱등)
  const sectionIds = [...sectionIdByKey.values()];
  if (sectionIds.length > 0) {
    await db
      .delete(timetableSlots)
      .where(
        and(
          eq(timetableSlots.ownerId, ownerId),
          eq(timetableSlots.source, "comcigan"),
          inArray(timetableSlots.sectionId, sectionIds),
        ),
      );
  }
  for (const s of slots) {
    await db.insert(timetableSlots).values({
      ownerId,
      sectionId: sectionIdByKey.get(sectionKey(s))!,
      weekday: s.weekday,
      period: s.period,
      source: "comcigan",
    });
  }

  return {
    subjects: subjectIdByName.size,
    sections: sectionIdByKey.size,
    slots: slots.length,
  };
}

export interface TimetableViewSlot {
  weekday: number;
  period: number;
  subjectName: string;
  label: string;
}

/** 화면용: 교사의 주간 시간표 슬롯(요일·교시순). */
export async function getTeacherTimetable(
  db: DB,
  ownerId: string,
  schoolYear: number,
): Promise<TimetableViewSlot[]> {
  return db
    .select({
      weekday: timetableSlots.weekday,
      period: timetableSlots.period,
      subjectName: subjects.name,
      label: courseSections.label,
    })
    .from(timetableSlots)
    .innerJoin(courseSections, eq(timetableSlots.sectionId, courseSections.id))
    .innerJoin(subjects, eq(courseSections.subjectId, subjects.id))
    .where(
      and(
        eq(timetableSlots.ownerId, ownerId),
        eq(subjects.schoolYear, schoolYear),
      ),
    )
    .orderBy(asc(timetableSlots.weekday), asc(timetableSlots.period));
}

// ── 교사 프로필(컴시간 설정) ──

export interface TeacherComciganConfig {
  comciganSchool: string | null;
  comciganTeacher: string | null;
  lastTimetableSyncAt: Date | null;
}

export async function getTeacherProfile(
  db: DB,
  ownerId: string,
): Promise<TeacherComciganConfig | null> {
  const rows = await db
    .select({
      comciganSchool: teacherProfile.comciganSchool,
      comciganTeacher: teacherProfile.comciganTeacher,
      lastTimetableSyncAt: teacherProfile.lastTimetableSyncAt,
    })
    .from(teacherProfile)
    .where(eq(teacherProfile.ownerId, ownerId))
    .limit(1);
  return rows[0] ?? null;
}

/** 컴시간 설정 + 마지막 동기화 시각 upsert(owner 단일 행). */
export async function upsertTeacherComciganConfig(
  db: DB,
  ownerId: string,
  school: string,
  teacher: string,
  syncedAt: Date,
): Promise<void> {
  const existing = await db
    .select({ id: teacherProfile.id })
    .from(teacherProfile)
    .where(eq(teacherProfile.ownerId, ownerId))
    .limit(1);
  if (existing.length) {
    await db
      .update(teacherProfile)
      .set({
        comciganSchool: school,
        comciganTeacher: teacher,
        lastTimetableSyncAt: syncedAt,
        updatedAt: new Date(),
      })
      .where(eq(teacherProfile.ownerId, ownerId));
  } else {
    await db.insert(teacherProfile).values({
      ownerId,
      comciganSchool: school,
      comciganTeacher: teacher,
      lastTimetableSyncAt: syncedAt,
    });
  }
}
