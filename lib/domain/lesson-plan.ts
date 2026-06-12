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
