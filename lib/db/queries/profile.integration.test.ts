import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { teacherProfile } from "../schema/misc";
import { getTeacherSettings, upsertTeacherSettings } from "./profile";

// 실학교/실교사 이름은 공개 저장소에 남기지 않는다. 이 테스트는 RUN_DB_ITEST
// 게이트라 평소 스킵되며, 돌릴 때만 env 로 지정한다(배포판 S7).
const PROBE_SCHOOL = process.env.PROBE_SCHOOL ?? "";
const PROBE_TEACHER = process.env.PROBE_TEACHER ?? "";


/**
 * 교사 기본 설정 실DB 통합 테스트 (QC v1 C2, AC-2.1~2.3).
 * RUN_DB_ITEST=1 + DATABASE_URL 일 때만 실행. owner=uuid 격리, afterAll 정리.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();

describe.skipIf(!RUN)("교사 기본 설정 — teacher_profile", () => {
  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await db.delete(teacherProfile).where(eq(teacherProfile.ownerId, owner));
    await sql.end();
  });

  it("insert: 미존재 owner 에 프로필 생성 후 조회", async () => {
    expect(await getTeacherSettings(db, owner)).toBeNull();
    await upsertTeacherSettings(db, owner, {
      name: PROBE_TEACHER,
      schoolName: PROBE_SCHOOL,
      isHomeroom: true,
      homeroomGrade: 2,
      homeroomClassNo: 7,
    });
    const s = await getTeacherSettings(db, owner);
    expect(s).toMatchObject({
      name: PROBE_TEACHER,
      schoolName: PROBE_SCHOOL,
      isHomeroom: true,
      homeroomGrade: 2,
      homeroomClassNo: 7,
    });
  });

  it("isHomeroom=false 면 담임 학년/반을 null 로 강제(입력 무시)", async () => {
    await upsertTeacherSettings(db, owner, {
      name: PROBE_TEACHER,
      schoolName: PROBE_SCHOOL,
      isHomeroom: false,
      // false 인데도 학년/반을 보냈을 때 null 로 강제되어야 함
      homeroomGrade: 3,
      homeroomClassNo: 1,
    });
    const s = await getTeacherSettings(db, owner);
    expect(s).toMatchObject({
      isHomeroom: false,
      homeroomGrade: null,
      homeroomClassNo: null,
    });
  });

  it("NEIS+comcigan 식별자 저장 후 재사용(부분 upsert 시 보존)", async () => {
    await upsertTeacherSettings(db, owner, {
      name: PROBE_TEACHER,
      schoolName: PROBE_SCHOOL,
      isHomeroom: false,
      neisOfficeCode: "E10",
      neisSchoolCode: "7530560",
      neisSchoolName: PROBE_SCHOOL,
      comciganSchool: PROBE_SCHOOL,
      comciganTeacher: PROBE_TEACHER,
    });
    const s1 = await getTeacherSettings(db, owner);
    expect(s1).toMatchObject({
      neisOfficeCode: "E10",
      neisSchoolCode: "7530560",
      comciganSchool: PROBE_SCHOOL,
      comciganTeacher: PROBE_TEACHER,
    });

    // 코드 미포함 재upsert(담임여부만 갱신) → 학교 식별자는 보존되어야 함
    await upsertTeacherSettings(db, owner, {
      name: PROBE_TEACHER,
      schoolName: PROBE_SCHOOL,
      isHomeroom: true,
      homeroomGrade: 1,
      homeroomClassNo: 4,
    });
    const s2 = await getTeacherSettings(db, owner);
    expect(s2).toMatchObject({
      isHomeroom: true,
      homeroomGrade: 1,
      homeroomClassNo: 4,
      neisOfficeCode: "E10",
      neisSchoolCode: "7530560",
      comciganSchool: PROBE_SCHOOL,
      comciganTeacher: PROBE_TEACHER,
    });
  });
});
