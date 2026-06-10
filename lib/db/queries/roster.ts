import { and, asc, desc, eq, inArray, lt, ne, isNull, sql as dsql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { persons, studentYears, yearLinks } from "../schema/identity";
import { classRoles } from "../schema/records";
import { teacherProfile } from "../schema/misc";
import { issuePublicPage, type IssueOptions, type IssuedPage } from "./public-page";
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

// ── C4: 동명이인 매칭 + 상속 (AC-4.1~4.3) ──

export interface LinkResult {
  autoLinked: number;
  pending: number;
  newPerson: number;
}

/**
 * 연도 전환 매칭(AC-4.1~4.2). schoolYear 신규 학적에 대해 과거 연도(연도<Y) 동명
 * 영속학생 후보를 찾아 year_links 를 만든다 — 유일=auto_linked(즉시 상속), 다건=pending
 * (수동 해소 큐), 0건=new_person. 이미 링크가 있는 학적은 건너뛴다(멱등).
 */
export async function linkYearStudents(
  db: DB,
  ownerId: string,
  schoolYear: number,
): Promise<LinkResult> {
  return db.transaction(async (tx) => {
    const news = await tx
      .select({
        id: studentYears.id,
        personId: studentYears.personId,
        name: studentYears.name,
      })
      .from(studentYears)
      .where(
        and(
          eq(studentYears.ownerId, ownerId),
          eq(studentYears.schoolYear, schoolYear),
        ),
      );

    const result: LinkResult = { autoLinked: 0, pending: 0, newPerson: 0 };
    for (const sy of news) {
      // 이미 링크된 학적은 건너뜀(멱등)
      const linked = await tx
        .select({ id: yearLinks.id })
        .from(yearLinks)
        .where(
          and(
            eq(yearLinks.ownerId, ownerId),
            eq(yearLinks.newStudentYearId, sy.id),
          ),
        )
        .limit(1);
      if (linked.length > 0) continue;

      // 과거 연도 동명 후보 영속학생(자기 자신 제외)
      const candidates = await tx
        .selectDistinct({ personId: persons.id })
        .from(persons)
        .innerJoin(studentYears, eq(studentYears.personId, persons.id))
        .where(
          and(
            eq(persons.ownerId, ownerId),
            eq(persons.displayName, sy.name),
            lt(studentYears.schoolYear, schoolYear),
            ne(persons.id, sy.personId),
          ),
        );

      if (candidates.length === 1) {
        // 유일매칭 → 즉시 상속: 신규 학적을 기존 영속학생으로 재지정 + 고아 person 제거
        await tx
          .update(studentYears)
          .set({ personId: candidates[0].personId, updatedAt: new Date() })
          .where(eq(studentYears.id, sy.id));
        await deleteOrphanPerson(tx, ownerId, sy.personId);
        await tx.insert(yearLinks).values({
          ownerId,
          newStudentYearId: sy.id,
          candidatePersonId: candidates[0].personId,
          linkStatus: "auto_linked",
          resolvedAt: new Date(),
        });
        result.autoLinked += 1;
      } else if (candidates.length > 1) {
        // 다건 → 보류 큐(교사 수동 해소)
        await tx.insert(yearLinks).values({
          ownerId,
          newStudentYearId: sy.id,
          candidatePersonId: null,
          linkStatus: "pending",
        });
        result.pending += 1;
      } else {
        // 무매칭 → 신규 영속학생 확정
        await tx.insert(yearLinks).values({
          ownerId,
          newStudentYearId: sy.id,
          candidatePersonId: null,
          linkStatus: "new_person",
          resolvedAt: new Date(),
        });
        result.newPerson += 1;
      }
    }
    return result;
  });
}

/** 고아(딸린 학적 0건) 영속학생 제거. 재지정 직후 호출. */
async function deleteOrphanPerson(
  tx: DB,
  ownerId: string,
  personId: string,
): Promise<void> {
  const remaining = await tx
    .select({ n: dsql<number>`count(*)::int` })
    .from(studentYears)
    .where(
      and(eq(studentYears.ownerId, ownerId), eq(studentYears.personId, personId)),
    );
  if ((remaining[0]?.n ?? 0) === 0) {
    await tx
      .delete(persons)
      .where(and(eq(persons.ownerId, ownerId), eq(persons.id, personId)));
  }
}

export interface PendingLink {
  yearLinkId: string;
  newStudentYearId: string;
  displayName: string;
  candidates: {
    personId: string;
    priorYear: number;
    priorSid: string;
    priorClassNo: number;
  }[];
}

/** 미해소(pending) 동명이인 큐 + 후보별 과거 학적 정보(AC-4.2). */
export async function listPendingLinks(
  db: DB,
  ownerId: string,
  schoolYear: number,
): Promise<PendingLink[]> {
  const rows = await db
    .select({
      yearLinkId: yearLinks.id,
      newStudentYearId: yearLinks.newStudentYearId,
      displayName: studentYears.name,
    })
    .from(yearLinks)
    .innerJoin(studentYears, eq(studentYears.id, yearLinks.newStudentYearId))
    .where(
      and(
        eq(yearLinks.ownerId, ownerId),
        eq(yearLinks.linkStatus, "pending"),
        isNull(yearLinks.resolvedAt),
        eq(studentYears.schoolYear, schoolYear),
      ),
    );

  const out: PendingLink[] = [];
  for (const r of rows) {
    const candidates = await db
      .selectDistinct({
        personId: persons.id,
        priorYear: studentYears.schoolYear,
        priorSid: studentYears.sid,
        priorClassNo: studentYears.classNo,
      })
      .from(persons)
      .innerJoin(studentYears, eq(studentYears.personId, persons.id))
      .where(
        and(
          eq(persons.ownerId, ownerId),
          eq(persons.displayName, r.displayName),
          lt(studentYears.schoolYear, schoolYear),
        ),
      )
      .orderBy(desc(studentYears.schoolYear));
    out.push({ ...r, candidates });
  }
  return out;
}

/**
 * 보류 해소(AC-4.3). 교사가 후보를 선택해 상속을 확정한다 — 신규 학적을 선택한
 * 영속학생으로 재지정하고 고아 person 을 제거, year_link 에 resolvedAt + 후보를 기록한다.
 * resolvedAt 기록은 C1 연도삭제 보존 술어(미래 참조)의 기준이 된다.
 */
export async function resolveInheritance(
  db: DB,
  ownerId: string,
  yearLinkId: string,
  chosenPersonId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [link] = await tx
      .select({
        id: yearLinks.id,
        newStudentYearId: yearLinks.newStudentYearId,
      })
      .from(yearLinks)
      .where(and(eq(yearLinks.id, yearLinkId), eq(yearLinks.ownerId, ownerId)))
      .limit(1);
    if (!link) throw new Error("해소할 매칭 항목을 찾을 수 없습니다.");

    const [sy] = await tx
      .select({ personId: studentYears.personId })
      .from(studentYears)
      .where(eq(studentYears.id, link.newStudentYearId))
      .limit(1);
    if (!sy) throw new Error("신규 학적을 찾을 수 없습니다.");
    const orphanPersonId = sy.personId;

    await tx
      .update(studentYears)
      .set({ personId: chosenPersonId, updatedAt: new Date() })
      .where(eq(studentYears.id, link.newStudentYearId));

    if (orphanPersonId !== chosenPersonId) {
      await deleteOrphanPerson(tx, ownerId, orphanPersonId);
    }

    await tx
      .update(yearLinks)
      .set({
        candidatePersonId: chosenPersonId,
        linkStatus: "auto_linked",
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(yearLinks.id, yearLinkId));
  });
}

/** 영속학생의 연도별 학적 이력(상속 확정 후 과거 기록 조회, AC-4.3). 연도 내림차순. */
export async function getStudentYearHistory(
  db: DB,
  ownerId: string,
  personId: string,
): Promise<{ studentYearId: string; schoolYear: number; sid: string }[]> {
  return db
    .select({
      studentYearId: studentYears.id,
      schoolYear: studentYears.schoolYear,
      sid: studentYears.sid,
    })
    .from(studentYears)
    .where(
      and(eq(studentYears.ownerId, ownerId), eq(studentYears.personId, personId)),
    )
    .orderBy(desc(studentYears.schoolYear));
}

// ── C4: 학급역할(class_roles 재사용) CRUD (AC-4.5) ──

export interface ClassRoleRow {
  id: string;
  roleName: string;
  roleDesc: string | null;
}

export async function addClassRole(
  db: DB,
  ownerId: string,
  studentYearId: string,
  roleName: string,
  roleDesc?: string | null,
): Promise<string> {
  const [row] = await db
    .insert(classRoles)
    .values({ ownerId, studentYearId, roleName, roleDesc: roleDesc ?? null })
    .returning({ id: classRoles.id });
  return row.id;
}

export async function listClassRoles(
  db: DB,
  ownerId: string,
  studentYearId: string,
): Promise<ClassRoleRow[]> {
  return db
    .select({
      id: classRoles.id,
      roleName: classRoles.roleName,
      roleDesc: classRoles.roleDesc,
    })
    .from(classRoles)
    .where(
      and(
        eq(classRoles.ownerId, ownerId),
        eq(classRoles.studentYearId, studentYearId),
      ),
    )
    .orderBy(asc(classRoles.createdAt));
}

export async function deleteClassRole(
  db: DB,
  ownerId: string,
  roleId: string,
): Promise<void> {
  await db
    .delete(classRoles)
    .where(and(eq(classRoles.id, roleId), eq(classRoles.ownerId, ownerId)));
}

/**
 * P3: studentYearId 집합의 학급역할 1회 조회 → studentYearId 그룹핑.
 * 학생별 listClassRoles 루프(N+1)를 대체하며 단건 함수와 동치(createdAt 순).
 */
export async function listClassRolesForStudents(
  db: DB,
  ownerId: string,
  studentYearIds: string[],
): Promise<Map<string, ClassRoleRow[]>> {
  const byStudent = new Map<string, ClassRoleRow[]>();
  if (studentYearIds.length === 0) return byStudent;

  const rows = await db
    .select({
      studentYearId: classRoles.studentYearId,
      id: classRoles.id,
      roleName: classRoles.roleName,
      roleDesc: classRoles.roleDesc,
    })
    .from(classRoles)
    .where(
      and(
        eq(classRoles.ownerId, ownerId),
        inArray(classRoles.studentYearId, studentYearIds),
      ),
    )
    .orderBy(asc(classRoles.studentYearId), asc(classRoles.createdAt));

  for (const { studentYearId, ...rest } of rows) {
    const arr = byStudent.get(studentYearId);
    if (arr) arr.push(rest);
    else byStudent.set(studentYearId, [rest]);
  }
  return byStudent;
}

// ── C4: 담임반 파생 + 공개링크 서버 게이팅 (AC-4.4, AC-4.6) ──

/**
 * 담임반 학생 여부 파생(AC-4.4). studentYears.grade/classNo == teacherProfile.
 * homeroomGrade/homeroomClassNo 그리고 isHomeroom=true 일 때만 참(sid 문자열 파싱 금지).
 */
export async function isHomeroomStudent(
  db: DB,
  ownerId: string,
  studentYearId: string,
): Promise<boolean> {
  const [row] = await db
    .select({
      grade: studentYears.grade,
      classNo: studentYears.classNo,
      isHomeroom: teacherProfile.isHomeroom,
      homeroomGrade: teacherProfile.homeroomGrade,
      homeroomClassNo: teacherProfile.homeroomClassNo,
    })
    .from(studentYears)
    .innerJoin(teacherProfile, eq(teacherProfile.ownerId, studentYears.ownerId))
    .where(
      and(
        eq(studentYears.ownerId, ownerId),
        eq(studentYears.id, studentYearId),
      ),
    )
    .limit(1);
  if (!row) return false;
  return (
    row.isHomeroom === true &&
    row.homeroomGrade != null &&
    row.homeroomClassNo != null &&
    row.grade === row.homeroomGrade &&
    row.classNo === row.homeroomClassNo
  );
}

/**
 * 공개링크 발급 서버 게이팅(AC-4.6). 담임반 학생만 발급 가능 — 비담임 학생 요청은
 * 거부(UI 숨김이 아닌 서버측 재검증). 담임반 파생값으로 권한을 판정한다.
 */
export async function issuePublicPageForHomeroom(
  db: DB,
  ownerId: string,
  studentYearId: string,
  opts: IssueOptions = {},
): Promise<IssuedPage> {
  if (!(await isHomeroomStudent(db, ownerId, studentYearId))) {
    throw new Error("담임반 학생만 공개 링크를 발급할 수 있습니다.");
  }
  return issuePublicPage(db, ownerId, studentYearId, opts);
}
