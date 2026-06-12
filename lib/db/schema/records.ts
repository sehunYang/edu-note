import {
  pgTable,
  uuid,
  text,
  date,
  numeric,
  integer,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { pk, ownerId, timestamps } from "./_shared";
import { studentYears } from "./identity";
import { subjects, courseSections, classSessions } from "./classes";
import { clubs } from "./misc";
import {
  creativeArea,
  activityTag,
  activityPlacement,
  specialNoteType,
  specialNoteStatus,
  specialNoteSource,
} from "./enums";

/**
 * 기록/세특 (계획 §3.3 C/D). 교과 관찰 8키워드 / 행특 7키워드 2스트림,
 * 창체활동(공통+학생별 오버라이드), 특기사항 초안(코워크 기본).
 */

// 교과 관찰기록 (수업당 2명, 교과키워드)
export const subjectObservations = pgTable("subject_observations", {
  id: pk(),
  ownerId: ownerId(),
  studentYearId: uuid("student_year_id")
    .notNull()
    .references(() => studentYears.id, { onDelete: "cascade" }),
  sectionId: uuid("section_id").references(() => courseSections.id, {
    onDelete: "set null",
  }),
  sessionId: uuid("session_id").references(() => classSessions.id, {
    onDelete: "set null",
  }),
  observedOn: date("observed_on").notNull(),
  body: text("body").notNull(),
  keywords: text("keywords").array(),
  ...timestamps(),
});

// 담임 행동특성 기록 (매일 16시 후, 행특키워드)
export const homeroomBehaviorNotes = pgTable("homeroom_behavior_notes", {
  id: pk(),
  ownerId: ownerId(),
  studentYearId: uuid("student_year_id")
    .notNull()
    .references(() => studentYears.id, { onDelete: "cascade" }),
  notedOn: date("noted_on").notNull(),
  body: text("body").notNull(),
  keywords: text("keywords").array(),
  ...timestamps(),
});

// 수행평가 (점수 + 줄글)
export const performanceAssessments = pgTable("performance_assessments", {
  id: pk(),
  ownerId: ownerId(),
  studentYearId: uuid("student_year_id")
    .notNull()
    .references(() => studentYears.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  score: numeric("score"),
  prose: text("prose"),
  ...timestamps(),
});

// 창체활동 기록 (영역별 공통내용)
export const creativeActivityRecords = pgTable("creative_activity_records", {
  id: pk(),
  ownerId: ownerId(),
  area: creativeArea("area").notNull(),
  activityDate: date("activity_date").notNull(),
  commonBody: text("common_body"),
  clubId: uuid("club_id").references(() => clubs.id, { onDelete: "set null" }),
  ...timestamps(),
});

// 창체활동 학생별 오버라이드
export const creativeActivityStudentOverrides = pgTable(
  "creative_activity_student_overrides",
  {
    id: pk(),
    ownerId: ownerId(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => creativeActivityRecords.id, { onDelete: "cascade" }),
    studentYearId: uuid("student_year_id")
      .notNull()
      .references(() => studentYears.id, { onDelete: "cascade" }),
    body: text("body"),
    ...timestamps(),
  },
);

// 학급역할 (개별봉사, 시간 미추적)
export const classRoles = pgTable("class_roles", {
  id: pk(),
  ownerId: ownerId(),
  studentYearId: uuid("student_year_id")
    .notNull()
    .references(() => studentYears.id, { onDelete: "cascade" }),
  roleName: text("role_name").notNull(),
  roleDesc: text("role_desc"),
  serviceTimeFlag: boolean("service_time_flag").notNull().default(false),
  ...timestamps(),
});

// 학생 활동 기입 (자율/진로/both → 생성 시 placement 1곳 확정)
export const studentActivityEntries = pgTable("student_activity_entries", {
  id: pk(),
  ownerId: ownerId(),
  studentYearId: uuid("student_year_id")
    .notNull()
    .references(() => studentYears.id, { onDelete: "cascade" }),
  tag: activityTag("tag").notNull(),
  placement: activityPlacement("placement"),
  body: text("body").notNull(),
  ...timestamps(),
});

// 학생 추가메모 (세특 입력 보조)
export const studentExtraNotes = pgTable("student_extra_notes", {
  id: pk(),
  ownerId: ownerId(),
  studentYearId: uuid("student_year_id")
    .notNull()
    .references(() => studentYears.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id").references(() => subjects.id, {
    onDelete: "set null",
  }),
  body: text("body").notNull(),
  ...timestamps(),
});

// 수업 계획 (교실 2-2 수업계획실). 과목단위 차시 1..N. 핵심개념=keywords 해시태그.
export const lessonPlans = pgTable(
  "lesson_plans",
  {
    id: pk(),
    ownerId: ownerId(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    content: text("content"),
    keywords: text("keywords").array(),
    ...timestamps(),
  },
  (t) => [unique("uq_lesson_plans").on(t.subjectId, t.ordinal)],
);

// 진척도 실제 기록 (교실 2-2). classSessions 1:1. plan_ordinal=토글로딩 매핑(날짜순위/수동).
export const sessionRecords = pgTable(
  "session_records",
  {
    id: pk(),
    ownerId: ownerId(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => classSessions.id, { onDelete: "cascade" }),
    actualContent: text("actual_content"),
    keywords: text("keywords").array(),
    evalIdea: text("eval_idea"),
    planOrdinal: integer("plan_ordinal"),
    ...timestamps(),
  },
  (t) => [unique("uq_session_records").on(t.sessionId)],
);

// 지필 원점수 (교실 2-2 성적기록). 환산은 읽기시점. ordinal 1=중간 2=기말.
export const jipilScores = pgTable(
  "jipil_scores",
  {
    id: pk(),
    ownerId: ownerId(),
    studentYearId: uuid("student_year_id")
      .notNull()
      .references(() => studentYears.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    rawScore: numeric("raw_score"),
    ...timestamps(),
  },
  (t) => [unique("uq_jipil_scores").on(t.studentYearId, t.subjectId, t.ordinal)],
);

// 특기사항 초안 (5종). source=cowork 기본(코워크 생성 텍스트 붙여넣기).
export const specialNoteDrafts = pgTable("special_note_drafts", {
  id: pk(),
  ownerId: ownerId(),
  studentYearId: uuid("student_year_id")
    .notNull()
    .references(() => studentYears.id, { onDelete: "cascade" }),
  type: specialNoteType("type").notNull(),
  subjectId: uuid("subject_id").references(() => subjects.id, {
    onDelete: "set null",
  }),
  content: text("content").notNull().default(""),
  byteCount: integer("byte_count").notNull().default(0),
  byteLimit: integer("byte_limit").notNull(),
  status: specialNoteStatus("status").notNull().default("draft"),
  source: specialNoteSource("source").notNull().default("cowork"),
  model: text("model"), // api 경로일 때 모델명, cowork면 null/수동메모
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  ...timestamps(),
});
