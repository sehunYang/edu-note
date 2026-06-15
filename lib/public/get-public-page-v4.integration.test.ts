import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { persons, studentYears } from "../db/schema/identity";
import {
  publicPages,
  teacherNotes,
  teacherNoteTargets,
  mealCache,
  counselSlots,
  counselReservations,
} from "../db/schema/misc";
import {
  createTeacherNote,
  openCounselSlot,
  reserveCounselSlot,
  requestCancelReservation,
  approveCancelReservation,
  listCounselSlots,
  issuePublicPage,
} from "../db/queries";
import { parsePublicPagePayload } from "./dto";

/**
 * get_public_page v4(0036) 계약 통합 테스트 (QC v4 US-6, AC-5.3/6.1/6.6/6.7).
 *
 * 검증:
 *  (a) 본인 확정 상담예약이 weekTodos(캘린더)에 반영된다(AC-6.1).
 *  (b) 급식의 menu/calInfo/ntrInfo 가 분리 노출된다(AC-6.6).
 *  (c) 이 학생 대상 개별 공지(individual)는 individualNotices 에, 전체 공지(all)는
 *      notices 에 병렬로 노출되고, 비대상 학생에게는 개별 공지가 새지 않는다(AC-5.3).
 *  (d) 데이터 없음에도 NULL-safe(throw=500 없음, state='ok').
 *  (e) 학생 취소요청 → 교사 승인 시 예약 삭제·정원 환원(AC-6.7).
 *
 * 0034/0035/0036 적용 전제. RUN_DB_ITEST 게이트.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2097;
let syTarget: string; // 개별 공지 대상 학생
let syOther: string; // 비대상 학생

const today = () => new Date().toISOString().slice(0, 10);

async function callPage(token: string) {
  const rows = await sql<{ get_public_page: { state: string; payload?: unknown } }[]>`
    select get_public_page(${token}) as get_public_page
  `;
  return rows[0].get_public_page;
}

describe.skipIf(!RUN)("get_public_page v4 — 계약(US-6)", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });

    const [p1] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: "대상학생" })
      .returning({ id: persons.id });
    const [p2] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: "비대상학생" })
      .returning({ id: persons.id });

    [{ id: syTarget }] = await db
      .insert(studentYears)
      .values({
        ownerId: owner,
        personId: p1.id,
        schoolYear: YEAR,
        sid: "10301",
        grade: 1,
        classNo: 3,
        number: 1,
        name: "대상학생",
      })
      .returning({ id: studentYears.id });
    [{ id: syOther }] = await db
      .insert(studentYears)
      .values({
        ownerId: owner,
        personId: p2.id,
        schoolYear: YEAR,
        sid: "10302",
        grade: 1,
        classNo: 3,
        number: 2,
        name: "비대상학생",
      })
      .returning({ id: studentYears.id });
  });

  afterAll(async () => {
    await db.delete(publicPages).where(eq(publicPages.ownerId, owner));
    await db
      .delete(counselReservations)
      .where(eq(counselReservations.ownerId, owner));
    await db.delete(counselSlots).where(eq(counselSlots.ownerId, owner));
    await db.delete(mealCache).where(eq(mealCache.ownerId, owner));
    await db
      .delete(teacherNoteTargets)
      .where(eq(teacherNoteTargets.ownerId, owner));
    await db.delete(teacherNotes).where(eq(teacherNotes.ownerId, owner));
    await db.delete(studentYears).where(eq(studentYears.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner));
    await sql.end();
  });

  it("(a)(b)(c) 상담예약 캘린더 반영 + 급식 분리 + 개별 공지 병렬", async () => {
    // 전체 공지 + 개별 공지(대상=syTarget)
    await createTeacherNote(db, owner, "전체 공지 A", 1, "all");
    await createTeacherNote(db, owner, "개별 공지 X", 2, "individual", [syTarget]);

    // 당일 급식(payload.meals[].ntrInfo 포함)
    await db.insert(mealCache).values({
      ownerId: owner,
      date: today(),
      payload: {
        meals: [
          {
            mealType: "중식",
            menu: ["비빔밥", "미역국"],
            calInfo: "820 Kcal",
            ntrInfo: "탄수화물(g) : 100.0\n단백질(g) : 30.0",
          },
        ],
      },
    });

    // 본인 확정 상담예약(오늘)
    const slot = await openCounselSlot(db, owner, today(), 2);
    await reserveCounselSlot(db, owner, slot.id, syTarget);

    // 대상 학생 페이지
    const tgt = await issuePublicPage(db, owner, syTarget);
    const tgtRes = await callPage(tgt.token);
    expect(tgtRes.state).toBe("ok");
    const tp = parsePublicPagePayload(tgtRes.payload);

    // (c) 개별 공지 병렬
    expect(tp.notices).toContain("전체 공지 A");
    expect(tp.notices).not.toContain("개별 공지 X");
    expect(tp.individualNotices).toEqual(["개별 공지 X"]);

    // (b) 급식 분리 필드
    const meal = tp.meals.find((m) => m.date === today());
    expect(meal).toBeDefined();
    expect(meal!.menu).toContain("비빔밥");
    expect(meal!.calInfo).toBe("820 Kcal");
    expect(meal!.ntrInfo).toContain("탄수화물");

    // (a) 상담예약이 캘린더(weekTodos)에 반영
    expect(tp.weekTodos.some((t) => t.title === "상담 예약")).toBe(true);
    // counselSlots 의 본인 예약 reserved=true
    expect(tp.counselSlots.some((s) => s.reserved)).toBe(true);

    // 비대상 학생에게는 개별 공지가 새지 않는다
    const oth = await issuePublicPage(db, owner, syOther);
    const othRes = await callPage(oth.token);
    const op = parsePublicPagePayload(othRes.payload);
    expect(op.notices).toContain("전체 공지 A");
    expect(op.individualNotices).toEqual([]);
  });

  it("(e) 학생 취소요청 → 교사 승인 시 예약 삭제·정원 환원", async () => {
    const slot = await openCounselSlot(db, owner, "2097-12-01", 1);
    const r = await reserveCounselSlot(db, owner, slot.id, syOther);

    // 잔여 0 확인
    let slots = await listCounselSlots(db, owner, "2097-12-01");
    expect(slots.find((s) => s.id === slot.id)?.remaining).toBe(0);

    // 학생 취소요청 → 페이지에 cancelRequested=true 노출
    await requestCancelReservation(db, owner, slot.id, syOther);
    const page = await issuePublicPage(db, owner, syOther);
    const res = await callPage(page.token);
    const p = parsePublicPagePayload(res.payload);
    const reqSlot = p.counselSlots.find((s) => s.date === "2097-12-01");
    expect(reqSlot?.reserved).toBe(true);
    expect(reqSlot?.cancelRequested).toBe(true);

    // 교사 승인 → 예약 삭제·정원 환원
    await approveCancelReservation(db, owner, r.id);
    slots = await listCounselSlots(db, owner, "2097-12-01");
    expect(slots.find((s) => s.id === slot.id)?.remaining).toBe(1);
  });

  it("(d) 데이터 없는 학생도 NULL-safe(state=ok)", async () => {
    const [p3] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: "무데이터" })
      .returning({ id: persons.id });
    const [{ id: sy3 }] = await db
      .insert(studentYears)
      .values({
        ownerId: owner,
        personId: p3.id,
        schoolYear: YEAR,
        sid: "10399",
        grade: 1,
        classNo: 3,
        number: 99,
        name: "무데이터",
      })
      .returning({ id: studentYears.id });
    const page = await issuePublicPage(db, owner, sy3);
    const res = await callPage(page.token);
    expect(res.state).toBe("ok");
    const p = parsePublicPagePayload(res.payload);
    expect(p.individualNotices).toEqual([]);
    expect(p.meals).toEqual([]);
  });
});
