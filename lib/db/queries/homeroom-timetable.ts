import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  homeroomTimetableSlots,
  studentElectiveMappings,
} from "../schema/misc";
import type { DecodedTimetable } from "@/lib/integrations/comcigan";

/**
 * 담임반 시간표 캐시 + 학생 선택과목 자가매핑 쿼리 계층 (QC v3 Part B, US-B13, AC-12.3/12.4).
 *
 * 담임반(grade, classNo)의 컴시간 학년 파싱 슬롯을 (weekday, period, subject) 단위로
 * 캐시한다(0028). 공개 페이지 get_public_page(0029) timetable 의 소스. 컴시간 파싱은
 * 비공식·변동 → 실패 시 호출측이 throw(동기화 실패 안내). 영속 계층은 컴시간과 독립.
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface HomeroomTimetableSlotRow {
  weekday: number;
  period: number;
  subjectName: string;
}

/**
 * 디코딩된 학년 전체 시간표에서 (grade, classNo) 의 (weekday, period) 슬롯을 도출한다.
 * 한 (요일,교시)에 여러 과목(반 섞인 선택과목)이 있으면 첫 과목만 캐시한다(시간표 한 칸 = 1행).
 * 슬롯이 비면(해당 반 수업 미발견) throw — 컴시간 구조 변경 가능.
 *
 * ⚠ 소스는 **classSlots(학급별 원본 자료481)** 다. slots(교사별 자료542)는 금주 반영본이라
 * 방학·시험 주간에 동기화하면 시간표가 조각으로 덮어써진다(2026-07 실측: 2-9 이 29칸 →
 * 7칸). 원본은 변경과 무관해 방학 중에도 온전하므로 담임반 표준의 정답 소스다.
 * classSlots 가 비면(구조 변경) slots 로 폴백하지 않고 throw — 조용한 손상보다 실패가 낫다.
 */
export function decodedToHomeroomSlots(
  decoded: DecodedTimetable,
  grade: number,
  classNo: number,
): HomeroomTimetableSlotRow[] {
  if (decoded.classSlots.length === 0) {
    throw new Error(
      "컴시간 학급별 원본 시간표(자료481)를 찾지 못했습니다(서비스 구조 변경 가능).",
    );
  }
  const byCell = new Map<string, string>();
  for (const s of decoded.classSlots) {
    if (s.grade !== grade || s.classNo !== classNo) continue;
    const key = `${s.weekday}::${s.period}`;
    if (!byCell.has(key)) byCell.set(key, s.subject);
  }
  if (byCell.size === 0) {
    throw new Error(
      `${grade}학년 ${classNo}반 시간표 수업을 찾지 못했습니다(컴시간 구조 변경 가능).`,
    );
  }
  // 조각 방지: 원본이면 반드시 월~금이 다 있다. 일부 요일만 나오면 원본이 아닌 배열을
  // 집었거나 구조가 바뀐 것 — 그대로 replace 하면 정상 시간표가 조각으로 덮어써진다.
  const days = new Set([...byCell.keys()].map((k) => Number(k.split("::")[0])));
  if (days.size < 5) {
    throw new Error(
      `${grade}학년 ${classNo}반 시간표가 ${days.size}개 요일만 조회됐습니다(정상은 5일). ` +
        `기존 시간표를 덮어쓰지 않았습니다 — 잠시 후 다시 시도하세요.`,
    );
  }
  const rows: HomeroomTimetableSlotRow[] = [];
  for (const [key, subjectName] of byCell) {
    const [weekday, period] = key.split("::").map(Number);
    rows.push({ weekday, period, subjectName });
  }
  rows.sort((a, b) => a.weekday - b.weekday || a.period - b.period);
  return rows;
}

/**
 * 담임반 시간표 슬롯을 통째로 교체한다(해당 grade/classNo 기존 행 삭제 후 일괄 삽입).
 * 컴시간 동기화는 멱등(한 번 더 돌려도 같은 결과)이어야 하므로 replace 시맨틱.
 */
export async function replaceHomeroomTimetable(
  db: DB,
  ownerId: string,
  grade: number,
  classNo: number,
  slots: HomeroomTimetableSlotRow[],
): Promise<{ count: number }> {
  await db
    .delete(homeroomTimetableSlots)
    .where(
      and(
        eq(homeroomTimetableSlots.ownerId, ownerId),
        eq(homeroomTimetableSlots.grade, grade),
        eq(homeroomTimetableSlots.classNo, classNo),
      ),
    );
  if (slots.length === 0) return { count: 0 };
  await db.insert(homeroomTimetableSlots).values(
    slots.map((s) => ({
      ownerId,
      grade,
      classNo,
      weekday: s.weekday,
      period: s.period,
      subjectName: s.subjectName,
    })),
  );
  return { count: slots.length };
}

/** 담임반 시간표 슬롯 목록(요일·교시순). */
export async function listHomeroomTimetable(
  db: DB,
  ownerId: string,
  grade: number,
  classNo: number,
): Promise<HomeroomTimetableSlotRow[]> {
  return db
    .select({
      weekday: homeroomTimetableSlots.weekday,
      period: homeroomTimetableSlots.period,
      subjectName: homeroomTimetableSlots.subjectName,
    })
    .from(homeroomTimetableSlots)
    .where(
      and(
        eq(homeroomTimetableSlots.ownerId, ownerId),
        eq(homeroomTimetableSlots.grade, grade),
        eq(homeroomTimetableSlots.classNo, classNo),
      ),
    )
    .orderBy(
      asc(homeroomTimetableSlots.weekday),
      asc(homeroomTimetableSlots.period),
    );
}

/**
 * 학생 선택과목 자가매핑 upsert (owner + student_year_id + weekday + period 영속, 1:1).
 * audit 는 호출측(토큰 스코프 액션)에서 resolved owner 로 기록.
 */
export async function upsertStudentElectiveMapping(
  db: DB,
  ownerId: string,
  studentYearId: string,
  weekday: number,
  period: number,
  mappedSubject: string,
): Promise<void> {
  await db
    .insert(studentElectiveMappings)
    .values({ ownerId, studentYearId, weekday, period, mappedSubject })
    .onConflictDoUpdate({
      target: [
        studentElectiveMappings.studentYearId,
        studentElectiveMappings.weekday,
        studentElectiveMappings.period,
      ],
      set: { mappedSubject, updatedAt: new Date() },
    });
}
