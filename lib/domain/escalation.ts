/**
 * 신고서 미제출 에스컬레이션 (계획 §3.4 escalation, AC-F).
 *
 * 경과 수업일 기준: ≤3 정상 / >3 위험 / >5 심각.
 * 수업일은 school_day_calendar(공휴일·주말 제외)에 의존하므로,
 * 순수 함수에는 `isSchoolDay` 판정을 주입한다.
 */
import type { ReportTier } from "./types";

export const ESCALATION = {
  /** 이 값 초과(>3)부터 '위험'. */
  warningAfterSchoolDays: 3,
  /** 이 값 초과(>5)부터 '심각'. */
  criticalAfterSchoolDays: 5,
} as const;

/** 경과 수업일 수 → 티어. */
export function computeTier(elapsedSchoolDays: number): ReportTier {
  if (elapsedSchoolDays > ESCALATION.criticalAfterSchoolDays) return "critical";
  if (elapsedSchoolDays > ESCALATION.warningAfterSchoolDays) return "warning";
  return "normal";
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

/** 기준일·기준시점·수업일 판정으로 바로 티어 계산. */
export function tierFromDates(
  baseDate: Date,
  asOf: Date,
  isSchoolDay: (d: Date) => boolean,
): ReportTier {
  return computeTier(countSchoolDays(baseDate, asOf, isSchoolDay));
}
