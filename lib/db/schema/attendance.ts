import {
  pgTable,
  uuid,
  text,
  date,
  boolean,
  timestamp,
  check,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { pk, ownerId, timestamps } from "./_shared";
import { studentYears } from "./identity";
import { attendanceReason, attendanceKind, reportTier } from "./enums";

/**
 * 출결 (계획 §3.3 F). 사유×성격, 신고서 제출여부 마킹, 에스컬레이션 스냅샷 영속.
 * 신고서 기한 = 수업일 5일, 티어 정상(≤3)/위험(>3)/심각(>5), 일일 pg_cron 재계산.
 */

// 출결 기록 (사유 × 성격)
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: pk(),
    ownerId: ownerId(),
    studentYearId: uuid("student_year_id")
      .notNull()
      .references(() => studentYears.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    reason: attendanceReason("reason").notNull(),
    kind: attendanceKind("kind").notNull(),
    reportRequired: boolean("report_required").notNull().default(false), // 파생 저장
    reportSubmitted: boolean("report_submitted").notNull().default(false),
    noteField: text("note_field"), // 자유텍스트(공개 DTO 절대 미포함)
    ...timestamps(),
  },
  (t) => [
    // 하루·한 성격당 1행 — upsert 경합 방지(onConflictDoUpdate 타깃).
    unique("uq_attendance_owner_student_date_kind").on(
      t.ownerId,
      t.studentYearId,
      t.date,
      t.kind,
    ),
  ],
);

// 교외체험학습 사후보고서 (신청서는 추적 안 함)
export const fieldTripReports = pgTable("field_trip_reports", {
  id: pk(),
  ownerId: ownerId(),
  studentYearId: uuid("student_year_id")
    .notNull()
    .references(() => studentYears.id, { onDelete: "cascade" }),
  tripDate: date("trip_date").notNull(),
  postReportSubmitted: boolean("post_report_submitted")
    .notNull()
    .default(false),
  ...timestamps(),
});

// 신고서 추적 (에스컬레이션 스냅샷 영속). 출결 또는 교외체험 중 정확히 하나.
export const reportTracking = pgTable(
  "report_tracking",
  {
    id: pk(),
    ownerId: ownerId(),
    attendanceRecordId: uuid("attendance_record_id").references(
      () => attendanceRecords.id,
      { onDelete: "cascade" },
    ),
    fieldTripId: uuid("field_trip_id").references(() => fieldTripReports.id, {
      onDelete: "cascade",
    }),
    deadlineDate: date("deadline_date"), // 수업일 기반 파생
    lastTier: reportTier("last_tier").notNull().default("normal"),
    lastComputedAt: timestamp("last_computed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    // 한 추적행은 출결 또는 교외체험 중 정확히 하나만 가리킴 (계획 N1)
    check(
      "ck_report_tracking_exactly_one",
      sql`num_nonnulls(${t.attendanceRecordId}, ${t.fieldTripId}) = 1`,
    ),
  ],
);
