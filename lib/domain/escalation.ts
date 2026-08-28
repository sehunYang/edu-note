/**
 * 신고서 미제출 에스컬레이션 (계획 §3.4 escalation, AC-F).
 *
 * 티어는 미제출 화면과 같은 규칙(lib/domain/attendance.ts submissionTier)을
 * 쓴다 — 남은 수업일 ≥3 정상 / 2 위험 / 1~0 심각 / 마감 경과 제출불가.
 * 남은 수업일 = 마감 수업일 수(출결 5·교외체험 10) − 경과 수업일 수.
 * report_tier enum 은 3단이라 제출불가(expired)는 심각으로 캡해 저장한다.
 * 수업일은 school_day_calendar(공휴일·주말 제외)에 의존하므로,
 * 순수 함수에는 `isSchoolDay` 판정을 주입한다.
 */
import { submissionTier } from "./attendance";
import type { ReportTier } from "./types";

/** 경과 수업일 수 + 마감 수업일 수 → 티어(expired 는 critical 로 캡). */
export function computeTier(
  elapsedSchoolDays: number,
  deadlineSchoolDays = 5,
): ReportTier {
  const tier = submissionTier(deadlineSchoolDays - elapsedSchoolDays);
  return tier === "expired" ? "critical" : tier;
}

/** 두 날짜의 UTC 자정 표현(시각·타임존 드리프트 제거). */
function toUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * (fromExclusive, toInclusive] 구간의 수업일 수.
 * 기준일(결석/교외체험일) 다음 날부터 asOf 까지 수업일을 센다.
 */
export function countSchoolDays(
  fromExclusive: Date,
  toInclusive: Date,
  isSchoolDay: (d: Date) => boolean,
): number {
  const end = toUtcMidnight(toInclusive);
  const cur = toUtcMidnight(fromExclusive);
  cur.setUTCDate(cur.getUTCDate() + 1);
  let count = 0;
  while (cur <= end) {
    if (isSchoolDay(new Date(cur))) count += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

/** 기준일·기준시점·수업일 판정·마감 수업일 수로 바로 티어 계산. */
export function tierFromDates(
  baseDate: Date,
  asOf: Date,
  isSchoolDay: (d: Date) => boolean,
  deadlineSchoolDays = 5,
): ReportTier {
  return computeTier(
    countSchoolDays(baseDate, asOf, isSchoolDay),
    deadlineSchoolDays,
  );
}
