import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears, yearLinks } from "../schema/identity";
import { classRoles } from "../schema/records";
import { teacherProfile, publicPages } from "../schema/misc";
import {
  linkYearStudents,
  listPendingLinks,
  resolveInheritance,
  getStudentYearHistory,
  addClassRole,
  listClassRoles,
  listClassRolesForStudents,
  deleteClassRole,
  isHomeroomStudent,
  issuePublicPageForHomeroom,
  importStudentRoster,
  deleteStudentYear,
  updateStudentAttrs,
} from "./roster";
import { listStudentRoster, listPriorSidsForStudents } from "./students";
import { enrollments, courseSections, subjects } from "../schema/classes";

/**
 * C4 학생 명단 실DB 통합 테스트 (AC-4.1~4.6). RUN_DB_ITEST=1 + DATABASE_URL 시 실행.
 * 동명이인 매칭(auto_linked/pending/new_person) · 상속 해소 · 학급역할 · 담임반 파생 ·
 * 공개링크 서버 게이팅. owner=uuid 격리, afterAll FK 순서대로 정리.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();

// 영속학생 + 연도학적 직접 생성 헬퍼
async function mkPerson(name: string): Promise<string> {
  const [p] = await db
    .insert(persons)
    .values({ ownerId: owner, displayName: name })
    .returning({ id: persons.id });
  return p.id;
}
async function mkYear(
  personId: string,
  year: number,
  sid: string,
  grade: number,
  classNo: number,
  number: number,
  name: string,
): Promise<string> {
  const [sy] = await db
    .insert(studentYears)
    .values({ ownerId: owner, personId, schoolYear: year, sid, grade, classNo, number, name })
    .returning({ id: studentYears.id });
  return sy.id;
}

let personA = "";
let personB = "";
let syH2026 = "";
let syN2026 = "";

describe.skipIf(!RUN)("C4 학생 명단 — 매칭/상속/역할/담임/공개링크", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });

    // 담임: 1학년 3반
    await db.insert(teacherProfile).values({
      ownerId: owner,
      name: "담임T",
      isHomeroom: true,
      homeroomGrade: 1,
      homeroomClassNo: 3,
    });

    // 과거 2025
    personA = await mkPerson("홍길동");
    personB = await mkPerson("김철수");
    const personC = await mkPerson("김철수"); // 동명 → 다건
    await mkYear(personA, 2025, "10301", 1, 3, 1, "홍길동");
    await mkYear(personB, 2025, "20105", 2, 1, 5, "김철수");
    await mkYear(personC, 2025, "10502", 1, 5, 2, "김철수");

    // 신규 2026(import 모사: 각자 새 person)
    const personH = await mkPerson("홍길동");
    const personK = await mkPerson("김철수");
    const personN = await mkPerson("신입생");
    syH2026 = await mkYear(personH, 2026, "10301", 1, 3, 1, "홍길동");
    await mkYear(personK, 2026, "10302", 1, 3, 2, "김철수");
    syN2026 = await mkYear(personN, 2026, "20401", 2, 4, 1, "신입생");
  });

  afterAll(async () => {
    await db.delete(publicPages).where(eq(publicPages.ownerId, owner));
    await db.delete(classRoles).where(eq(classRoles.ownerId, owner));
    await db.delete(yearLinks).where(eq(yearLinks.ownerId, owner));
    await db.delete(studentYears).where(eq(studentYears.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner));
    await db.delete(teacherProfile).where(eq(teacherProfile.ownerId, owner));
    await sql.end();
  });

  it("linkYearStudents: 유일=auto_linked, 다건=pending, 0건=new_person (AC-4.1)", async () => {
    const res = await linkYearStudents(db, owner, 2026);
    expect(res).toEqual({ autoLinked: 1, pending: 1, newPerson: 1 });
  });

  it("유일매칭 홍길동은 과거 영속학생으로 즉시 상속(personId 재지정) (AC-4.2)", async () => {
    const [sy] = await db
      .select({ personId: studentYears.personId })
      .from(studentYears)
      .where(eq(studentYears.id, syH2026));
    expect(sy.personId).toBe(personA);
    // 이력 = 2026 + 2025 = 2건
    const hist = await getStudentYearHistory(db, owner, personA);
    expect(hist.map((h) => h.schoolYear)).toEqual([2026, 2025]);
  });

  it("멱등: 재실행 시 새 링크 0건", async () => {
    const res = await linkYearStudents(db, owner, 2026);
    expect(res).toEqual({ autoLinked: 0, pending: 0, newPerson: 0 });
  });

  it("pending 큐 + 상속 해소(후보 선택) → 과거 기록 조회 (AC-4.3)", async () => {
    const pend = await listPendingLinks(db, owner, 2026);
    expect(pend).toHaveLength(1);
    expect(pend[0].displayName).toBe("김철수");
    expect(pend[0].candidates.length).toBe(2); // B, C 후보

    await resolveInheritance(db, owner, pend[0].yearLinkId, personB);
    // 해소 후 신규 김철수 학적이 personB 로 연결 → 이력 2건
    const hist = await getStudentYearHistory(db, owner, personB);
    expect(hist.map((h) => h.schoolYear)).toEqual([2026, 2025]);
    // 큐에서 사라짐
    expect(await listPendingLinks(db, owner, 2026)).toHaveLength(0);
  });

  it("학급역할 복수 CRUD (class_roles 재사용, AC-4.5)", async () => {
    await addClassRole(db, owner, syH2026, "회장");
    const r2 = await addClassRole(db, owner, syH2026, "도서부장", "도서관 정리");
    let roles = await listClassRoles(db, owner, syH2026);
    expect(roles.map((r) => r.roleName)).toEqual(["회장", "도서부장"]);

    await deleteClassRole(db, owner, r2);
    roles = await listClassRoles(db, owner, syH2026);
    expect(roles.map((r) => r.roleName)).toEqual(["회장"]);
  });

  it("담임반 파생 true/false (grade/classNo 기준, AC-4.4)", async () => {
    expect(await isHomeroomStudent(db, owner, syH2026)).toBe(true); // 1-3
    expect(await isHomeroomStudent(db, owner, syN2026)).toBe(false); // 2-4
  });

  it("공개링크 서버 게이팅: 담임반만 발급, 비담임 거부 (AC-4.6)", async () => {
    const issued = await issuePublicPageForHomeroom(db, owner, syH2026);
    expect(issued.token).toMatch(/^[0-9a-f]+$/);
    await expect(
      issuePublicPageForHomeroom(db, owner, syN2026),
    ).rejects.toThrow("담임반");
  });

  it("P3 listClassRolesForStudents = 학생별 listClassRoles 합집합 동치 (AC-P3)", async () => {
    // syH2026 은 앞 테스트에서 '회장' 보유. syN2026 에 역할 2건 추가(멀티 그룹 검증).
    await addClassRole(db, owner, syN2026, "환경부장");
    await addClassRole(db, owner, syN2026, "체육부장", "체육대회 준비");

    const ids = [syH2026, syN2026];
    const batch = await listClassRolesForStudents(db, owner, ids);
    for (const id of ids) {
      expect(batch.get(id) ?? []).toEqual(await listClassRoles(db, owner, id));
    }
    // 빈 입력 가드(SQL inArray 빈배열 회피)
    expect((await listClassRolesForStudents(db, owner, [])).size).toBe(0);
  });
});

// ── QC v2 2-1 C: 하드삭제(과거/고아 보존)·인라인 수정·CSV 역할 import (AC-C1~C5) ──
const RUN_C = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;
describe.skipIf(!RUN_C)("학생 명단 C — 삭제·수정·CSV역할·과거학번", () => {
  let sqlC: ReturnType<typeof postgres>;
  let dbC: PostgresJsDatabase<typeof schema>;
  const o = randomUUID();

  beforeAll(() => {
    sqlC = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    dbC = drizzle(sqlC, { schema, casing: "snake_case" });
  });
  afterAll(async () => {
    await dbC.delete(enrollments).where(eq(enrollments.ownerId, o));
    await dbC.delete(courseSections).where(eq(courseSections.ownerId, o));
    await dbC.delete(subjects).where(eq(subjects.ownerId, o));
    await dbC.delete(classRoles).where(eq(classRoles.ownerId, o));
    await dbC.delete(yearLinks).where(eq(yearLinks.ownerId, o));
    await dbC.delete(studentYears).where(eq(studentYears.ownerId, o));
    await dbC.delete(persons).where(eq(persons.ownerId, o));
    await sqlC.end();
  });

  it("CSV 역할 import → class_roles 생성 + 재임포트 중복 방지(create-only) (AC-C5)", async () => {
    const rows = [
      {
        sid: "10101",
        name: "역할이",
        grade: 1,
        classNo: 1,
        number: 1,
        phone: "010-1111-2222",
        parentName: null,
        parentPhone: null,
        career: "교사",
        roles: ["반장", "환경부장"],
      },
    ];
    await importStudentRoster(dbC, o, 2030, rows);
    const [sy] = await dbC
      .select({ id: studentYears.id })
      .from(studentYears)
      .where(eq(studentYears.ownerId, o));
    let roles = await listClassRoles(dbC, o, sy.id);
    expect(roles.map((r) => r.roleName).sort()).toEqual(["반장", "환경부장"]);

    // 재임포트(같은 역할 + 새 역할) → 기존은 중복 생성 안 하고 새 역할만 추가
    await importStudentRoster(dbC, o, 2030, [{ ...rows[0], roles: ["반장", "총무"] }]);
    roles = await listClassRoles(dbC, o, sy.id);
    expect(roles.map((r) => r.roleName).sort()).toEqual(["반장", "총무", "환경부장"]);
  });

  it("updateStudentAttrs: 이름/연락처/희망진로 수정 + person.displayName 동기화 (AC-C2)", async () => {
    const [sy] = await dbC
      .select({ id: studentYears.id, personId: studentYears.personId })
      .from(studentYears)
      .where(eq(studentYears.ownerId, o));
    await updateStudentAttrs(dbC, o, sy.id, {
      name: "새이름",
      phone: "010-9999-0000",
      career: "의사",
    });
    const roster = await listStudentRoster(dbC, o, 2030);
    expect(roster[0]).toMatchObject({
      name: "새이름",
      phone: "010-9999-0000",
      career: "의사",
    });
    const [p] = await dbC
      .select({ displayName: persons.displayName })
      .from(persons)
      .where(eq(persons.id, sy.personId));
    expect(p.displayName).toBe("새이름");
  });

  it("deleteStudentYear: 과거 학적·person 보존(다년) → 고아 person 삭제(단년) (AC-C3)", async () => {
    // person1: 2029·2030 두 학적 → 2030 삭제 시 person·2029 보존
    const [p1] = await dbC
      .insert(persons)
      .values({ ownerId: o, displayName: "이년생" })
      .returning({ id: persons.id });
    const [sy29] = await dbC
      .insert(studentYears)
      .values({ ownerId: o, personId: p1.id, schoolYear: 2029, sid: "10102", grade: 1, classNo: 1, number: 2, name: "이년생" })
      .returning({ id: studentYears.id });
    const [sy30] = await dbC
      .insert(studentYears)
      .values({ ownerId: o, personId: p1.id, schoolYear: 2030, sid: "20102", grade: 2, classNo: 1, number: 2, name: "이년생" })
      .returning({ id: studentYears.id });

    const r1 = await deleteStudentYear(dbC, o, sy30.id);
    expect(r1).toEqual({ removedStudentYear: true, removedPerson: false });
    // 과거 학적·person 보존
    const hist = await getStudentYearHistory(dbC, o, p1.id);
    expect(hist.map((h) => h.schoolYear)).toEqual([2029]);
    const stillPerson = await dbC
      .select({ id: persons.id })
      .from(persons)
      .where(eq(persons.id, p1.id));
    expect(stillPerson).toHaveLength(1);

    // person2: 단년 학적 → 삭제 시 고아 person 제거
    const [p2] = await dbC
      .insert(persons)
      .values({ ownerId: o, displayName: "단년생" })
      .returning({ id: persons.id });
    const [syOnly] = await dbC
      .insert(studentYears)
      .values({ ownerId: o, personId: p2.id, schoolYear: 2030, sid: "20103", grade: 2, classNo: 1, number: 3, name: "단년생" })
      .returning({ id: studentYears.id });
    const r2 = await deleteStudentYear(dbC, o, syOnly.id);
    expect(r2).toEqual({ removedStudentYear: true, removedPerson: true });
    const goneP2 = await dbC
      .select({ id: persons.id })
      .from(persons)
      .where(eq(persons.id, p2.id));
    expect(goneP2).toHaveLength(0);

    // 정리용으로 sy29 도 삭제(고아 p1 제거)
    await deleteStudentYear(dbC, o, sy29.id);
  });

  it("listPriorSidsForStudents: 같은 person 직전 연도 학번 파생 (AC-C1)", async () => {
    // person: 2029(10104) → 2030(20104) 연속 학적
    const [p] = await dbC
      .insert(persons)
      .values({ ownerId: o, displayName: "연속생" })
      .returning({ id: persons.id });
    await dbC
      .insert(studentYears)
      .values({ ownerId: o, personId: p.id, schoolYear: 2029, sid: "10104", grade: 1, classNo: 1, number: 4, name: "연속생" });
    const [cur] = await dbC
      .insert(studentYears)
      .values({ ownerId: o, personId: p.id, schoolYear: 2030, sid: "20104", grade: 2, classNo: 1, number: 4, name: "연속생" })
      .returning({ id: studentYears.id });

    const prior = await listPriorSidsForStudents(dbC, o, [cur.id], 2030);
    expect(prior.get(cur.id)).toEqual([{ schoolYear: 2029, sid: "10104" }]);
    expect((await listPriorSidsForStudents(dbC, o, [], 2030)).size).toBe(0);
  });
});
