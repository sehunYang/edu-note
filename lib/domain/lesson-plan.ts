/**
 * 수업 계획실 도메인 (교실 2-2 단계2). 순수 함수(네트워크·DB 없음).
 *
 * 차시 N = 학기 범위의 수업일(school_day_calendar) 중 과목 시간표 슬롯 요일에
 * 해당하는 날짜 수. 요일 판정은 sessions.ts 차시 엔진과 동일한 UTC 규약을 쓴다
 * (`new Date(date+"T00:00:00Z").getUTCDay()`, 0=일..6=토). 결정론·타임존 무관.
 */

/** 날짜 문자열(YYYY-MM-DD)의 요일. 0=일 .. 6=토 (sessions.ts와 동일 규약). */
export function weekdayOf(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay();
}

/**
 * 차시 N 산출. 수업일 목록 중 요일이 슬롯 요일 집합에 속하는 날짜 수.
 *
 * 규약: sessions.ts 차시 엔진과 동일하게 timetableSlots.weekday 값을 그대로
 * weekdayOf(getUTCDay) 결과와 비교한다. 월~금은 두 규약(1=월..5=금)이 일치하므로
 * 실제 수업 슬롯에서 정확하다(일요일만 7 vs 0 으로 갈리나 수업 슬롯 부재).
 */
export function computePlanLength(
  schoolDays: { date: string }[],
  slotWeekdays: Set<number>,
): number {
  if (slotWeekdays.size === 0) return 0;
  let n = 0;
  for (const { date } of schoolDays) {
    if (slotWeekdays.has(weekdayOf(date))) n += 1;
  }
  return n;
}

/** 한 분반의 시간표 슬롯 요일 목록(중복 가능 — 슬롯 수 = 주당 시수). */
export interface SectionSlots {
  sectionId: string;
  /** timetableSlots.weekday 값들(슬롯당 1개, 같은 요일 복수 슬롯이면 중복 포함). */
  weekdays: number[];
}

/**
 * QC v3 AC-1.1/1.2 — 차시 N 의 **대표 분반** 선정. 같은 과목 분반들은 동일 시수를
 * 진행하므로(분반 무관), 주당 슬롯 수(=시수)가 **최대**인 분반 하나의 요일 집합을 쓴다.
 * 기존 버그(분반 요일 UNION)는 분반이 많을수록 커버리지가 부풀어 N 이 과대(물리=97).
 * 동률이면 입력 순서상 첫 분반(결정론). 빈 입력이면 빈 Set.
 */
export function pickRepresentativeSection(
  sections: SectionSlots[],
): Set<number> {
  let best: SectionSlots | null = null;
  for (const s of sections) {
    if (best === null || s.weekdays.length > best.weekdays.length) best = s;
  }
  return new Set(best?.weekdays ?? []);
}

/**
 * QC v3 AC-1.3 — 대표 분반의 수업일(차시) 날짜를 오름차순으로. ordinal k 의 날짜 =
 * 반환 배열[k-1]. 월/주차·시험마커 산출에 사용.
 */
export function representativeDates(
  schoolDays: { date: string }[],
  weekdays: Set<number>,
): string[] {
  if (weekdays.size === 0) return [];
  return schoolDays
    .filter((d) => weekdays.has(weekdayOf(d.date)))
    .map((d) => d.date)
    .sort();
}

/**
 * QC v3 AC-1.3 — 날짜의 '월/주차' 라벨(대략적 시기). weekOfMonth 는 달 안에서의
 * 주차로 floor((일-1)/7)+1 (1~5). 결정론·타임존 무관(UTC 파싱).
 */
export function monthWeekLabel(date: string): { month: number; weekOfMonth: number } {
  const d = new Date(date + "T00:00:00Z");
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return { month, weekOfMonth: Math.floor((day - 1) / 7) + 1 };
}
