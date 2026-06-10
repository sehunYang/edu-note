/**
 * 학년도 파생 도메인 (QC v1 C1). 별도 저장 포인터 없이 오늘 날짜로 활성 학년도를
 * 산정한다. 경계 = 3/1 (예: 2026학년도 = 2026-03-01 ~ 2027-02-28/29).
 *
 * 순수 함수(네트워크·DB 없음). UTC 기준으로 계산해 타임존 무관 결정론을 보장한다.
 */

/** 오늘 날짜의 활성 학년도. 3/1 이상이면 그 해, 2월 이하면 직전 해. */
export function activeSchoolYear(today: Date): number {
  const year = today.getUTCFullYear();
  const monthIdx = today.getUTCMonth(); // 0=1월 .. 2=3월
  return monthIdx >= 2 ? year : year - 1;
}

export interface SchoolYearRange {
  /** 시작일 YYYY-MM-DD (해당 학년도 3/1). */
  start: string;
  /** 종료일 YYYY-MM-DD (익년 2월 말, 윤년 보정). */
  end: string;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 학년도 → 시작(3/1)·종료(익년 2말) 범위. */
export function schoolYearRange(year: number): SchoolYearRange {
  const start = new Date(Date.UTC(year, 2, 1)); // 3/1
  // 익년 2월 말일: (year+1, 2, 0) = 익년 3월 0일 = 2월 마지막 날(윤년 자동 보정)
  const end = new Date(Date.UTC(year + 1, 2, 0));
  return { start: fmt(start), end: fmt(end) };
}

/** "YYYYMMDD"(NEIS 질의용) 형태의 학년도 범위. */
export function schoolYearRangeYmd(year: number): { from: string; to: string } {
  const r = schoolYearRange(year);
  return { from: r.start.replace(/-/g, ""), to: r.end.replace(/-/g, "") };
}
