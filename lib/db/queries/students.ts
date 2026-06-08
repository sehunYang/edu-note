import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { studentYears } from "../schema/identity";

/**
 * 학생(연도학적) 조회 공용 helper. 관찰·활동·출결·세특 화면에서 학생 선택용.
 * 민감 컬럼(전화·보호자)은 제외하고 식별·표시에 필요한 최소 필드만 노출한다.
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface StudentOption {
  id: string;
  sid: string;
  name: string;
  grade: number;
  classNo: number;
  number: number;
}

/** 해당 연도 등록 학생 목록(학번순). */
export async function listStudents(
  db: DB,
  ownerId: string,
  schoolYear: number,
): Promise<StudentOption[]> {
  return db
    .select({
      id: studentYears.id,
      sid: studentYears.sid,
      name: studentYears.name,
      grade: studentYears.grade,
      classNo: studentYears.classNo,
      number: studentYears.number,
    })
    .from(studentYears)
    .where(
      and(eq(studentYears.ownerId, ownerId), eq(studentYears.schoolYear, schoolYear)),
    )
    .orderBy(asc(studentYears.sid));
}
