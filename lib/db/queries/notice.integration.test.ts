import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import { teacherProfile, calendarEvents, publicPages } from "../schema/misc";
import {
  getPublicNotice,
  setPublicNotice,
  addNoticeEvent,
  listNoticeEvents,
  deleteNoticeEvent,
} from "./notice";
import { issuePublicPage } from "./public-page";

/**
 * 공지실 실DB 통합 테스트 (Phase2-I). 공통 한마디 upsert, 수동 공지 CRUD,
 * 그리고 get_public_page 가 commonNotice/weekTodos 를 공개 페이로드로 노출하는지 검증.
 * (마이그레이션 0007 적용 전제 — 미적용 시 get_public_page 단언은 실패할 수 있음.)
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();
const YEAR = 2099;
let studentYearId: string;

const addDays = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe.skipIf(!RUN)("공지실 — 공개 페이지 공통 안내", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
    const [p] = await db
      .insert(persons)
      .values({ ownerId: owner, displayName: "공지학생" })
      .returning({ id: persons.id });
    [{ id: studentYearId }] = await db
      .insert(studentYears)
      .values({
        ownerId: owner,
        personId: p.id,
        schoolYear: YEAR,
        sid: "20704",
        grade: 2,
        classNo: 7,
        number: 4,
        name: "공지학생",
      })
      .returning({ id: studentYears.id });
  });

  afterAll(async () => {
    await db.delete(publicPages).where(eq(publicPages.ownerId, owner));
    await db.delete(calendarEvents).where(eq(calendarEvents.ownerId, owner));
    await db.delete(teacherProfile).where(eq(teacherProfile.ownerId, owner));
    await db.delete(studentYears).where(eq(studentYears.ownerId, owner));
    await db.delete(persons).where(eq(persons.ownerId, owner));
    await sql.end();
  });

  it("공통 한마디 upsert (insert → update) + 빈 문자열은 null", async () => {
    expect(await getPublicNotice(db, owner)).toBeNull();
    await setPublicNotice(db, owner, "안녕하세요, 이번 주도 화이팅!");
    expect(await getPublicNotice(db, owner)).toBe("안녕하세요, 이번 주도 화이팅!");
    await setPublicNotice(db, owner, "수정된 공지");
    expect(await getPublicNotice(db, owner)).toBe("수정된 공지");
    await setPublicNotice(db, owner, "   ");
    expect(await getPublicNotice(db, owner)).toBeNull();
  });

  it("수동 공지 추가·목록·삭제", async () => {
    const e = await addNoticeEvent(db, owner, addDays(1), "단원평가");
    const list = await listNoticeEvents(db, owner);
    expect(list.find((x) => x.id === e.id)?.title).toBe("단원평가");
    await deleteNoticeEvent(db, owner, e.id);
    const after = await listNoticeEvents(db, owner);
    expect(after.find((x) => x.id === e.id)).toBeUndefined();
  });

  it("get_public_page 가 commonNotice 와 weekTodos(7일내·안전소스)를 노출", async () => {
    await setPublicNotice(db, owner, "공개용 한마디");
    await addNoticeEvent(db, owner, addDays(2), "다가오는 공지"); // manual → 노출
    await addNoticeEvent(db, owner, addDays(30), "먼 미래 공지"); // 7일 밖 → 미노출
    // 0008 회귀 가드: personal(개인 일정)·task(업무) 소스는 7일 내라도 공개 미노출
    await db.insert(calendarEvents).values([
      { ownerId: owner, date: addDays(1), title: "개인약속(비공개)", source: "personal" },
      { ownerId: owner, date: addDays(1), title: "업무마감(비공개)", source: "task" },
    ]);
    const issued = await issuePublicPage(db, owner, studentYearId);

    const rows = await sql<{ get_public_page: { state: string; payload?: { commonNotice: string | null; weekTodos: { title: string }[] } } }[]>`
      select get_public_page(${issued.token}) as get_public_page
    `;
    const result = rows[0].get_public_page;
    expect(result.state).toBe("ok");
    expect(result.payload?.commonNotice).toBe("공개용 한마디");
    const titles = (result.payload?.weekTodos ?? []).map((t) => t.title);
    expect(titles).toContain("다가오는 공지");
    expect(titles).not.toContain("먼 미래 공지");
    expect(titles).not.toContain("개인약속(비공개)"); // personal 제외
    expect(titles).not.toContain("업무마감(비공개)"); // task 제외
  });
});
