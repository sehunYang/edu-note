import {
  pgTable,
  uuid,
  text,
  integer,
  date,
  numeric,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { pk, ownerId, timestamps } from "./_shared";
import { studentYears } from "./identity";
import { evalMethod, timetableSource, sessionStatus } from "./enums";

/**
 * 그룹/수업/시수 (계획 §3.3 B). 과목→분반→수강/시간표/차시.
 * exam_boundary_date = "다가오는 시험" 단일날짜(재지정 가능). 잔여시수 분모.
 */

// 담임 학급
export const homeroomClasses = pgTable(
  "homeroom_classes",
  {
    id: pk(),
    ownerId: ownerId(),
    schoolYear: integer("school_year").notNull(),
    grade: integer("grade").notNull(),
    classNo: integer("class_no").notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("uq_homeroom_classes").on(
      t.ownerId,
      t.schoolYear,
      t.grade,
      t.classNo,
    ),
  ],
);

export const homeroomMembers = pgTable(
  "homeroom_members",
  {
    id: pk(),
    ownerId: ownerId(),
    homeroomId: uuid("homeroom_id")
      .notNull()
      .references(() => homeroomClasses.id, { onDelete: "cascade" }),
    studentYearId: uuid("student_year_id")
      .notNull()
      .references(() => studentYears.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [unique("uq_homeroom_members").on(t.homeroomId, t.studentYearId)],
);

// 과목 (평가설정 nullable — 추후 추가)
export const subjects = pgTable("subjects", {
  id: pk(),
  ownerId: ownerId(),
  name: text("name").notNull(),
  schoolYear: integer("school_year").notNull(),
  // 2022 개정 교과군. 값 미열거 → text(프리셋 시드에서 채움).
  curriculumCategory: text("curriculum_category"),
  evalMethod: evalMethod("eval_method"),
  jipilMidWeight: numeric("jipil_mid_weight"),
  jipilFinalWeight: numeric("jipil_final_weight"),
  achievementCuts: jsonb("achievement_cuts"),
  examBoundaryDate: date("exam_boundary_date"),
  ...timestamps(),
});

// 수행평가 요소(복수) + 반영비율
export const performanceItems = pgTable("performance_items", {
  id: pk(),
  ownerId: ownerId(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  weight: numeric("weight"),
  ...timestamps(),
});

// 분반 (과목 기본값 override 가능한 시험경계)
export const courseSections = pgTable("course_sections", {
  id: pk(),
  ownerId: ownerId(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  label: text("label").notNull(), // 예: 2-7
  room: text("room"),
  examBoundaryDate: date("exam_boundary_date"),
  ...timestamps(),
});

export const enrollments = pgTable(
  "enrollments",
  {
    id: pk(),
    ownerId: ownerId(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => courseSections.id, { onDelete: "cascade" }),
    studentYearId: uuid("student_year_id")
      .notNull()
      .references(() => studentYears.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [unique("uq_enrollments").on(t.sectionId, t.studentYearId)],
);

// 시간표 슬롯 (컴시간 sync 또는 수기)
export const timetableSlots = pgTable("timetable_slots", {
  id: pk(),
  ownerId: ownerId(),
  sectionId: uuid("section_id")
    .notNull()
    .references(() => courseSections.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(), // 1=월 .. 7=일
  period: integer("period").notNull(),
  room: text("room"),
  source: timetableSource("source").notNull().default("manual"),
  ...timestamps(),
});

// 수업 차시 (시수). 남은차시 = (exam_boundary까지 planned) − done. not_held 별도.
export const classSessions = pgTable(
  "class_sessions",
  {
    id: pk(),
    ownerId: ownerId(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => courseSections.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: sessionStatus("status").notNull().default("planned"),
    ...timestamps(),
  },
  (t) => [unique("uq_class_sessions").on(t.sectionId, t.date)],
);
