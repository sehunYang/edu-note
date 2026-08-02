import {
  pgTable,
  uuid,
  text,
  integer,
  date,
  numeric,
  jsonb,
  boolean,
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
  // 학기(QC v2 2-1 A). 1·2학기 과목은 별도 행 — 재동기화 시 활성 학기로 새 행.
  semester: integer("semester").notNull().default(1),
  // 교실 2-2 연간 과목 링크 선설치(2-1 미사용). normalize(name)+'_'+schoolYear.
  yearCourseKey: text("year_course_key"),
  // 2022 개정 교과군. 값 미열거 → text(프리셋 시드에서 채움).
  curriculumCategory: text("curriculum_category"),
  evalMethod: evalMethod("eval_method"),
  jipilMidWeight: numeric("jipil_mid_weight"),
  jipilFinalWeight: numeric("jipil_final_weight"),
  // 지필 시행 여부 (QC v1 C5, AC-5.x) — 미시행이면 비율 0 강제·시험경계 제외
  jipilMidEnabled: boolean("jipil_mid_enabled").notNull().default(true),
  jipilFinalEnabled: boolean("jipil_final_enabled").notNull().default(true),
  achievementCuts: jsonb("achievement_cuts"),
  examBoundaryDate: date("exam_boundary_date"),
  ...timestamps(),
});

// 과목별 시험일 (C3 태깅 calendarEvents 로부터 C5 에서 파생). 읽기시점 examBoundaryDate 산출.
export const subjectExams = pgTable(
  "subject_exams",
  {
    id: pk(),
    ownerId: ownerId(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    semester: integer("semester").notNull(), // 1 | 2
    ordinal: integer("ordinal").notNull(), // 1=중간 | 2=기말
    date: date("date"), // 미정 가능
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps(),
  },
  (t) => [unique("uq_subject_exams").on(t.subjectId, t.semester, t.ordinal)],
);

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

// 분반별 수행평가 시행일 (QC v1 C5)
export const sectionPerformanceDates = pgTable(
  "section_performance_dates",
  {
    id: pk(),
    ownerId: ownerId(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => courseSections.id, { onDelete: "cascade" }),
    performanceItemId: uuid("performance_item_id")
      .notNull()
      .references(() => performanceItems.id, { onDelete: "cascade" }),
    date: date("date"),
    ...timestamps(),
  },
  (t) => [
    unique("uq_section_performance_dates").on(t.sectionId, t.performanceItemId),
  ],
);

// 분반 내 학생 역할 (QC v1 C5) — 수강(enrollment) 단위
export const sectionRoles = pgTable("section_roles", {
  id: pk(),
  ownerId: ownerId(),
  enrollmentId: uuid("enrollment_id")
    .notNull()
    .references(() => enrollments.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  ...timestamps(),
});

// 시간표 슬롯 (컴시간 sync 또는 수기)
export const timetableSlots = pgTable("timetable_slots", {
  id: pk(),
  ownerId: ownerId(),
  sectionId: uuid("section_id")
    .notNull()
    .references(() => courseSections.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(), // 1=월 .. 7=일
  period: integer("period").notNull(),
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
    /**
     * 보강일 (연간시나리오 기능갭 #3). status='not_held' 인 차시에만 의미가 있다.
     *
     * 결손 차시를 not_held 로 찍으면 잔여차시(=경계까지의 planned)에서 빠져 나가
     * 숫자상으로는 아무 일도 없던 게 된다. 실제로는 진도가 한 차시 밀린 건데
     * 그 손실이 어디에도 안 남았다. 여기에 보강일을 달면 "회복됨"으로 구분되고,
     * 비어 있으면 **미회복 결손**으로 진척도에 노출된다.
     *
     * 보강을 별도 차시 행으로 만들지 않는 이유: class_sessions 는 (분반, 날짜)
     * 유니크라 보강일에 이미 정규 차시가 있으면 충돌한다(보강은 보통 다른 반
     * 시간이나 방과후에 잡힌다). 결손 행에 "언제 메웠는지"만 적는 편이 모델이
     * 단순하고 시수 계산도 안 건드린다.
     */
    makeupDate: date("makeup_date"),
    /** 보강 메모(장소·교시 등). 선택. */
    makeupNote: text("makeup_note"),
    ...timestamps(),
  },
  (t) => [unique("uq_class_sessions").on(t.sectionId, t.date)],
);
