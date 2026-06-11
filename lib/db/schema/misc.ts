import {
  pgTable,
  uuid,
  text,
  date,
  integer,
  numeric,
  boolean,
  jsonb,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { pk, ownerId, timestamps } from "./_shared";
import { studentYears } from "./identity";
import { subjects } from "./classes";
import { counselTarget, calendarSource, ccaArea, eventKind } from "./enums";

/**
 * 기타 (계획 §3.3): 동아리, 상담, 업무/예산, 캘린더, 수업일 캘린더,
 * 성적(Phase1 목업), 공개 페이지, 교사 프로필, 초기세팅, 급식, 감사로그.
 */

// 동아리 (records.ts 에서 참조)
export const clubs = pgTable("clubs", {
  id: pk(),
  ownerId: ownerId(),
  name: text("name").notNull(),
  ...timestamps(),
});

export const clubMembers = pgTable(
  "club_members",
  {
    id: pk(),
    ownerId: ownerId(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    studentYearId: uuid("student_year_id")
      .notNull()
      .references(() => studentYears.id, { onDelete: "cascade" }),
    desiredCareer: text("desired_career"),
    ...timestamps(),
  },
  (t) => [unique("uq_club_members").on(t.clubId, t.studentYearId)],
);

// 상담일지 (AI분석 컬럼은 추후 — 목업 UI)
export const counselingLogs = pgTable("counseling_logs", {
  id: pk(),
  ownerId: ownerId(),
  studentYearId: uuid("student_year_id")
    .notNull()
    .references(() => studentYears.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  target: counselTarget("target").notNull(),
  body: text("body").notNull(),
  ...timestamps(),
});

// 업무 (데드라인 to-do + 진척)
export const tasks = pgTable("tasks", {
  id: pk(),
  ownerId: ownerId(),
  title: text("title").notNull(),
  deadline: date("deadline"),
  progress: integer("progress").notNull().default(0), // 0~100
  ...timestamps(),
});

// 예산 (영역·총액) + 지출
export const budgets = pgTable("budgets", {
  id: pk(),
  ownerId: ownerId(),
  area: text("area").notNull(),
  plannedAmount: numeric("planned_amount").notNull().default("0"),
  ...timestamps(),
});

export const budgetExpenses = pgTable("budget_expenses", {
  id: pk(),
  ownerId: ownerId(),
  budgetId: uuid("budget_id")
    .notNull()
    .references(() => budgets.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  amount: numeric("amount").notNull(),
  memo: text("memo"),
  ...timestamps(),
});

// 캘린더 일정 (학사일정/수동/개인/업무, 창체영역 분류)
export const calendarEvents = pgTable("calendar_events", {
  id: pk(),
  ownerId: ownerId(),
  date: date("date").notNull(),
  source: calendarSource("source").notNull(),
  ccaArea: ccaArea("cca_area"),
  title: text("title").notNull(),
  // 키워드 자동 분류 + 시험 학기/회차 (QC v1 C3, AC-3.1~3.4)
  eventKind: eventKind("event_kind").notNull().default("self_activity"),
  examSemester: integer("exam_semester"),
  examOrdinal: integer("exam_ordinal"),
  // 미분류 자동분류(self_activity fallback) 경고 플래그 (QC v2 2-1 B).
  needsReview: boolean("needs_review").notNull().default(false),
  ...timestamps(),
});

// 수업일 캘린더 (공휴일·주말 제외 — 신고서 기한·잔여시수 단일 진실원)
export const schoolDayCalendar = pgTable(
  "school_day_calendar",
  {
    id: pk(),
    ownerId: ownerId(),
    date: date("date").notNull(),
    isSchoolDay: boolean("is_school_day").notNull().default(true),
    ...timestamps(),
  },
  (t) => [unique("uq_school_day_calendar").on(t.ownerId, t.date)],
);

// 성적 (Phase1 목업 — 스키마만). 공개 페이지는 목업일 때 '준비중'.
export const grades = pgTable("grades", {
  id: pk(),
  ownerId: ownerId(),
  studentYearId: uuid("student_year_id")
    .notNull()
    .references(() => studentYears.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  rank: integer("rank"),
  grade5: integer("grade_5"), // 2022개정 5등급
  achievement: text("achievement"), // 성취도 A~E
  ...timestamps(),
});

// 학생별 공개 토큰 페이지
export const publicPages = pgTable("public_pages", {
  id: pk(),
  ownerId: ownerId(),
  studentYearId: uuid("student_year_id")
    .notNull()
    .references(() => studentYears.id, { onDelete: "cascade" }),
  token: text("token")
    .notNull()
    .unique()
    .default(sql`encode(gen_random_bytes(16), 'hex')`), // 128bit
  commonPayload: jsonb("common_payload"),
  teacherMessage: text("teacher_message"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  ...timestamps(),
});

// 교사 프로필 (단일 행)
export const teacherProfile = pgTable("teacher_profile", {
  id: pk(),
  ownerId: ownerId().unique(),
  name: text("name"),
  subjectsTaught: text("subjects_taught"),
  // 교사 기본 설정 (QC v1 C2, AC-2.1~2.2)
  schoolName: text("school_name"),
  isHomeroom: boolean("is_homeroom").notNull().default(false),
  homeroomGrade: integer("homeroom_grade"),
  homeroomClassNo: integer("homeroom_class_no"),
  // 컴시간 시간표 sync 설정 (계획 §3.3 B, migration 0003)
  comciganSchool: text("comcigan_school"),
  comciganTeacher: text("comcigan_teacher"),
  lastTimetableSyncAt: timestamp("last_timetable_sync_at", {
    withTimezone: true,
  }),
  // NEIS 학사일정·급식 sync 설정 (계획 §3.3 E, migration 0004)
  neisOfficeCode: text("neis_office_code"),
  neisSchoolCode: text("neis_school_code"),
  neisSchoolName: text("neis_school_name"),
  lastCalendarSyncAt: timestamp("last_calendar_sync_at", {
    withTimezone: true,
  }),
  // 공개 페이지 공통 '교사 한마디'(공지실, 계획 §4 Phase2-I, migration 0007)
  publicNotice: text("public_notice"),
  ...timestamps(),
});

// 초기세팅 게이트
export const setupState = pgTable(
  "setup_state",
  {
    id: pk(),
    ownerId: ownerId(),
    feature: text("feature").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [unique("uq_setup_state").on(t.ownerId, t.feature)],
);

// 급식 캐시
export const mealCache = pgTable(
  "meal_cache",
  {
    id: pk(),
    ownerId: ownerId(),
    date: date("date").notNull(),
    payload: jsonb("payload"),
    ...timestamps(),
  },
  (t) => [unique("uq_meal_cache").on(t.ownerId, t.date)],
);

// 감사 로그
export const auditLog = pgTable("audit_log", {
  id: pk(),
  ownerId: ownerId(),
  eventType: text("event_type").notNull(),
  ref: text("ref"),
  detail: jsonb("detail"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
