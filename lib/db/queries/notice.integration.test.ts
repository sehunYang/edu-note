import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { persons, studentYears } from "../schema/identity";
import {
  teacherProfile,
  calendarEvents,
  publicPages,
  teacherNotes,
  fixedClassSettings,
} from "../schema/misc";
import {
  getPublicNotice,
  setPublicNotice,
  addNoticeEvent,
  listNoticeEvents,
  deleteNoticeEvent,
  listTeacherNotes,
  createTeacherNote,
  updateTeacherNote,
  deleteTeacherNote,
  updateNoticeEvent,
} from "./notice";
import { saveFixedClassSetting, listFixedClassSettings } from "./fixed-class";
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
    await db.delete(teacherNotes).where(eq(teacherNotes.ownerId, owner));
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

  it("get_public_page(v3 0029) 가 commonNotice(=첫 teacher_notes)·weekTodos(월간창·안전소스)를 노출", async () => {
    // 0029 부터 commonNotice 는 teacher_profile.public_notice 가 아니라 teacher_notes 첫 행.
    await createTeacherNote(db, owner, "공개용 한마디");
    await addNoticeEvent(db, owner, addDays(2), "다가오는 공지"); // manual → 노출
    await addNoticeEvent(db, owner, addDays(120), "먼 미래 공지"); // 월간창(+93) 밖 → 미노출
    // 0008 회귀 가드: personal(개인 일정)·task(업무) 소스는 창 내라도 공개 미노출
    await db.insert(calendarEvents).values([
      { ownerId: owner, date: addDays(1), title: "개인약속(비공개)", source: "personal" },
      { ownerId: owner, date: addDays(1), title: "업무마감(비공개)", source: "task" },
    ]);
    const issued = await issuePublicPage(db, owner, studentYearId);

    const rows = await sql<{ get_public_page: { state: string; payload?: { commonNotice: string | null; notices: string[]; weekTodos: { title: string }[] } } }[]>`
      select get_public_page(${issued.token}) as get_public_page
    `;
    const result = rows[0].get_public_page;
    expect(result.state).toBe("ok");
    expect(result.payload?.commonNotice).toBe("공개용 한마디");
    expect(result.payload?.notices).toContain("공개용 한마디"); // 다중 한마디 배열
    const titles = (result.payload?.weekTodos ?? []).map((t) => t.title);
    expect(titles).toContain("다가오는 공지");
    expect(titles).not.toContain("먼 미래 공지"); // +93일 창 밖
    expect(titles).not.toContain("개인약속(비공개)"); // personal 제외
    expect(titles).not.toContain("업무마감(비공개)"); // task 제외
  });
});

/**
 * QC v3 Part B US-B10. (a) 다중 teacher_notes 영속·sortOrder 정렬, (b) updateNoticeEvent
 * content 갱신, (c) saveFixedClassSetting upsert + listFixedClassSettings 반환.
 * 컴시간은 호출하지 않고 직접 save 로 영속 계층만 검증한다.
 */
describe.skipIf(!RUN)("공지실 — 다중 한마디 / 할일 content / 고정반(US-B10)", () => {
  let sql2: ReturnType<typeof postgres>;
  let db2: PostgresJsDatabase<typeof schema>;
  const owner2 = randomUUID();

  beforeAll(async () => {
    sql2 = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db2 = drizzle(sql2, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await db2.delete(teacherNotes).where(eq(teacherNotes.ownerId, owner2));
    await db2.delete(calendarEvents).where(eq(calendarEvents.ownerId, owner2));
    await db2
      .delete(fixedClassSettings)
      .where(eq(fixedClassSettings.ownerId, owner2));
    await db2.delete(teacherProfile).where(eq(teacherProfile.ownerId, owner2));
    await sql2.end();
  });

  it("(a) 다중 교사 한마디 영속 + sortOrder 정렬 + 수정/삭제", async () => {
    await createTeacherNote(db2, owner2, "두번째", 2);
    await createTeacherNote(db2, owner2, "첫번째", 1);
    await createTeacherNote(db2, owner2, "세번째", 3);
    const notes = await listTeacherNotes(db2, owner2);
    expect(notes.map((n) => n.body)).toEqual(["첫번째", "두번째", "세번째"]);

    await updateTeacherNote(db2, owner2, notes[0].id, "첫번째-수정");
    const afterUpdate = await listTeacherNotes(db2, owner2);
    expect(afterUpdate[0].body).toBe("첫번째-수정");

    await deleteTeacherNote(db2, owner2, notes[1].id);
    const afterDelete = await listTeacherNotes(db2, owner2);
    expect(afterDelete.map((n) => n.body)).toEqual(["첫번째-수정", "세번째"]);
  });

  it("(b) updateNoticeEvent 가 제목·날짜·content 를 갱신한다", async () => {
    const e = await addNoticeEvent(
      db2,
      owner2,
      "2099-03-10",
      "체험학습",
      "초기 내용",
    );
    let events = await listNoticeEvents(db2, owner2);
    expect(events.find((x) => x.id === e.id)?.content).toBe("초기 내용");

    await updateNoticeEvent(
      db2,
      owner2,
      e.id,
      "2099-03-11",
      "체험학습(수정)",
      "변경된 내용",
    );
    events = await listNoticeEvents(db2, owner2);
    const row = events.find((x) => x.id === e.id);
    expect(row?.title).toBe("체험학습(수정)");
    expect(row?.date).toBe("2099-03-11");
    expect(row?.content).toBe("변경된 내용");
  });

  it("(c) saveFixedClassSetting upsert + listFixedClassSettings 반환", async () => {
    await saveFixedClassSetting(db2, owner2, 2, 1, "물리학Ⅰ", true);
    await saveFixedClassSetting(db2, owner2, 2, 1, "생활과학", false);
    await saveFixedClassSetting(db2, owner2, 3, 5, "확률과통계", true);

    const grade2 = await listFixedClassSettings(db2, owner2, 2);
    expect(grade2).toHaveLength(2);
    expect(grade2.find((r) => r.subjectName === "물리학Ⅰ")?.isFixed).toBe(true);
    expect(grade2.find((r) => r.subjectName === "생활과학")?.isFixed).toBe(false);

    // upsert: 같은 키 재저장 시 isFixed 갱신(중복 행 미생성).
    await saveFixedClassSetting(db2, owner2, 2, 1, "생활과학", true);
    const grade2b = await listFixedClassSettings(db2, owner2, 2);
    expect(grade2b).toHaveLength(2);
    expect(grade2b.find((r) => r.subjectName === "생활과학")?.isFixed).toBe(true);

    // 다른 학년은 격리된다.
    const grade3 = await listFixedClassSettings(db2, owner2, 3);
    expect(grade3).toHaveLength(1);
    expect(grade3[0].subjectName).toBe("확률과통계");
  });
});
