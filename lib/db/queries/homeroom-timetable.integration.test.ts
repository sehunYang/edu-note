import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import {
  homeroomTimetableSlots,
  studentElectiveMappings,
  counselSlots,
} from "../schema/misc";
import {
  replaceHomeroomTimetable,
  listHomeroomTimetable,
  upsertStudentElectiveMapping,
  openCounselSlot,
  listCounselSlots,
} from "./index";

/**
 * 담임반 시간표 + 학생 선택과목 자가매핑 통합 테스트 (QC v3 Part B, US-B13, AC-12.3/12.4).
 *
 * 적용 후(0028) 실행. get_public_page(0029) 자체의 계약 검증은 마이그레이션 적용이
 * 필요하므로 아래 TODO 참조(오케스트레이터가 0029 적용 후 별도 itest 작성/실행).
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;
let sy1: string;

describe.skipIf(!RUN)("담임반 시간표 캐시 · 선택과목 자가매핑", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });

    const [p1] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: "김선택" })
      .returning({ id: persons.id });
    [{ id: sy1 }] = await db
      .insert(studentYears)
      .values({
        ownerId: owner,
        personId: p1.id,
        schoolYear: YEAR,
        sid: "20901",
        grade: 2,
        classNo: 9,
        number: 1,
        name: "김선택",
      })
      .returning({ id: studentYears.id });
  });

  afterAll(async () => {
    await db
      .delete(homeroomTimetableSlots)
      .where(eq(homeroomTimetableSlots.ownerId, owner));
    await db
      .delete(studentElectiveMappings)
      .where(eq(studentElectiveMappings.ownerId, owner));
    await db.delete(counselSlots).where(eq(counselSlots.ownerId, owner));
    await db.delete(studentYears).where(eq(studentYears.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner));
    await sql.end();
  });

  it("replaceHomeroomTimetable 는 멱등(replace) — 두 번 호출해도 동일 결과", async () => {
    const slots = [
      { weekday: 1, period: 1, subjectName: "국어" },
      { weekday: 1, period: 2, subjectName: "선택과목군" },
      { weekday: 2, period: 3, subjectName: "수학" },
    ];
    const a = await replaceHomeroomTimetable(db, owner, 2, 9, slots);
    expect(a.count).toBe(3);
    const b = await replaceHomeroomTimetable(db, owner, 2, 9, slots);
    expect(b.count).toBe(3);

    const read = await listHomeroomTimetable(db, owner, 2, 9);
    expect(read).toHaveLength(3);
    expect(read[0]).toEqual({ weekday: 1, period: 1, subjectName: "국어" });
  });

  it("upsertStudentElectiveMapping 은 (student, weekday, period) 1:1 upsert", async () => {
    await upsertStudentElectiveMapping(db, owner, sy1, 1, 2, "물리학Ⅱ");
    let rows = await db
      .select()
      .from(studentElectiveMappings)
      .where(
        and(
          eq(studentElectiveMappings.studentYearId, sy1),
          eq(studentElectiveMappings.weekday, 1),
          eq(studentElectiveMappings.period, 2),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].mappedSubject).toBe("물리학Ⅱ");

    // 같은 칸 재매핑 → update(중복 행 미생성)
    await upsertStudentElectiveMapping(db, owner, sy1, 1, 2, "생활과학");
    rows = await db
      .select()
      .from(studentElectiveMappings)
      .where(
        and(
          eq(studentElectiveMappings.studentYearId, sy1),
          eq(studentElectiveMappings.weekday, 1),
          eq(studentElectiveMappings.period, 2),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].mappedSubject).toBe("생활과학");
  });

  it("상담 슬롯 잔여 계산(capacity - 예약수) — remaining", async () => {
    await openCounselSlot(db, owner, "2099-06-20", 3);
    const slots = await listCounselSlots(db, owner, "2099-06-20");
    const target = slots.find((s) => s.date === "2099-06-20");
    expect(target).toBeTruthy();
    expect(target!.remaining).toBe(3); // 예약 0건
  });
});

/**
 * TODO(오케스트레이터 0029 적용 후): get_public_page(token) 계약 itest.
 *
 * 0029 적용 후 다음을 단언하는 itest 를 추가/실행할 것(이 워커는 마이그레이션을 적용하지
 * 못하므로 여기 미포함). public-page service-role 어댑터(getPublicPage) 또는 raw SQL 로
 * `select get_public_page($token)` 를 호출해 검증:
 *
 *  1. 유효 토큰 → state='ok'. payload.studentName = 학생 본인 이름.
 *  2. payload.notices = teacher_notes.body 들이 sort_order, created_at 순서.
 *     payload.commonNotice = 그 중 첫 번째(하위호환).
 *  3. payload.timetable = homeroom_timetable_slots(owner,grade,classNo) 행들.
 *     고정반(fixed_class_settings.is_fixed=true) → isFixed:true.
 *     학생 자가매핑 존재 → electiveMapped = mapped_subject, 없으면 null.
 *  4. payload.meals = meal_cache where date=current_date(당일만), 다른 날짜 미포함.
 *  5. payload.weekTodos = calendar_events(source in manual,neis) within
 *     current_date-31 .. current_date+93. personal/task 소스 미포함.
 *  6. payload.attendanceSummary(1D) 와 payload.attendance2D(kind×reason 카운트) 일치.
 *     attendance2D 는 카운트 숫자만 — note_field/reason 자유텍스트 직렬화 절대 없음
 *     (JSON.stringify 에 note_field 텍스트 미포함 단언).
 *  7. payload.counselSlots = (date>=current_date) 이고 (remaining>0 OR 본인예약) 슬롯만,
 *     date 오름차순. 각 {date, remaining=capacity-예약수, reserved=본인예약 여부}.
 *  8. payload.grades = {status:'preparing'}.
 *  9. payload.personalMessage = public_pages.teacher_message.
 * 10. 폐기/만료/없음 토큰 → state revoked/expired/not_found (payload 없음).
 * 11. NULL-safe: 학생 데이터가 전혀 없어도 throw 없이 빈 배열/0 페이로드.
 */
