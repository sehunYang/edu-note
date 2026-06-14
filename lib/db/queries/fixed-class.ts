import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { fixedClassSettings } from "../schema/misc";
import type { DecodedTimetable } from "@/lib/integrations/comcigan";

/**
 * 고정반(원반) 설정 쿼리 계층 (QC v3 Part B, AC-10.3).
 *
 * 담임 학년의 컴시간 시간표를 파싱해 (반, 과목) 단위 수업 제공(offering)을 도출하고,
 * 교사가 어떤 과목이 고정반(원반)인지 vs 선택과목(이동반)인지 체크해 fixed_class_settings
 * 에 영속한다. 컴시간 파싱은 비공식·변동 → 실패 시 throw(호출측은 "동기화 실패, 수기"
 * 안내). 영속 계층(save/list)은 컴시간과 독립적으로 동작한다.
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface GradeClassOffering {
  classNo: number;
  subjectName: string;
}

/**
 * 디코딩된 학년 전체 시간표에서 해당 학년의 distinct (반, 과목) 제공 목록을 도출한다.
 * 컴시간 디코딩 자체가 실패(throw)했다면 호출 전에 이미 던져졌을 것이므로, 여기서는
 * 슬롯이 비어 있으면(해당 학년 수업 미발견) throw 한다.
 */
export function listGradeClasses(
  decoded: DecodedTimetable,
  grade: number,
): GradeClassOffering[] {
  const seen = new Set<string>();
  const offerings: GradeClassOffering[] = [];
  for (const s of decoded.slots) {
    if (s.grade !== grade) continue;
    const key = `${s.classNo}::${s.subject}`;
    if (seen.has(key)) continue;
    seen.add(key);
    offerings.push({ classNo: s.classNo, subjectName: s.subject });
  }
  if (offerings.length === 0) {
    throw new Error(
      `${grade}학년 시간표 수업을 찾지 못했습니다(컴시간 구조 변경 가능).`,
    );
  }
  offerings.sort(
    (a, b) =>
      a.classNo - b.classNo || a.subjectName.localeCompare(b.subjectName),
  );
  return offerings;
}

export interface FixedClassSettingRow {
  id: string;
  grade: number;
  classNo: number;
  subjectName: string;
  isFixed: boolean;
}

/** 고정반 설정 upsert(owner+grade+classNo+subjectName 유니크). audit 는 호출측. */
export async function saveFixedClassSetting(
  db: DB,
  ownerId: string,
  grade: number,
  classNo: number,
  subjectName: string,
  isFixed: boolean,
): Promise<void> {
  await db
    .insert(fixedClassSettings)
    .values({ ownerId, grade, classNo, subjectName, isFixed })
    .onConflictDoUpdate({
      target: [
        fixedClassSettings.ownerId,
        fixedClassSettings.grade,
        fixedClassSettings.classNo,
        fixedClassSettings.subjectName,
      ],
      set: { isFixed, updatedAt: new Date() },
    });
}

/** 특정 학년의 고정반 설정 목록(반·과목순). */
export async function listFixedClassSettings(
  db: DB,
  ownerId: string,
  grade: number,
): Promise<FixedClassSettingRow[]> {
  return db
    .select({
      id: fixedClassSettings.id,
      grade: fixedClassSettings.grade,
      classNo: fixedClassSettings.classNo,
      subjectName: fixedClassSettings.subjectName,
      isFixed: fixedClassSettings.isFixed,
    })
    .from(fixedClassSettings)
    .where(
      and(
        eq(fixedClassSettings.ownerId, ownerId),
        eq(fixedClassSettings.grade, grade),
      ),
    )
    .orderBy(asc(fixedClassSettings.classNo), asc(fixedClassSettings.subjectName));
}
