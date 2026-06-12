import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { courseSections, timetableSlots } from "../schema/classes";
import { lessonPlans } from "../schema/records";
import { schoolDayCalendar } from "../schema/misc";
import { semesterRange } from "@/lib/domain/school-year";
import { computePlanLength } from "@/lib/domain/lesson-plan";

/**
 * 수업 계획실 쿼리 계층 (교실 2-2 단계2, ownerId 인자 규약).
 * 과목단위 차시 계획(1..N) CRUD + 차시 N 산출(학기 수업일 ∩ 슬롯 요일).
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface LessonPlanRow {
  id: string;
  subjectId: string;
  ordinal: number;
  content: string | null;
  keywords: string[] | null;
}

/**
 * 차시 N 산출. semesterRange ∩ 수업일(isSchoolDay=true) 중, 과목의 모든 분반
 * 시간표 슬롯 요일(UNION)에 해당하는 날짜 수.
 *
 * 설계 선택(계획 §단계2/R3·R16): N = 과목 분반들의 최대 커버리지. 분반별 차시수가
 * 상이할 수 있으나 요일을 UNION 하면 "어느 분반이든 수업하는 요일"을 모두 포함해
 * 최댓값을 근사한다. (개별 분반 차시 매핑은 진척도 단계에서 날짜순위로 처리.)
 */
export async function getPlanLength(
  db: DB,
  ownerId: string,
  subjectId: string,
  year: number,
  sem: 1 | 2,
): Promise<number> {
  const { start, end } = semesterRange(year, sem);

  // 과목의 분반들.
  const secs = await db
    .select({ id: courseSections.id })
    .from(courseSections)
    .where(
      and(
        eq(courseSections.ownerId, ownerId),
        eq(courseSections.subjectId, subjectId),
      ),
    );
  const sectionIds = secs.map((s) => s.id);
  if (sectionIds.length === 0) return 0;

  // 분반 시간표 슬롯 요일 UNION (sessions.ts 와 동일하게 weekday 값을 그대로 사용).
  const slots = await db
    .select({ weekday: timetableSlots.weekday })
    .from(timetableSlots)
    .where(
      and(
        eq(timetableSlots.ownerId, ownerId),
        inArray(timetableSlots.sectionId, sectionIds),
      ),
    );
  const slotWeekdays = new Set(slots.map((s) => s.weekday));
  if (slotWeekdays.size === 0) return 0;

  // 학기 범위 수업일.
  const schoolDays = await db
    .select({ date: schoolDayCalendar.date })
    .from(schoolDayCalendar)
    .where(
      and(
        eq(schoolDayCalendar.ownerId, ownerId),
        eq(schoolDayCalendar.isSchoolDay, true),
        gte(schoolDayCalendar.date, start),
        lte(schoolDayCalendar.date, end),
      ),
    );

  return computePlanLength(schoolDays, slotWeekdays);
}

/** 과목의 차시 계획 목록(ordinal 오름차순). */
export async function listLessonPlan(
  db: DB,
  ownerId: string,
  subjectId: string,
): Promise<LessonPlanRow[]> {
  return db
    .select({
      id: lessonPlans.id,
      subjectId: lessonPlans.subjectId,
      ordinal: lessonPlans.ordinal,
      content: lessonPlans.content,
      keywords: lessonPlans.keywords,
    })
    .from(lessonPlans)
    .where(
      and(eq(lessonPlans.ownerId, ownerId), eq(lessonPlans.subjectId, subjectId)),
    )
    .orderBy(asc(lessonPlans.ordinal));
}

export interface LessonPlanEntryInput {
  content?: string | null;
  keywords?: string[];
}

/** 차시 1행 upsert. 충돌 키 (subjectId, ordinal). */
export async function upsertLessonPlanEntry(
  db: DB,
  ownerId: string,
  subjectId: string,
  ordinal: number,
  input: LessonPlanEntryInput,
): Promise<void> {
  const content = input.content?.trim() ? input.content.trim() : null;
  const keywords =
    input.keywords && input.keywords.length > 0 ? input.keywords : null;
  await db
    .insert(lessonPlans)
    .values({ ownerId, subjectId, ordinal, content, keywords })
    .onConflictDoUpdate({
      target: [lessonPlans.subjectId, lessonPlans.ordinal],
      set: { content, keywords, updatedAt: new Date() },
    });
}

/** 차시 1행 삭제. 소유자 본인 행만. */
export async function deleteLessonPlanEntry(
  db: DB,
  ownerId: string,
  subjectId: string,
  ordinal: number,
): Promise<void> {
  await db
    .delete(lessonPlans)
    .where(
      and(
        eq(lessonPlans.ownerId, ownerId),
        eq(lessonPlans.subjectId, subjectId),
        eq(lessonPlans.ordinal, ordinal),
      ),
    );
}
