import { eq, type Column } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { persons, studentYears, yearLinks } from "../schema/identity";
import {
  homeroomClasses,
  homeroomMembers,
  subjects,
  performanceItems,
  courseSections,
  enrollments,
  timetableSlots,
  classSessions,
} from "../schema/classes";
import {
  subjectObservations,
  homeroomBehaviorNotes,
  performanceAssessments,
  creativeActivityRecords,
  creativeActivityStudentOverrides,
  classRoles,
  studentActivityEntries,
  studentExtraNotes,
  specialNoteDrafts,
} from "../schema/records";
import {
  attendanceRecords,
  fieldTripReports,
  reportTracking,
} from "../schema/attendance";
import {
  clubs,
  clubMembers,
  counselingLogs,
  tasks,
  budgets,
  budgetExpenses,
  calendarEvents,
  schoolDayCalendar,
  grades,
  publicPages,
  teacherProfile,
  setupState,
  mealCache,
  auditLog,
} from "../schema/misc";

/**
 * 주간 백업 내보내기 (계획 §3.2/§6, AC — 무료티어 데이터 손실 1차 안전망).
 *
 * owner 스코프의 전 테이블을 JSON 직렬화 가능한 객체로 모은다. 본인 인증 후
 * 즉시 다운로드용이며 서버에 보존하지 않는다(라우트에서 attachment 로 전송).
 * ⚠ 결과물은 학생 PII·공개 토큰을 포함하므로 안전하게 보관/폐기해야 한다.
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface OwnerBackup {
  exportedAt: string;
  ownerId: string;
  tables: Record<string, unknown[]>;
}

export async function exportOwnerData(
  db: DB,
  ownerId: string,
): Promise<OwnerBackup> {
  const own = (table: PgTable & { ownerId: Column }): Promise<unknown[]> =>
    db.select().from(table).where(eq(table.ownerId, ownerId));

  const [
    personsRows,
    studentYearsRows,
    yearLinksRows,
    homeroomClassesRows,
    homeroomMembersRows,
    subjectsRows,
    performanceItemsRows,
    courseSectionsRows,
    enrollmentsRows,
    timetableSlotsRows,
    classSessionsRows,
    subjectObservationsRows,
    homeroomBehaviorNotesRows,
    performanceAssessmentsRows,
    creativeActivityRecordsRows,
    creativeActivityStudentOverridesRows,
    classRolesRows,
    studentActivityEntriesRows,
    studentExtraNotesRows,
    specialNoteDraftsRows,
    attendanceRecordsRows,
    fieldTripReportsRows,
    reportTrackingRows,
    clubsRows,
    clubMembersRows,
    counselingLogsRows,
    tasksRows,
    budgetsRows,
    budgetExpensesRows,
    calendarEventsRows,
    schoolDayCalendarRows,
    gradesRows,
    publicPagesRows,
    teacherProfileRows,
    setupStateRows,
    mealCacheRows,
    auditLogRows,
  ] = await Promise.all([
    own(persons),
    own(studentYears),
    own(yearLinks),
    own(homeroomClasses),
    own(homeroomMembers),
    own(subjects),
    own(performanceItems),
    own(courseSections),
    own(enrollments),
    own(timetableSlots),
    own(classSessions),
    own(subjectObservations),
    own(homeroomBehaviorNotes),
    own(performanceAssessments),
    own(creativeActivityRecords),
    own(creativeActivityStudentOverrides),
    own(classRoles),
    own(studentActivityEntries),
    own(studentExtraNotes),
    own(specialNoteDrafts),
    own(attendanceRecords),
    own(fieldTripReports),
    own(reportTracking),
    own(clubs),
    own(clubMembers),
    own(counselingLogs),
    own(tasks),
    own(budgets),
    own(budgetExpenses),
    own(calendarEvents),
    own(schoolDayCalendar),
    own(grades),
    own(publicPages),
    own(teacherProfile),
    own(setupState),
    own(mealCache),
    own(auditLog),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    ownerId,
    tables: {
      persons: personsRows,
      student_years: studentYearsRows,
      year_links: yearLinksRows,
      homeroom_classes: homeroomClassesRows,
      homeroom_members: homeroomMembersRows,
      subjects: subjectsRows,
      performance_items: performanceItemsRows,
      course_sections: courseSectionsRows,
      enrollments: enrollmentsRows,
      timetable_slots: timetableSlotsRows,
      class_sessions: classSessionsRows,
      subject_observations: subjectObservationsRows,
      homeroom_behavior_notes: homeroomBehaviorNotesRows,
      performance_assessments: performanceAssessmentsRows,
      creative_activity_records: creativeActivityRecordsRows,
      creative_activity_student_overrides: creativeActivityStudentOverridesRows,
      class_roles: classRolesRows,
      student_activity_entries: studentActivityEntriesRows,
      student_extra_notes: studentExtraNotesRows,
      special_note_drafts: specialNoteDraftsRows,
      attendance_records: attendanceRecordsRows,
      field_trip_reports: fieldTripReportsRows,
      report_tracking: reportTrackingRows,
      clubs: clubsRows,
      club_members: clubMembersRows,
      counseling_logs: counselingLogsRows,
      tasks: tasksRows,
      budgets: budgetsRows,
      budget_expenses: budgetExpensesRows,
      calendar_events: calendarEventsRows,
      school_day_calendar: schoolDayCalendarRows,
      grades: gradesRows,
      public_pages: publicPagesRows,
      teacher_profile: teacherProfileRows,
      setup_state: setupStateRows,
      meal_cache: mealCacheRows,
      audit_log: auditLogRows,
    },
  };
}
