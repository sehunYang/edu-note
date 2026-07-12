import { and, asc, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { homeroomClasses, homeroomMembers } from "../schema/classes";
import { studentYears } from "../schema/identity";
import { subjectObservations } from "../schema/records";
import { attendanceRecords } from "../schema/attendance";
import { observationShortage } from "@/lib/domain/student-report";

/**
 * 담임반 목록·소속 학생 쿼리 계층 (인쇄실 US-7, AD-4 담임반 스코프).
 *
 * 인쇄실 홈의 "담임반" 범위 선택 + 선택 시 학생 목록(축소 배지)에 쓰인다. 담임반
 * 학생은 수강 분반이 0~N개라 `getStudentReport` 계열의 4플래그(분반 스코프)를 적용할
 * 수 없으므로, 관찰부족 플래그(`observationShortage` 재사용)와 출결 요약 건수만 계산한다.
 */
type DB = PostgresJsDatabase<typeof schema>;

/** 담임반 선택지(학년+반). */
export interface HomeroomClassOption {
  id: string;
  grade: number;
  classNo: number;
}

/** 해당 연도 담임반 목록(학년·반 순). */
export async function listHomeroomClasses(
  db: DB,
  ownerId: string,
  year: number,
): Promise<HomeroomClassOption[]> {
  return db
    .select({
      id: homeroomClasses.id,
      grade: homeroomClasses.grade,
      classNo: homeroomClasses.classNo,
    })
    .from(homeroomClasses)
    .where(
      and(eq(homeroomClasses.ownerId, ownerId), eq(homeroomClasses.schoolYear, year)),
    )
    .orderBy(asc(homeroomClasses.grade), asc(homeroomClasses.classNo));
}

/** 담임반 학생 1명의 축소 배지(관찰부족 + 출결 건수). */
export interface HomeroomMemberRow {
  studentYearId: string;
  sid: string;
  name: string;
  grade: number;
  classNo: number;
  number: number;
  observationShortage: boolean;
  attendanceCount: number;
}

/**
 * 담임반 소속 학생 목록 + 축소 배지. 관찰 건수는 `subject_observations`(분반 무관,
 * 학생 전체)를 배치 조회해 `observationShortage()`(도메인 순수함수)를 적용하고,
 * 출결 요약은 `attendance_records` 총 건수만 계산한다(사유별 세부는 상세 화면에서).
 * 담임반 미존재/미소속이면 빈 배열. 학번순.
 */
export async function listHomeroomMembers(
  db: DB,
  ownerId: string,
  homeroomId: string,
): Promise<HomeroomMemberRow[]> {
  const members = await db
    .select({
      studentYearId: studentYears.id,
      sid: studentYears.sid,
      name: studentYears.name,
      grade: studentYears.grade,
      classNo: studentYears.classNo,
      number: studentYears.number,
    })
    .from(homeroomMembers)
    .innerJoin(studentYears, eq(studentYears.id, homeroomMembers.studentYearId))
    .where(
      and(eq(homeroomMembers.ownerId, ownerId), eq(homeroomMembers.homeroomId, homeroomId)),
    )
    .orderBy(asc(studentYears.sid));
  if (members.length === 0) return [];
  const ids = members.map((m) => m.studentYearId);

  const observationRows = await db
    .select({ studentYearId: subjectObservations.studentYearId })
    .from(subjectObservations)
    .where(
      and(
        eq(subjectObservations.ownerId, ownerId),
        inArray(subjectObservations.studentYearId, ids),
      ),
    );
  const observationCountByStudent = new Map<string, number>();
  for (const o of observationRows) {
    observationCountByStudent.set(
      o.studentYearId,
      (observationCountByStudent.get(o.studentYearId) ?? 0) + 1,
    );
  }

  const attendanceRows = await db
    .select({ studentYearId: attendanceRecords.studentYearId })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.ownerId, ownerId),
        inArray(attendanceRecords.studentYearId, ids),
      ),
    );
  const attendanceCountByStudent = new Map<string, number>();
  for (const a of attendanceRows) {
    attendanceCountByStudent.set(
      a.studentYearId,
      (attendanceCountByStudent.get(a.studentYearId) ?? 0) + 1,
    );
  }

  return members.map((m) => ({
    ...m,
    observationShortage: observationShortage(
      observationCountByStudent.get(m.studentYearId) ?? 0,
    ),
    attendanceCount: attendanceCountByStudent.get(m.studentYearId) ?? 0,
  }));
}
