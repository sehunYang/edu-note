import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import type { StudentRosterRow } from "@/lib/csv";

/**
 * 학생 명단 임포트 쿼리 계층 (계획 §3.3 identity, §4 A·CSV).
 *
 * 데이터 계층은 ownerId 를 인자로 받는다(인증 세션 연결은 추후 서버액션에서).
 * 첫 임포트는 신규 영속학생(persons) + 연도학적(student_years)을 생성하고,
 * 같은 (owner, year, sid) 가 있으면 학적 정보를 갱신한다(연도 간 이름매핑은 §3.3
 * year_links 로 추후 — 첫 임포트는 모두 신규).
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface RosterImportResult {
  created: number;
  updated: number;
}

export async function importStudentRoster(
  db: DB,
  ownerId: string,
  schoolYear: number,
  rows: StudentRosterRow[],
): Promise<RosterImportResult> {
  let created = 0;
  let updated = 0;
  for (const r of rows) {
    const existing = await db
      .select({ id: studentYears.id })
      .from(studentYears)
      .where(
        and(
          eq(studentYears.ownerId, ownerId),
          eq(studentYears.schoolYear, schoolYear),
          eq(studentYears.sid, r.sid),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(studentYears)
        .set({
          name: r.name,
          grade: r.grade,
          classNo: r.classNo,
          number: r.number,
          phone: r.phone,
          parentName: r.parentName,
          parentPhone: r.parentPhone,
          career: r.career,
          updatedAt: new Date(),
        })
        .where(eq(studentYears.id, existing[0].id));
      updated += 1;
    } else {
      const [person] = await db
        .insert(persons)
        .values({ ownerId, displayName: r.name })
        .returning({ id: persons.id });
      await db.insert(studentYears).values({
        ownerId,
        personId: person.id,
        schoolYear,
        sid: r.sid,
        grade: r.grade,
        classNo: r.classNo,
        number: r.number,
        name: r.name,
        phone: r.phone,
        parentName: r.parentName,
        parentPhone: r.parentPhone,
        career: r.career,
      });
      created += 1;
    }
  }
  return { created, updated };
}
