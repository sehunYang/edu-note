import {
  pgTable,
  uuid,
  text,
  integer,
  char,
  timestamp,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { pk, ownerId, timestamps } from "./_shared";
import { linkStatus } from "./enums";

/**
 * 정체성 (계획 §3.3). 영속 학생(persons) ↔ 연도별 학적(student_years) 분리로
 * 연도 간 추적 보장. year_links 는 3종 종결상태를 전부 표현.
 */

// 영속 학생
export const persons = pgTable("persons", {
  id: pk(),
  ownerId: ownerId(),
  displayName: text("display_name").notNull(),
  ...timestamps(),
});

// 연도별 학적
export const studentYears = pgTable(
  "student_years",
  {
    id: pk(),
    ownerId: ownerId(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    schoolYear: integer("school_year").notNull(),
    sid: char("sid", { length: 5 }).notNull(), // 학번 5자리 = 학년1+반2+번호2
    grade: integer("grade").notNull(),
    classNo: integer("class_no").notNull(),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    parentName: text("parent_name"),
    parentPhone: text("parent_phone"),
    career: text("career"),
    ...timestamps(),
  },
  (t) => [
    unique("uq_student_years_owner_year_sid").on(
      t.ownerId,
      t.schoolYear,
      t.sid,
    ),
    check("ck_student_years_sid_format", sql`${t.sid} ~ '^[0-9]{5}$'`),
  ],
);

// 연도 전환 매핑(이름 기반): auto_linked / pending / new_person
export const yearLinks = pgTable("year_links", {
  id: pk(),
  ownerId: ownerId(),
  newStudentYearId: uuid("new_student_year_id")
    .notNull()
    .references(() => studentYears.id, { onDelete: "cascade" }),
  // 동명이인 보류 시 후보 영속학생(작년 반/번호·진로를 candidate에서 표시)
  candidatePersonId: uuid("candidate_person_id").references(() => persons.id, {
    onDelete: "set null",
  }),
  linkStatus: linkStatus("link_status").notNull(),
  reason: text("reason"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  ...timestamps(),
});
