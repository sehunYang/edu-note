import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import {
  subjectObservations,
  homeroomBehaviorNotes,
} from "../schema/records";
import {
  subjects,
  courseSections,
  enrollments,
  homeroomClasses,
  homeroomMembers,
} from "../schema/classes";
import {
  addSubjectObservation,
  listSubjectObservations,
  updateSubjectObservation,
  deleteSubjectObservation,
  addBehaviorNote,
  listBehaviorNotes,
  updateBehaviorNote,
  deleteBehaviorNote,
  listStudentsBySection,
  listSectionsForStudent,
  listHomeroomStudents,
  countSubjectObservationsByStudent,
  studentsWithoutBehaviorNoteToday,
} from "./observations";

/**
 * 관찰/행특 실DB 통합 테스트. 키워드 배열 보존 + 학생별 기록수 집계(넛지 입력) 검증.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;
let s1: string;
let s2: string;

async function mkStudent(sid: string, name: string): Promise<string> {
  const [p] = await db
    .insert(persons)
    .values({ ownerId: owner, displayName: name })
    .returning({ id: persons.id });
  const [sy] = await db
    .insert(studentYears)
    .values({
      ownerId: owner,
      personId: p.id,
      schoolYear: YEAR,
      sid,
      grade: 2,
      classNo: 7,
      number: Number(sid.slice(3)),
      name,
    })
    .returning({ id: studentYears.id });
  return sy.id;
}

async function mkSection(label: string): Promise<string> {
  const [subj] = await db
    .insert(subjects)
    .values({ ownerId: owner, name: `과목_${label}`, schoolYear: YEAR, semester: 1 })
    .returning({ id: subjects.id });
  const [sec] = await db
    .insert(courseSections)
    .values({ ownerId: owner, subjectId: subj.id, label })
    .returning({ id: courseSections.id });
  return sec.id;
}

async function enroll(sectionId: string, studentYearId: string): Promise<void> {
  await db.insert(enrollments).values({ ownerId: owner, sectionId, studentYearId });
}

describe.skipIf(!RUN)("관찰/행특 기록", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
    s1 = await mkStudent("20701", "김하나");
    s2 = await mkStudent("20702", "이두리");
  });

  afterAll(async () => {
    await db.delete(subjectObservations).where(eq(subjectObservations.ownerId, owner));
    await db.delete(homeroomBehaviorNotes).where(eq(homeroomBehaviorNotes.ownerId, owner));
    await db.delete(homeroomMembers).where(eq(homeroomMembers.ownerId, owner));
    await db.delete(homeroomClasses).where(eq(homeroomClasses.ownerId, owner));
    await db.delete(enrollments).where(eq(enrollments.ownerId, owner));
    await db.delete(courseSections).where(eq(courseSections.ownerId, owner));
    await db.delete(subjects).where(eq(subjects.ownerId, owner));
    await db.delete(studentYears).where(eq(studentYears.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner));
    await sql.end();
  });

  it("교과 관찰 추가 — 분반 필수 + 키워드 배열 보존", async () => {
    const sec = await mkSection("관찰분반A");
    await enroll(sec, s1);
    await addSubjectObservation(db, owner, {
      studentYearId: s1,
      sectionId: sec,
      body: "실험 설계에서 변인 통제를 정확히 적용함",
      keywords: ["탐구", "변인통제"],
    });
    const list = await listSubjectObservations(db, owner, { studentYearId: s1 });
    expect(list).toHaveLength(1);
    expect(list[0].sectionId).toBe(sec);
    expect(list[0].keywords).toEqual(["탐구", "변인통제"]);
  });

  it("교과 관찰 추가 — sectionId 없으면 거부(앱레이어 강제)", async () => {
    await expect(
      addSubjectObservation(db, owner, {
        studentYearId: s1,
        body: "분반 없는 제출",
      }),
    ).rejects.toThrow("분반을 선택하세요.");
  });

  it("교과 관찰 수정·삭제(ownerId 가드)", async () => {
    const sec = await mkSection("관찰분반B");
    await enroll(sec, s2);
    const row = await addSubjectObservation(db, owner, {
      studentYearId: s2,
      sectionId: sec,
      observedOn: "2099-05-01",
      body: "초기 내용",
      keywords: ["a"],
    });
    await updateSubjectObservation(db, owner, row.id, {
      body: "수정된 내용",
      keywords: ["b", "c"],
      observedOn: "2099-05-02",
    });
    const [after] = await listSubjectObservations(db, owner, { studentYearId: s2 });
    expect(after.body).toBe("수정된 내용");
    expect(after.keywords).toEqual(["b", "c"]);
    expect(after.observedOn).toBe("2099-05-02");

    await deleteSubjectObservation(db, owner, row.id);
    const gone = await listSubjectObservations(db, owner, { studentYearId: s2 });
    expect(gone).toHaveLength(0);
  });

  it("listStudentsBySection — 해당 분반 수강생만(학번순)", async () => {
    const secX = await mkSection("필터분반X");
    const secY = await mkSection("필터분반Y");
    await enroll(secX, s2);
    await enroll(secX, s1);
    await enroll(secY, s1);

    const inX = await listStudentsBySection(db, owner, secX);
    expect(inX.map((r) => r.id).sort()).toEqual([s1, s2].sort());
    // 학번순: 20701(s1) 먼저.
    expect(inX[0].id).toBe(s1);

    const inY = await listStudentsBySection(db, owner, secY);
    expect(inY.map((r) => r.id)).toEqual([s1]);
  });

  it("listSectionsForStudent — 학생의 활성학기 수강분반", async () => {
    const secP = await mkSection("수강분반P");
    const secQ = await mkSection("수강분반Q");
    await enroll(secP, s1);
    await enroll(secQ, s1);

    const secs = await listSectionsForStudent(db, owner, s1, YEAR, 1);
    const ids = secs.map((s) => s.sectionId);
    expect(ids).toContain(secP);
    expect(ids).toContain(secQ);

    // 타 학기(2)에는 1학기 분반이 잡히지 않음.
    const other = await listSectionsForStudent(db, owner, s1, YEAR, 2);
    expect(other.map((s) => s.sectionId)).not.toContain(secP);
  });

  it("학생별 관찰 기록수 집계 — 0건 학생 포함", async () => {
    const counts = await countSubjectObservationsByStudent(db, owner, YEAR);
    const byId = new Map(counts.map((c) => [c.id, c.recordCount]));
    expect(byId.get(s1)).toBe(1);
    expect(byId.get(s2)).toBe(0); // 0건도 포함되어야 넛지 가중치가 동작
  });

  it("행특 추가 + 오늘 미작성 학생 산출", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await addBehaviorNote(db, owner, {
      studentYearId: s1,
      notedOn: today,
      body: "학급 청소 활동에 자발적으로 참여함",
      keywords: ["성실"],
    });
    const notes = await listBehaviorNotes(db, owner, { studentYearId: s1 });
    expect(notes).toHaveLength(1);

    const without = await studentsWithoutBehaviorNoteToday(db, owner, YEAR, today);
    expect(without).toContain(s2);
    expect(without).not.toContain(s1);
  });

  it("행특 수정·삭제(ownerId 가드)", async () => {
    const row = await addBehaviorNote(db, owner, {
      studentYearId: s2,
      notedOn: "2099-06-01",
      body: "초기 행특",
      keywords: ["x"],
    });
    await updateBehaviorNote(db, owner, row.id, {
      body: "수정 행특",
      keywords: ["y", "z"],
      notedOn: "2099-06-02",
    });
    const notes = await listBehaviorNotes(db, owner, { studentYearId: s2 });
    const target = notes.find((n) => n.id === row.id)!;
    expect(target.body).toBe("수정 행특");
    expect(target.keywords).toEqual(["y", "z"]);
    expect(target.notedOn).toBe("2099-06-02");

    await deleteBehaviorNote(db, owner, row.id);
    const after = await listBehaviorNotes(db, owner, { studentYearId: s2 });
    expect(after.find((n) => n.id === row.id)).toBeUndefined();
  });

  it("listHomeroomStudents — 담임반 멤버만 반환", async () => {
    const [hr] = await db
      .insert(homeroomClasses)
      .values({ ownerId: owner, schoolYear: YEAR, grade: 2, classNo: 7 })
      .returning({ id: homeroomClasses.id });
    // s1 만 담임반 멤버로 등록(s2 는 비멤버).
    await db
      .insert(homeroomMembers)
      .values({ ownerId: owner, homeroomId: hr.id, studentYearId: s1 });

    const members = await listHomeroomStudents(db, owner, YEAR);
    expect(members.map((m) => m.id)).toContain(s1);
    expect(members.map((m) => m.id)).not.toContain(s2);
  });
});
