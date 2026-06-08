import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "../schema";
import { subjects, courseSections, timetableSlots } from "../schema/classes";
import { fetchTimetableBySchool } from "@/lib/integrations/comcigan-client";
import { teacherSlots } from "@/lib/integrations/comcigan";
import { syncTeacherTimetable, getTeacherTimetable } from "./timetable";

/**
 * 시간표 sync 실DB+라이브 컴시간 통합 테스트.
 * RUN_DB_ITEST=1 + DATABASE_URL + 네트워크일 때만 실행. 인천해송고/양세훈 →
 * subjects=물리·sections=2-7/8/9·slots=9 를 실제로 sync·검증하고 정리한다.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;

describe.skipIf(!RUN)("시간표 sync — 컴시간 라이브 → DB", () => {
  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    // 자식→부모: timetable_slots → course_sections → subjects
    await db.delete(timetableSlots).where(eq(timetableSlots.ownerId, owner));
    await db.delete(courseSections).where(eq(courseSections.ownerId, owner));
    await db.delete(subjects).where(eq(subjects.ownerId, owner));
    await sql.end();
  });

  it("인천해송고/양세훈 시간표를 sync 하고 화면용으로 조회", async () => {
    const res = await fetchTimetableBySchool("인천해송고등학교");
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const slots = teacherSlots(res.data, "양세훈");
    // 교사별 배열(자료542) 디코딩 → 선택과목 포함 전체 수업
    expect(slots.length).toBeGreaterThan(9); // 물리 9 + 선택과목들
    const subjectSet = new Set(slots.map((s) => s.subject));
    expect(subjectSet).toContain("물리");
    expect(subjectSet).toContain("물Ⅱ"); // 반을 섞는 선택과목(이전엔 누락)
    expect(subjectSet).toContain("생과");

    const sync = await syncTeacherTimetable(db, owner, YEAR, slots);
    expect(sync.subjects).toBeGreaterThanOrEqual(3); // 물리·물Ⅱ·생과
    expect(sync.slots).toBe(slots.length);
    expect(sync.sections).toBeGreaterThanOrEqual(3);

    // DB 반영 확인
    const savedSubjects = await db
      .select({ name: subjects.name })
      .from(subjects)
      .where(and(eq(subjects.ownerId, owner), eq(subjects.schoolYear, YEAR)));
    const savedNames = savedSubjects.map((s) => s.name);
    expect(savedNames).toContain("물리");
    expect(savedNames).toContain("물Ⅱ");
    expect(savedNames).toContain("생과");

    const view = await getTeacherTimetable(db, owner, YEAR);
    expect(view.length).toBe(slots.length);
    expect(view[0]).toHaveProperty("weekday");
  });

  it("재sync 는 멱등(중복 슬롯 미생성)", async () => {
    const res = await fetchTimetableBySchool("인천해송고등학교");
    if (!res.ok) return;
    const slots = teacherSlots(res.data, "양세훈");

    await syncTeacherTimetable(db, owner, YEAR, slots);
    const view = await getTeacherTimetable(db, owner, YEAR);
    expect(view.length).toBe(slots.length); // 두 번 sync 해도 동일 개수
  });
});
