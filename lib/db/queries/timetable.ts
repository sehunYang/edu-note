import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  sql as dsql,
} from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  subjects,
  courseSections,
  timetableSlots,
  performanceItems,
  enrollments,
  subjectExams,
  sectionPerformanceDates,
  sectionRoles,
} from "../schema/classes";
import { studentYears } from "../schema/identity";
import { teacherProfile, calendarEvents } from "../schema/misc";
import { validateEvalWeights } from "@/lib/domain/eval-weight";
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

// ── C5: 평가 설정(100% 검증) (AC-5.1) ──

export interface PerformanceWeight {
  name: string;
  weight: number;
}

export interface SaveEvalInput {
  performance: PerformanceWeight[];
  jipilMid: number;
  jipilFinal: number;
  midEnabled: boolean;
  finalEnabled: boolean;
}

/**
 * 과목 평가설정 저장(AC-5.1). validateEvalWeights 100% 검증 통과 시에만 저장한다 —
 * 실패 시 throw(부분 저장 없음). performance_items 를 통째로 교체한다.
 */
export async function saveEvalSettings(
  db: DB,
  ownerId: string,
  subjectId: string,
  input: SaveEvalInput,
): Promise<void> {
  const v = validateEvalWeights({
    performance: input.performance.map((p) => p.weight),
    jipilMid: input.jipilMid,
    jipilFinal: input.jipilFinal,
    midEnabled: input.midEnabled,
    finalEnabled: input.finalEnabled,
  });
  if (!v.ok) throw new Error(v.errors.join(" "));

  await db.transaction(async (tx) => {
    await tx
      .update(subjects)
      .set({
        jipilMidWeight: String(input.jipilMid),
        jipilFinalWeight: String(input.jipilFinal),
        jipilMidEnabled: input.midEnabled,
        jipilFinalEnabled: input.finalEnabled,
        updatedAt: new Date(),
      })
      .where(and(eq(subjects.id, subjectId), eq(subjects.ownerId, ownerId)));

    await tx
      .delete(performanceItems)
      .where(
        and(
          eq(performanceItems.ownerId, ownerId),
          eq(performanceItems.subjectId, subjectId),
        ),
      );
    if (input.performance.length > 0) {
      await tx.insert(performanceItems).values(
        input.performance.map((p) => ({
          ownerId,
          subjectId,
          name: p.name,
          weight: String(p.weight),
        })),
      );
    }
  });
}

// ── C5: 수강 등록(필터·일괄) (AC-5.x) ──

export interface EnrollFilter {
  schoolYear: number;
  grade?: number;
  classNo?: number;
}

/**
 * 분반 수강 일괄 등록(AC-5.x). studentYears 의 grade/classNo 컬럼 기준으로 필터하고
 * (sid 문자열 파싱 금지) 전체선택 등록한다. 중복 등록은 무시(unique 충돌 skip).
 */
export async function bulkEnroll(
  db: DB,
  ownerId: string,
  sectionId: string,
  filter: EnrollFilter,
): Promise<number> {
  const conds = [
    eq(studentYears.ownerId, ownerId),
    eq(studentYears.schoolYear, filter.schoolYear),
  ];
  if (filter.grade != null) conds.push(eq(studentYears.grade, filter.grade));
  if (filter.classNo != null)
    conds.push(eq(studentYears.classNo, filter.classNo));

  const matched = await db
    .select({ id: studentYears.id })
    .from(studentYears)
    .where(and(...conds));
  if (matched.length === 0) return 0;

  const inserted = await db
    .insert(enrollments)
    .values(matched.map((m) => ({ ownerId, sectionId, studentYearId: m.id })))
    .onConflictDoNothing({
      target: [enrollments.sectionId, enrollments.studentYearId],
    })
    .returning({ id: enrollments.id });
  return inserted.length;
}

export async function listEnrollments(
  db: DB,
  ownerId: string,
  sectionId: string,
): Promise<{ enrollmentId: string; studentYearId: string; name: string }[]> {
  return db
    .select({
      enrollmentId: enrollments.id,
      studentYearId: enrollments.studentYearId,
      name: studentYears.name,
    })
    .from(enrollments)
    .innerJoin(studentYears, eq(studentYears.id, enrollments.studentYearId))
    .where(
      and(
        eq(enrollments.ownerId, ownerId),
        eq(enrollments.sectionId, sectionId),
      ),
    )
    .orderBy(asc(studentYears.sid));
}

// ── C5: 수행평가 시행일 CRUD (AC-5.x) ──

export async function setPerformanceDate(
  db: DB,
  ownerId: string,
  sectionId: string,
  performanceItemId: string,
  date: string | null,
): Promise<void> {
  await db
    .insert(sectionPerformanceDates)
    .values({ ownerId, sectionId, performanceItemId, date })
    .onConflictDoUpdate({
      target: [
        sectionPerformanceDates.sectionId,
        sectionPerformanceDates.performanceItemId,
      ],
      set: { date: dsql`excluded.date`, updatedAt: new Date() },
    });
}

export async function listPerformanceDates(
  db: DB,
  ownerId: string,
  sectionId: string,
): Promise<{ performanceItemId: string; date: string | null }[]> {
  return db
    .select({
      performanceItemId: sectionPerformanceDates.performanceItemId,
      date: sectionPerformanceDates.date,
    })
    .from(sectionPerformanceDates)
    .where(
      and(
        eq(sectionPerformanceDates.ownerId, ownerId),
        eq(sectionPerformanceDates.sectionId, sectionId),
      ),
    );
}

// ── C5: 분반 역할 CRUD (AC-5.x) ──

export interface SectionRoleRow {
  id: string;
  enrollmentId: string;
  title: string;
  description: string | null;
}

export async function addSectionRole(
  db: DB,
  ownerId: string,
  enrollmentId: string,
  title: string,
  description?: string | null,
): Promise<string> {
  const [row] = await db
    .insert(sectionRoles)
    .values({ ownerId, enrollmentId, title, description: description ?? null })
    .returning({ id: sectionRoles.id });
  return row.id;
}

export async function listSectionRoles(
  db: DB,
  ownerId: string,
  enrollmentId: string,
): Promise<SectionRoleRow[]> {
  return db
    .select({
      id: sectionRoles.id,
      enrollmentId: sectionRoles.enrollmentId,
      title: sectionRoles.title,
      description: sectionRoles.description,
    })
    .from(sectionRoles)
    .where(
      and(
        eq(sectionRoles.ownerId, ownerId),
        eq(sectionRoles.enrollmentId, enrollmentId),
      ),
    )
    .orderBy(asc(sectionRoles.createdAt));
}

export async function deleteSectionRole(
  db: DB,
  ownerId: string,
  roleId: string,
): Promise<void> {
  await db
    .delete(sectionRoles)
    .where(and(eq(sectionRoles.id, roleId), eq(sectionRoles.ownerId, ownerId)));
}

// ── C5: 시험일 파생(C3 태깅 calendarEvents → subject_exams) + 시험경계 (AC-5.4) ──

/**
 * C3 에서 태깅된 exam calendarEvents 로부터 과목별 시험일을 파생 생성한다(AC-5.4).
 * (학기, 회차)별 최소 날짜를 취해 모든 과목에 upsert — ordinal 1=중간(midEnabled),
 * 2=기말(finalEnabled) 시행여부로 enabled 를 결정한다. 멱등(unique 충돌 시 갱신).
 */
export async function materializeSubjectExams(
  db: DB,
  ownerId: string,
  schoolYear: number,
): Promise<number> {
  const examDates = await db
    .select({
      semester: calendarEvents.examSemester,
      ordinal: calendarEvents.examOrdinal,
      date: dsql<string>`min(${calendarEvents.date})`,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.ownerId, ownerId),
        eq(calendarEvents.eventKind, "exam"),
        isNotNull(calendarEvents.examSemester),
        isNotNull(calendarEvents.examOrdinal),
      ),
    )
    .groupBy(calendarEvents.examSemester, calendarEvents.examOrdinal);
  if (examDates.length === 0) return 0;

  const subs = await db
    .select({
      id: subjects.id,
      midEnabled: subjects.jipilMidEnabled,
      finalEnabled: subjects.jipilFinalEnabled,
    })
    .from(subjects)
    .where(and(eq(subjects.ownerId, ownerId), eq(subjects.schoolYear, schoolYear)));

  let count = 0;
  for (const sub of subs) {
    for (const e of examDates) {
      if (e.semester == null || e.ordinal == null) continue;
      const enabled = e.ordinal === 1 ? sub.midEnabled : sub.finalEnabled;
      await db
        .insert(subjectExams)
        .values({
          ownerId,
          subjectId: sub.id,
          semester: e.semester,
          ordinal: e.ordinal,
          date: e.date,
          enabled,
        })
        .onConflictDoUpdate({
          target: [subjectExams.subjectId, subjectExams.semester, subjectExams.ordinal],
          set: { date: dsql`excluded.date`, enabled: dsql`excluded.enabled`, updatedAt: new Date() },
        });
      count += 1;
    }
  }
  return count;
}

/**
 * 시험경계일 읽기시점 파생(AC-5.4). 저장 컬럼 의존 대신 subject_exams 중 enabled=true
 * 이고 오늘 이후인 최소 날짜를 매 호출 산출한다(cron 부재로 staleness 방지).
 */
export async function deriveExamBoundaryDate(
  db: DB,
  ownerId: string,
  subjectId: string,
  today: string,
): Promise<string | null> {
  const [row] = await db
    .select({ next: dsql<string | null>`min(${subjectExams.date})` })
    .from(subjectExams)
    .where(
      and(
        eq(subjectExams.ownerId, ownerId),
        eq(subjectExams.subjectId, subjectId),
        eq(subjectExams.enabled, true),
        isNotNull(subjectExams.date),
        gte(subjectExams.date, today),
      ),
    );
  return row?.next ?? null;
}

export async function listSubjectExams(
  db: DB,
  ownerId: string,
  subjectId: string,
): Promise<
  { semester: number; ordinal: number; date: string | null; enabled: boolean }[]
> {
  return db
    .select({
      semester: subjectExams.semester,
      ordinal: subjectExams.ordinal,
      date: subjectExams.date,
      enabled: subjectExams.enabled,
    })
    .from(subjectExams)
    .where(
      and(
        eq(subjectExams.ownerId, ownerId),
        eq(subjectExams.subjectId, subjectId),
      ),
    )
    .orderBy(asc(subjectExams.semester), asc(subjectExams.ordinal));
}

export interface SubjectSectionView {
  subjectId: string;
  subjectName: string;
  sections: { id: string; label: string }[];
}

/** 화면용: 과목 + 분반 목록(분반 상세 진입). */
export async function listSubjectsWithSections(
  db: DB,
  ownerId: string,
  schoolYear: number,
): Promise<SubjectSectionView[]> {
  const rows = await db
    .select({
      subjectId: subjects.id,
      subjectName: subjects.name,
      sectionId: courseSections.id,
      label: courseSections.label,
    })
    .from(subjects)
    .leftJoin(courseSections, eq(courseSections.subjectId, subjects.id))
    .where(and(eq(subjects.ownerId, ownerId), eq(subjects.schoolYear, schoolYear)))
    .orderBy(asc(subjects.name), asc(courseSections.label));

  const bySubject = new Map<string, SubjectSectionView>();
  for (const r of rows) {
    let s = bySubject.get(r.subjectId);
    if (!s) {
      s = { subjectId: r.subjectId, subjectName: r.subjectName, sections: [] };
      bySubject.set(r.subjectId, s);
    }
    if (r.sectionId) s.sections.push({ id: r.sectionId, label: r.label! });
  }
  return [...bySubject.values()];
}

// ── P3: N+1 제거용 배치 쿼리(집합 단위 1회 + 메모리 그룹핑) ──
//
// 화면(courses/students)에서 행 단위 루프로 호출하던 listSubjectExams /
// listEnrollments / listSectionRoles / listClassRoles 를 연도·집합 단위 1회 조회로
// 대체한다. 결과는 단건 함수와 **동치**(같은 그룹화·정렬)이며 동치성은 통합테스트가 잠근다.

export type SubjectExamRow = {
  semester: number;
  ordinal: number;
  date: string | null;
  enabled: boolean;
};

/** 연도 전 과목 시험일 1회 조회 → subjectId 그룹핑(단건 listSubjectExams 동치). */
export async function listSubjectExamsForYear(
  db: DB,
  ownerId: string,
  schoolYear: number,
): Promise<Map<string, SubjectExamRow[]>> {
  const rows = await db
    .select({
      subjectId: subjectExams.subjectId,
      semester: subjectExams.semester,
      ordinal: subjectExams.ordinal,
      date: subjectExams.date,
      enabled: subjectExams.enabled,
    })
    .from(subjectExams)
    .innerJoin(subjects, eq(subjects.id, subjectExams.subjectId))
    .where(
      and(eq(subjectExams.ownerId, ownerId), eq(subjects.schoolYear, schoolYear)),
    )
    .orderBy(asc(subjectExams.semester), asc(subjectExams.ordinal));

  const bySubject = new Map<string, SubjectExamRow[]>();
  for (const { subjectId, ...rest } of rows) {
    const arr = bySubject.get(subjectId);
    if (arr) arr.push(rest);
    else bySubject.set(subjectId, [rest]);
  }
  return bySubject;
}

export type EnrollmentRow = {
  enrollmentId: string;
  studentYearId: string;
  name: string;
};

/** 연도 전 분반 수강생 1회 조회 → sectionId 그룹핑(단건 listEnrollments 동치, sid순). */
export async function listEnrollmentsForYear(
  db: DB,
  ownerId: string,
  schoolYear: number,
): Promise<Map<string, EnrollmentRow[]>> {
  const rows = await db
    .select({
      sectionId: enrollments.sectionId,
      enrollmentId: enrollments.id,
      studentYearId: enrollments.studentYearId,
      name: studentYears.name,
    })
    .from(enrollments)
    .innerJoin(studentYears, eq(studentYears.id, enrollments.studentYearId))
    .innerJoin(courseSections, eq(courseSections.id, enrollments.sectionId))
    .innerJoin(subjects, eq(subjects.id, courseSections.subjectId))
    .where(
      and(eq(enrollments.ownerId, ownerId), eq(subjects.schoolYear, schoolYear)),
    )
    .orderBy(asc(enrollments.sectionId), asc(studentYears.sid));

  const bySection = new Map<string, EnrollmentRow[]>();
  for (const { sectionId, ...rest } of rows) {
    const arr = bySection.get(sectionId);
    if (arr) arr.push(rest);
    else bySection.set(sectionId, [rest]);
  }
  return bySection;
}

/** enrollmentId 집합의 분반 역할 1회 조회 → enrollmentId 그룹핑(단건 listSectionRoles 동치). */
export async function listSectionRolesForEnrollments(
  db: DB,
  ownerId: string,
  enrollmentIds: string[],
): Promise<Map<string, SectionRoleRow[]>> {
  const byEnrollment = new Map<string, SectionRoleRow[]>();
  if (enrollmentIds.length === 0) return byEnrollment;

  const rows = await db
    .select({
      id: sectionRoles.id,
      enrollmentId: sectionRoles.enrollmentId,
      title: sectionRoles.title,
      description: sectionRoles.description,
    })
    .from(sectionRoles)
    .where(
      and(
        eq(sectionRoles.ownerId, ownerId),
        inArray(sectionRoles.enrollmentId, enrollmentIds),
      ),
    )
    .orderBy(asc(sectionRoles.enrollmentId), asc(sectionRoles.createdAt));

  for (const r of rows) {
    const arr = byEnrollment.get(r.enrollmentId);
    if (arr) arr.push(r);
    else byEnrollment.set(r.enrollmentId, [r]);
  }
  return byEnrollment;
}
