import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { teacherProfile } from "../schema/misc";

/**
 * 교사 기본 설정 쿼리 계층 (QC v1 C2, AC-2.1~2.3). 이름·학교명·담임여부·담임반과
 * NEIS/comcigan 학교 식별자를 owner 단일 행(teacher_profile)에 영속한다.
 *
 * 단일 진실원: 담임여부(isHomeroom)가 false 면 담임 학년/반은 항상 null 로 강제한다
 * (모순 상태 방지). 학교명 1회 입력으로 해석된 NEIS office/school + comcigan school
 * 식별자를 함께 저장해 C3(NEIS sync)·C5(comcigan sync)가 재입력 없이 동작한다.
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface TeacherSettings {
  name: string | null;
  schoolName: string | null;
  isHomeroom: boolean;
  homeroomGrade: number | null;
  homeroomClassNo: number | null;
  neisOfficeCode: string | null;
  neisSchoolCode: string | null;
  neisSchoolName: string | null;
  comciganSchool: string | null;
  comciganTeacher: string | null;
}

export interface UpsertTeacherSettingsInput {
  name?: string | null;
  schoolName?: string | null;
  isHomeroom?: boolean;
  homeroomGrade?: number | null;
  homeroomClassNo?: number | null;
  neisOfficeCode?: string | null;
  neisSchoolCode?: string | null;
  neisSchoolName?: string | null;
  comciganSchool?: string | null;
  comciganTeacher?: string | null;
}

export async function getTeacherSettings(
  db: DB,
  ownerId: string,
): Promise<TeacherSettings | null> {
  const rows = await db
    .select({
      name: teacherProfile.name,
      schoolName: teacherProfile.schoolName,
      isHomeroom: teacherProfile.isHomeroom,
      homeroomGrade: teacherProfile.homeroomGrade,
      homeroomClassNo: teacherProfile.homeroomClassNo,
      neisOfficeCode: teacherProfile.neisOfficeCode,
      neisSchoolCode: teacherProfile.neisSchoolCode,
      neisSchoolName: teacherProfile.neisSchoolName,
      comciganSchool: teacherProfile.comciganSchool,
      comciganTeacher: teacherProfile.comciganTeacher,
    })
    .from(teacherProfile)
    .where(eq(teacherProfile.ownerId, ownerId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 교사 기본 설정 upsert(owner 단일 행). isHomeroom=false 면 담임 학년/반을 null 로
 * 강제한다. neis/comcigan 식별자는 입력에 포함된 경우에만 갱신(부분 업데이트).
 */
export async function upsertTeacherSettings(
  db: DB,
  ownerId: string,
  input: UpsertTeacherSettingsInput,
): Promise<void> {
  const isHomeroom = input.isHomeroom ?? false;
  // 담임여부 false → 담임 학년/반 null 강제(모순 상태 방지)
  const homeroomGrade = isHomeroom ? (input.homeroomGrade ?? null) : null;
  const homeroomClassNo = isHomeroom ? (input.homeroomClassNo ?? null) : null;

  const values: Record<string, unknown> = {
    name: input.name ?? null,
    schoolName: input.schoolName ?? null,
    isHomeroom,
    homeroomGrade,
    homeroomClassNo,
  };
  // 학교 해석 결과는 제공된 경우에만 갱신(미해결 시 기존 값 보존)
  if (input.neisOfficeCode !== undefined) values.neisOfficeCode = input.neisOfficeCode;
  if (input.neisSchoolCode !== undefined) values.neisSchoolCode = input.neisSchoolCode;
  if (input.neisSchoolName !== undefined) values.neisSchoolName = input.neisSchoolName;
  if (input.comciganSchool !== undefined) values.comciganSchool = input.comciganSchool;
  if (input.comciganTeacher !== undefined) values.comciganTeacher = input.comciganTeacher;

  const existing = await db
    .select({ id: teacherProfile.id })
    .from(teacherProfile)
    .where(eq(teacherProfile.ownerId, ownerId))
    .limit(1);
  if (existing.length) {
    await db
      .update(teacherProfile)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(teacherProfile.ownerId, ownerId));
  } else {
    await db.insert(teacherProfile).values({ ownerId, ...values });
  }
}
