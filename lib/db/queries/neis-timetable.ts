import { and, asc, eq, gte, lte, sql as dsql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { neisTimetableSlots } from "../schema/misc";
import type { NeisTimetableEntry } from "@/lib/integrations/neis";

/**
 * NEIS '이번 주 실제' 시간표 캐시 쿼리 계층 (표준(컴시간)과 별개 읽기전용 오버레이).
 *
 * 자동 갱신(daily-brief 크론)이 반별로 이번 주 범위를 replace 하고, /today·학생 페이지가
 * 날짜/주 단위로 읽는다. 수업계획/시수관리(timetable_slots)와 완전히 독립 — 이 테이블을
 * 어떤 로직도 파생 소스로 쓰지 않는다(오염 방지, 순수 표시용).
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface NeisActualSlot {
  grade: number;
  classNo: number;
  date: string; // YYYY-MM-DD
  period: number;
  subjectName: string;
}

/**
 * 한 반의 [fromDate, toDate] 구간 NEIS 시간표를 통째로 교체(멱등). 크론이 이번 주
 * 범위를 매일 다시 써도 같은 결과가 되도록 replace 시맨틱. entries 가 비면 삭제만 수행.
 */
export async function replaceNeisTimetableWeek(
  db: DB,
  ownerId: string,
  grade: number,
  classNo: number,
  fromDate: string,
  toDate: string,
  entries: NeisTimetableEntry[],
): Promise<{ count: number }> {
  await db
    .delete(neisTimetableSlots)
    .where(
      and(
        eq(neisTimetableSlots.ownerId, ownerId),
        eq(neisTimetableSlots.grade, grade),
        eq(neisTimetableSlots.classNo, classNo),
        gte(neisTimetableSlots.date, fromDate),
        lte(neisTimetableSlots.date, toDate),
      ),
    );
  // 구간 밖 날짜·타 학년/반은 방어적으로 제외(입력이 섞여 와도 이 반·구간만 반영).
  const rows = entries.filter(
    (e) =>
      e.grade === grade &&
      e.classNo === classNo &&
      e.date >= fromDate &&
      e.date <= toDate,
  );
  if (rows.length === 0) return { count: 0 };
  await db
    .insert(neisTimetableSlots)
    .values(
      rows.map((e) => ({
        ownerId,
        grade: e.grade,
        classNo: e.classNo,
        date: e.date,
        period: e.period,
        subjectName: e.subject,
      })),
    )
    // 방어적 멱등: 같은 크론 실행 내 중복 키가 오면 최신 subject 로 갱신.
    .onConflictDoUpdate({
      target: [
        neisTimetableSlots.ownerId,
        neisTimetableSlots.grade,
        neisTimetableSlots.classNo,
        neisTimetableSlots.date,
        neisTimetableSlots.period,
      ],
      set: { subjectName: dsql`excluded.subject_name` },
    });
  return { count: rows.length };
}

/** 특정 날짜의 owner 전체 반 NEIS 시간표(/today 오버레이용). 반·교시순. */
export async function listNeisActualForDate(
  db: DB,
  ownerId: string,
  date: string,
): Promise<NeisActualSlot[]> {
  return db
    .select({
      grade: neisTimetableSlots.grade,
      classNo: neisTimetableSlots.classNo,
      date: neisTimetableSlots.date,
      period: neisTimetableSlots.period,
      subjectName: neisTimetableSlots.subjectName,
    })
    .from(neisTimetableSlots)
    .where(
      and(
        eq(neisTimetableSlots.ownerId, ownerId),
        eq(neisTimetableSlots.date, date),
      ),
    )
    .orderBy(
      asc(neisTimetableSlots.grade),
      asc(neisTimetableSlots.classNo),
      asc(neisTimetableSlots.period),
    );
}

/** [fromDate,toDate] 구간의 owner 전체 반 NEIS 시간표(오늘의학교 주간 오버레이용). */
export async function listNeisActualForRange(
  db: DB,
  ownerId: string,
  fromDate: string,
  toDate: string,
): Promise<NeisActualSlot[]> {
  return db
    .select({
      grade: neisTimetableSlots.grade,
      classNo: neisTimetableSlots.classNo,
      date: neisTimetableSlots.date,
      period: neisTimetableSlots.period,
      subjectName: neisTimetableSlots.subjectName,
    })
    .from(neisTimetableSlots)
    .where(
      and(
        eq(neisTimetableSlots.ownerId, ownerId),
        gte(neisTimetableSlots.date, fromDate),
        lte(neisTimetableSlots.date, toDate),
      ),
    )
    .orderBy(
      asc(neisTimetableSlots.grade),
      asc(neisTimetableSlots.classNo),
      asc(neisTimetableSlots.date),
      asc(neisTimetableSlots.period),
    );
}

/** [fromDate,toDate] 구간의 한 반 NEIS 시간표(주간 뷰용). 날짜·교시순. */
export async function listNeisActualForWeek(
  db: DB,
  ownerId: string,
  grade: number,
  classNo: number,
  fromDate: string,
  toDate: string,
): Promise<NeisActualSlot[]> {
  return db
    .select({
      grade: neisTimetableSlots.grade,
      classNo: neisTimetableSlots.classNo,
      date: neisTimetableSlots.date,
      period: neisTimetableSlots.period,
      subjectName: neisTimetableSlots.subjectName,
    })
    .from(neisTimetableSlots)
    .where(
      and(
        eq(neisTimetableSlots.ownerId, ownerId),
        eq(neisTimetableSlots.grade, grade),
        eq(neisTimetableSlots.classNo, classNo),
        gte(neisTimetableSlots.date, fromDate),
        lte(neisTimetableSlots.date, toDate),
      ),
    )
    .orderBy(asc(neisTimetableSlots.date), asc(neisTimetableSlots.period));
}
