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
  index,
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

// 동아리 예정활동(차시). QC v5 c9 (0038). calendarEvents.eventKind='club' 날짜 시퀀스 →
// ordinal(날짜순 파생) + 차시별 예정활동. 재생성 reconcile 키 = (clubId, date)로 사용자
// 입력 plannedActivity 를 보존(ordinal 은 비-unique 파생 컬럼). uq_* 이름·컬럼은 0038 SQL 과 1:1.
export const clubActivitySessions = pgTable(
  "club_activity_sessions",
  {
    id: pk(),
    ownerId: ownerId(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    date: date("date").notNull(),
    plannedActivity: text("planned_activity"),
    ...timestamps(),
  },
  (t) => [unique("uq_club_activity_sessions").on(t.clubId, t.date)],
);

// 오늘의학교 전용 일자별 메모. QC v5 c7 (0039). 일자별 다건 허용(unique 없음).
// 오직 오늘의학교 캘린더에서만 노출(공개 페이지/타 캘린더 비노출).
export const todayCalendarMemos = pgTable("today_calendar_memos", {
  id: pk(),
  ownerId: ownerId(),
  date: date("date").notNull(),
  content: text("content").notNull(),
  ...timestamps(),
});

// 학생 안내 페이지 전용 개인 메모/일정. QC v6 ⑤ (0042). 토큰(학생) 스코프 — 해당 학생만
// 자신의 메모를 조회·CRUD하고 교사/타학생에게는 절대 비노출(get_public_page v6가 v_sy_id
// 스코프로만 노출). 일자별 다건 허용(today_calendar_memos 패턴) → (student_year_id, date)
// unique 두지 않고 보조 인덱스만.
export const studentCalendarMemos = pgTable(
  "student_calendar_memos",
  {
    id: pk(),
    studentYearId: uuid("student_year_id")
      .notNull()
      .references(() => studentYears.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    body: text("body").notNull(),
    ...timestamps(),
  },
  (t) => [index("idx_student_calendar_memos_student_date").on(t.studentYearId, t.date)],
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

// ── QC v3 Part B (담임 교실 허브) ──

// 상담 슬롯(교사 오픈 날짜별 정원) + 예약(학생 선착순). 0021.
export const counselSlots = pgTable(
  "counsel_slots",
  {
    id: pk(),
    ownerId: ownerId(),
    date: date("date").notNull(),
    capacity: integer("capacity").notNull().default(1),
    ...timestamps(),
  },
  (t) => [unique("uq_counsel_slots").on(t.ownerId, t.date)],
);

export const counselReservations = pgTable(
  "counsel_reservations",
  {
    id: pk(),
    ownerId: ownerId(),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => counselSlots.id, { onDelete: "cascade" }),
    studentYearId: uuid("student_year_id")
      .notNull()
      .references(() => studentYears.id, { onDelete: "cascade" }),
    // 학생 취소 요청 플래그(교사 승인 대기). 승인 시 예약 행 삭제로 정원 환원. 0035.
    cancelRequested: boolean("cancel_requested").notNull().default(false),
    ...timestamps(),
  },
  (t) => [unique("uq_counsel_reservations").on(t.slotId, t.studentYearId)],
);

// 다중 교사 한마디(공개 페이지 스와이프). 0022. 기존 단일 publicNotice 이행.
// targetScope: 'all'(전체 공개) | 'individual'(특정 학생만 — teacher_note_targets 매핑). 0034.
export const teacherNotes = pgTable("teacher_notes", {
  id: pk(),
  ownerId: ownerId(),
  body: text("body").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  targetScope: text("target_scope").notNull().default("all"),
  ...timestamps(),
});

// 개별 공지 대상 매핑(한마디↔학생 다대다). targetScope='individual' 일 때만 사용. 0034.
export const teacherNoteTargets = pgTable(
  "teacher_note_targets",
  {
    id: pk(),
    ownerId: ownerId(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => teacherNotes.id, { onDelete: "cascade" }),
    studentYearId: uuid("student_year_id")
      .notNull()
      .references(() => studentYears.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [unique("uq_teacher_note_targets").on(t.noteId, t.studentYearId)],
);

// 고정반 수업 설정(컴시간 학년파싱 기반, 미체크=선택과목). 0023.
export const fixedClassSettings = pgTable(
  "fixed_class_settings",
  {
    id: pk(),
    ownerId: ownerId(),
    grade: integer("grade").notNull(),
    classNo: integer("class_no").notNull(),
    subjectName: text("subject_name").notNull(),
    isFixed: boolean("is_fixed").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    unique("uq_fixed_class_settings").on(
      t.ownerId,
      t.grade,
      t.classNo,
      t.subjectName,
    ),
  ],
);

// 학생 선택과목 자가매핑(요일·교시→과목, 1:1 영속). 0024.
export const studentElectiveMappings = pgTable(
  "student_elective_mappings",
  {
    id: pk(),
    ownerId: ownerId(),
    studentYearId: uuid("student_year_id")
      .notNull()
      .references(() => studentYears.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    period: integer("period").notNull(),
    mappedSubject: text("mapped_subject").notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("uq_student_elective_mappings").on(
      t.studentYearId,
      t.weekday,
      t.period,
    ),
  ],
);

// 담임반 시간표 캐시(컴시간 학년파싱 → grade/classNo 슬롯). 0028. 공개 페이지 시간표 소스.
export const homeroomTimetableSlots = pgTable(
  "homeroom_timetable_slots",
  {
    id: pk(),
    ownerId: ownerId(),
    grade: integer("grade").notNull(),
    classNo: integer("class_no").notNull(),
    weekday: integer("weekday").notNull(),
    period: integer("period").notNull(),
    subjectName: text("subject_name").notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("uq_homeroom_timetable_slots").on(
      t.ownerId,
      t.grade,
      t.classNo,
      t.weekday,
      t.period,
    ),
  ],
);

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
  // 공지(할일=manual source)의 본문 '내용' 필드. QC v3 Part B (0022). nullable.
  content: text("content"),
  examSemester: integer("exam_semester"),
  examOrdinal: integer("exam_ordinal"),
  // 미분류 자동분류(self_activity fallback) 경고 플래그 (QC v2 2-1 B).
  needsReview: boolean("needs_review").notNull().default(false),
  // 학생 공개 페이지(weekTodos) 노출 여부 (보안점검 2026-07, 0045). false=교사 내부용.
  isPublic: boolean("is_public").notNull().default(true),
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
  // 기본 만료 = 발급일 + 1년 (보안점검 2026-07, 0047). 앱(issuePublicPage)과 DB 기본값 동일.
  expiresAt: timestamp("expires_at", { withTimezone: true }).default(
    sql`now() + interval '1 year'`,
  ),
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
// payload = { meals: [ { mealType, menu: text[], calInfo, ntrInfo } ] }.
// 영양정보(ntrInfo)는 jsonb payload 안에 함께 저장 — 별도 컬럼 없음(0035, DDL 불필요).
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
