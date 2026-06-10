import { and, desc, eq, gt, inArray, isNotNull, sql as dsql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { persons, studentYears, yearLinks } from "../schema/identity";

/**
 * 학년도 생명주기 쿼리 계층 (QC v1 C1, AC-1.2~1.4). 전체 과거 연도 조회와
 * 연도 단위 삭제(참조 영속학생 보존)를 제공한다.
 *
 * 보존 술어(C1 계획): school_year=Y 삭제 시 studentYears(Y) 행은 제거하되,
 * 영속학생 p 는 다음 중 하나면 보존 — 그 외에는 cascade 제거된다.
 *   (a) p 가 school_year > Y 인 studentYears 를 1건 이상 보유, 또는
 *   (b) resolvedAt 이 기록된 yearLinks 가 candidatePersonId=p 로 참조하며
 *       그 newStudentYear 의 school_year > Y.
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface SchoolYearSummary {
  schoolYear: number;
  studentCount: number;
}

/** 보유한 모든 학년도 + 학생 수(내림차순). 과거 연도 레거시 조회용(AC-1.3). */
export async function listSchoolYears(
  db: DB,
  ownerId: string,
): Promise<SchoolYearSummary[]> {
  const rows = await db
    .select({
      schoolYear: studentYears.schoolYear,
      studentCount: dsql<number>`count(*)::int`,
    })
    .from(studentYears)
    .where(eq(studentYears.ownerId, ownerId))
    .groupBy(studentYears.schoolYear)
    .orderBy(desc(studentYears.schoolYear));
  return rows;
}

export interface DeleteYearResult {
  /** 제거된 student_years 행수. */
  removedStudentYears: number;
  /** cascade 제거된 영속학생 수. */
  removedPersons: number;
  /** 미래 연도 참조로 보존된 영속학생 수. */
  preservedPersons: number;
}

/**
 * 연도 단위 삭제(AC-1.4). 트랜잭션으로 studentYears(Y)를 제거하고, 해당 연도에
 * 관여한 영속학생 중 미래 연도에 참조되지 않는 학생만 cascade 제거한다.
 */
export async function deleteSchoolYear(
  db: DB,
  ownerId: string,
  year: number,
): Promise<DeleteYearResult> {
  return db.transaction(async (tx) => {
    // 1) 해당 연도에 관여한 영속학생 id
    const involved = await tx
      .select({ personId: studentYears.personId })
      .from(studentYears)
      .where(
        and(
          eq(studentYears.ownerId, ownerId),
          eq(studentYears.schoolYear, year),
        ),
      );
    const involvedIds = [...new Set(involved.map((r) => r.personId))];

    // 2) 보존 대상(미래 연도 참조) 영속학생 id
    const preservedIds = new Set<string>();
    if (involvedIds.length > 0) {
      // (a) 미래 연도 학적 보유
      const futureYears = await tx
        .selectDistinct({ personId: studentYears.personId })
        .from(studentYears)
        .where(
          and(
            eq(studentYears.ownerId, ownerId),
            gt(studentYears.schoolYear, year),
            inArray(studentYears.personId, involvedIds),
          ),
        );
      for (const r of futureYears) preservedIds.add(r.personId);

      // (b) 미래 연도가 상속 확정(resolvedAt)으로 참조
      const futureLinks = await tx
        .selectDistinct({ personId: yearLinks.candidatePersonId })
        .from(yearLinks)
        .innerJoin(studentYears, eq(studentYears.id, yearLinks.newStudentYearId))
        .where(
          and(
            eq(yearLinks.ownerId, ownerId),
            isNotNull(yearLinks.resolvedAt),
            gt(studentYears.schoolYear, year),
            inArray(yearLinks.candidatePersonId, involvedIds),
          ),
        );
      for (const r of futureLinks) if (r.personId) preservedIds.add(r.personId);
    }

    // 3) studentYears(Y) 제거(자식 enrollment/observation 등 cascade)
    const removed = await tx
      .delete(studentYears)
      .where(
        and(
          eq(studentYears.ownerId, ownerId),
          eq(studentYears.schoolYear, year),
        ),
      )
      .returning({ id: studentYears.id });

    // 4) 미보존 영속학생 cascade 제거(잔여 연도·기록 포함)
    const toDelete = involvedIds.filter((id) => !preservedIds.has(id));
    let removedPersons = 0;
    if (toDelete.length > 0) {
      const delRows = await tx
        .delete(persons)
        .where(and(eq(persons.ownerId, ownerId), inArray(persons.id, toDelete)))
        .returning({ id: persons.id });
      removedPersons = delRows.length;
    }

    return {
      removedStudentYears: removed.length,
      removedPersons,
      preservedPersons: preservedIds.size,
    };
  });
}
