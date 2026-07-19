import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  activeSchoolYear,
  activeSemester,
} from "@/lib/domain/school-year";
import { weekRange } from "@/app/(shell)/today/today-lib";
import { fetchHisTimetable } from "./neis-client";
import { replaceNeisTimetableWeek } from "@/lib/db/queries";

/**
 * NEIS '이번 주 실제' 시간표 자동 갱신 (daily-brief 크론의 첫 단계).
 *
 * 표준(컴시간)은 절대 건드리지 않는 읽기전용 오버레이 레이어만 갱신한다. 대상은
 * NEIS 코드(office+school)가 설정된 오너뿐(교사 세팅 게이트). 각 오너의 담임반 ∪ 수업
 * 반을 이번 주(월~금)로 조회해 neis_timetable_slots 를 replace 하고 최신성 시각을 남긴다.
 * 비수업일 오너는 스킵(직전 캐시 유지 → 학생/교사 화면은 표준 폴백 + '오래됨' 배지).
 * NEIS 클라이언트는 Result 라 throw 없음 — 개별 반 실패는 건너뛰고 계속한다.
 */

type DB = ReturnType<typeof getDb>;

export interface SyncClass {
  grade: number;
  classNo: number;
}

/** "2-9" → {grade:2, classNo:9}. 형식 불명은 null. */
export function parseClassLabel(label: string): SyncClass | null {
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(label);
  if (!m) return null;
  const grade = Number(m[1]);
  const classNo = Number(m[2]);
  if (grade < 1 || classNo < 1) return null;
  return { grade, classNo };
}

/**
 * 동기화 대상 반 집합 = 담임반(있으면) ∪ 수업 반 라벨. 중복 제거(grade-classNo 키).
 * 순수 함수(테스트 용이) — 호출측이 담임반·라벨 목록을 넘긴다.
 */
export function collectSyncClasses(
  homeroom: SyncClass | null,
  sectionLabels: string[],
): SyncClass[] {
  const map = new Map<string, SyncClass>();
  const add = (c: SyncClass | null) => {
    if (c) map.set(`${c.grade}-${c.classNo}`, c);
  };
  add(homeroom);
  for (const label of sectionLabels) add(parseClassLabel(label));
  return [...map.values()];
}

/** date(yyyy-mm-dd) → 이번 주 월~금 YYYYMMDD 범위(NEIS 조회 파라미터 형식). */
export function weekMonToFri(date: string): {
  fromDate: string;
  toDate: string;
  fromYmd: string;
  toYmd: string;
} {
  const { weekStart } = weekRange(date);
  const mon = new Date(weekStart + "T00:00:00Z");
  const fri = new Date(mon);
  fri.setUTCDate(mon.getUTCDate() + 4);
  const toDate = fri.toISOString().slice(0, 10);
  const ymd = (s: string) => s.replace(/-/g, "");
  return {
    fromDate: weekStart,
    toDate,
    fromYmd: ymd(weekStart),
    toYmd: ymd(toDate),
  };
}

/** 오너의 오늘 수업일 여부(schoolDayCalendar 행이 없으면 false — 오발송 회피 정책 일치). */
async function isSchoolDayFor(
  db: DB,
  ownerId: string,
  today: string,
): Promise<boolean> {
  const rows = await db
    .select({ isSchoolDay: schema.schoolDayCalendar.isSchoolDay })
    .from(schema.schoolDayCalendar)
    .where(
      and(
        eq(schema.schoolDayCalendar.ownerId, ownerId),
        eq(schema.schoolDayCalendar.date, today),
      ),
    )
    .limit(1);
  return rows[0]?.isSchoolDay === true;
}

/** 오너의 활성 학년도·학기 수업 반 라벨 목록(distinct 는 collectSyncClasses 가 처리). */
async function listSectionLabels(
  db: DB,
  ownerId: string,
  year: number,
  semester: number,
): Promise<string[]> {
  const rows = await db
    .select({ label: schema.courseSections.label })
    .from(schema.courseSections)
    .innerJoin(
      schema.subjects,
      eq(schema.subjects.id, schema.courseSections.subjectId),
    )
    .where(
      and(
        eq(schema.courseSections.ownerId, ownerId),
        eq(schema.subjects.schoolYear, year),
        eq(schema.subjects.semester, semester),
      ),
    );
  return rows.map((r) => r.label);
}

export interface NeisSyncSummary {
  owners: number;
  classesSynced: number;
  slotsWritten: number;
  skippedNonSchoolDay: number;
  skippedNoNeis: number;
  fetchFailures: number;
}

/**
 * 크론 진입점. NEIS 코드가 설정된 모든 오너를 순회하며 이번 주 실제 시간표를 갱신한다.
 * today = KST yyyy-mm-dd(호출측이 산출해 전달). DB 오류는 상위 try/catch 로 격리.
 */
export async function syncNeisTimetables(
  db: DB,
  today: string,
): Promise<NeisSyncSummary> {
  const summary: NeisSyncSummary = {
    owners: 0,
    classesSynced: 0,
    slotsWritten: 0,
    skippedNonSchoolDay: 0,
    skippedNoNeis: 0,
    fetchFailures: 0,
  };

  const now = new Date();
  const year = activeSchoolYear(now);
  const semester = activeSemester(now);
  const { fromDate, toDate, fromYmd, toYmd } = weekMonToFri(today);

  // NEIS 코드가 설정된 오너만(교사 세팅 게이트).
  const owners = await db
    .select({
      ownerId: schema.teacherProfile.ownerId,
      officeCode: schema.teacherProfile.neisOfficeCode,
      schoolCode: schema.teacherProfile.neisSchoolCode,
      isHomeroom: schema.teacherProfile.isHomeroom,
      homeroomGrade: schema.teacherProfile.homeroomGrade,
      homeroomClassNo: schema.teacherProfile.homeroomClassNo,
    })
    .from(schema.teacherProfile)
    .where(
      and(
        isNotNull(schema.teacherProfile.neisOfficeCode),
        isNotNull(schema.teacherProfile.neisSchoolCode),
      ),
    );

  for (const o of owners) {
    if (!o.officeCode || !o.schoolCode) {
      summary.skippedNoNeis += 1;
      continue;
    }
    summary.owners += 1;

    if (!(await isSchoolDayFor(db, o.ownerId, today))) {
      summary.skippedNonSchoolDay += 1;
      continue;
    }

    const homeroom =
      o.isHomeroom && o.homeroomGrade != null && o.homeroomClassNo != null
        ? { grade: o.homeroomGrade, classNo: o.homeroomClassNo }
        : null;
    const labels = await listSectionLabels(db, o.ownerId, year, semester);
    const classes = collectSyncClasses(homeroom, labels);

    let ownerWroteAny = false;
    for (const c of classes) {
      const res = await fetchHisTimetable(
        { officeCode: o.officeCode, schoolCode: o.schoolCode },
        c.grade,
        c.classNo,
        fromYmd,
        toYmd,
      );
      if (!res.ok) {
        summary.fetchFailures += 1;
        continue;
      }
      // NEIS 응답이 비면(무데이터) replace 는 구간 삭제만 — 표준 폴백 대상이 됨.
      const { count } = await replaceNeisTimetableWeek(
        db,
        o.ownerId,
        c.grade,
        c.classNo,
        fromDate,
        toDate,
        res.data,
      );
      summary.classesSynced += 1;
      summary.slotsWritten += count;
      if (count > 0) ownerWroteAny = true;
    }

    // 최신성 배지: 이번 실행에서 실제 데이터를 한 건이라도 캐시했을 때만 갱신
    // (전부 무데이터/실패면 '오래됨' 배지가 유지되도록 시각을 올리지 않는다).
    if (ownerWroteAny) {
      await db
        .update(schema.teacherProfile)
        .set({ lastNeisTimetableSyncAt: new Date() })
        .where(eq(schema.teacherProfile.ownerId, o.ownerId));
    }
  }

  return summary;
}
