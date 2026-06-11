import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { studentYears } from "../schema/identity";
import { alias } from "drizzle-orm/pg-core";

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

// ── QC v2 2-1 C: 명단 모체 데이터(전 속성 + 과거학번 파생) ──

export interface StudentRosterEntry extends StudentOption {
  personId: string;
  phone: string | null;
  career: string | null;
}

/** 명단 화면용 전 속성 조회(AC-C1). 연락처·희망진로·personId(과거학번 파생) 포함. */
export async function listStudentRoster(
  db: DB,
  ownerId: string,
  schoolYear: number,
): Promise<StudentRosterEntry[]> {
  return db
    .select({
      id: studentYears.id,
      sid: studentYears.sid,
      name: studentYears.name,
      grade: studentYears.grade,
      classNo: studentYears.classNo,
      number: studentYears.number,
      personId: studentYears.personId,
      phone: studentYears.phone,
      career: studentYears.career,
    })
    .from(studentYears)
    .where(
      and(eq(studentYears.ownerId, ownerId), eq(studentYears.schoolYear, schoolYear)),
    )
    .orderBy(asc(studentYears.sid));
}

/**
 * 과거 학번 배치 파생(AC-C1). 현재 연도 학적들에 대해 같은 person 의 직전 연도(연도<현재)
 * 학번을 1회 조회 → 현재 studentYearId 그룹핑(명단 N+1 제거). 연도 내림차순.
 */
export async function listPriorSidsForStudents(
  db: DB,
  ownerId: string,
  studentYearIds: string[],
  schoolYear: number,
): Promise<Map<string, { schoolYear: number; sid: string }[]>> {
  const byStudent = new Map<string, { schoolYear: number; sid: string }[]>();
  if (studentYearIds.length === 0) return byStudent;

  const prior = alias(studentYears, "prior");
  const rows = await db
    .select({
      currentId: studentYears.id,
      priorYear: prior.schoolYear,
      priorSid: prior.sid,
    })
    .from(studentYears)
    .innerJoin(
      prior,
      and(
        eq(prior.personId, studentYears.personId),
        eq(prior.ownerId, ownerId),
        lt(prior.schoolYear, schoolYear),
      ),
    )
    .where(
      and(
        eq(studentYears.ownerId, ownerId),
        inArray(studentYears.id, studentYearIds),
      ),
    )
    .orderBy(desc(prior.schoolYear));

  for (const r of rows) {
    const arr = byStudent.get(r.currentId) ?? [];
    arr.push({ schoolYear: r.priorYear, sid: r.priorSid });
    byStudent.set(r.currentId, arr);
  }
  return byStudent;
}
