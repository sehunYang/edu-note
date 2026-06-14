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

/**
 * 오늘 날짜의 활성 학기(1 | 2). 학년도가 3월~익년 2월이므로 **학년도-aware** 경계다:
 * 1학기 = 3/1 ~ 8/14, 2학기 = 8/15 ~ 익년 2월말. 따라서 1·2월은 직전 시작 학년도의
 * 2학기다(단일 달력 8/15 경계로 보면 1·2월이 1학기로 오분류됨 — 그 함정을 피한다).
 * UTC 기준 결정론.
 */
export function activeSemester(today: Date): 1 | 2 {
  const monthIdx = today.getUTCMonth(); // 0=1월 .. 11=12월
  const day = today.getUTCDate();
  // 1·2월(monthIdx 0~1) = 직전 학년도 2학기
  if (monthIdx <= 1) return 2;
  // 3월~8/14 = 1학기
  if (monthIdx < 7) return 1; // 3~7월
  if (monthIdx === 7 && day < 15) return 1; // 8/1~8/14
  // 8/15 이후 ~ 12월 = 2학기
  return 2;
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

/**
 * 학년도·학기 → 시작·종료 범위(YYYY-MM-DD). 교실 2-2 수업계획·진척도 차시 산정용.
 * 1학기 = 3/1 ~ 8/14, 2학기 = 8/15 ~ 익년 2월 말(학년도-aware, activeSemester 경계와 일치).
 */
export function semesterRange(year: number, sem: 1 | 2): SchoolYearRange {
  if (sem === 1) {
    const start = new Date(Date.UTC(year, 2, 1)); // 3/1
    const end = new Date(Date.UTC(year, 7, 14)); // 8/14
    return { start: fmt(start), end: fmt(end) };
  }
  const start = new Date(Date.UTC(year, 7, 15)); // 8/15
  const end = new Date(Date.UTC(year + 1, 2, 0)); // 익년 2월 말일
  return { start: fmt(start), end: fmt(end) };
}

/** YYYY-MM-DD 에서 하루 전 날짜. */
function prevDay(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return fmt(d);
}

/**
 * QC v3 AC-2.1/2.2 — 1·2학기 **경계일 B** 도출. 기존 8/14 하드코딩 대신 학사일정의
 * **여름방학 시작일**(여름 구간 6~8월의 vacation 이벤트 최소 날짜)을 경계로 쓴다.
 * 1학기 = [3/1, B-1], 2학기 = [B, 익년 2월말]. 여름 vacation 이벤트가 없으면 8/15
 * fallback(=기존 8/14 경계 유지, 무중단). 겨울방학(12~2월)은 2학기 내부라 무시.
 * 순수 함수(결정론·UTC).
 */
export function resolveSemesterBoundary(
  events: { date: string; eventKind: string }[],
  year: number,
): string {
  let earliest: string | null = null;
  for (const e of events) {
    if (e.eventKind !== "vacation") continue;
    const m = new Date(e.date + "T00:00:00Z").getUTCMonth() + 1; // 1~12
    const y = new Date(e.date + "T00:00:00Z").getUTCFullYear();
    // 여름 구간: 해당 학년도의 6~8월.
    if (y !== year || m < 6 || m > 8) continue;
    if (earliest === null || e.date < earliest) earliest = e.date;
  }
  return earliest ?? fmt(new Date(Date.UTC(year, 7, 15))); // fallback 8/15
}

/**
 * QC v3 — 경계일 B 기준 학기 범위. sem1=[3/1, B-1], sem2=[B, 익년 2월말].
 * B 는 resolveSemesterBoundary 결과. semesterRange(순수 fallback)와 동치되는 지점은
 * B=8/15 일 때(sem1 end=8/14).
 */
export function semesterRangeWithBoundary(
  year: number,
  sem: 1 | 2,
  boundary: string,
): SchoolYearRange {
  if (sem === 1) {
    const start = new Date(Date.UTC(year, 2, 1)); // 3/1
    return { start: fmt(start), end: prevDay(boundary) };
  }
  const end = new Date(Date.UTC(year + 1, 2, 0)); // 익년 2월 말일
  return { start: boundary, end: fmt(end) };
}
