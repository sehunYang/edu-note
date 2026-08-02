/**
 * KST(UTC+9) 날짜 유틸 — 서버(Vercel=UTC)와 클라이언트(교사 로컬=KST)가 같은
 * "오늘"을 쓰도록 하는 단일 정의.
 *
 * 왜 필요한가: `new Date().toISOString().slice(0,10)` 은 UTC 날짜라
 * KST 00:00~09:00(= UTC 전날 15:00~24:00) 사이에는 **하루 전 날짜**를 돌려준다.
 * 교사 사용 시간대의 핵심인 아침 조회(08:15 KST)가 정확히 이 구간에 들어가,
 * 출결·관찰·행특·상담의 기본 날짜가 전날로 기입되는 오기록을 만든다.
 */

/** 오늘 KST 날짜(yyyy-mm-dd). */
export function kstDateString(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/** KST 기준 요일(1=월 .. 7=일). */
export function kstWeekdayNumber(now: Date = new Date()): number {
  const jsDay = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCDay(); // 0=일..6=토
  return jsDay === 0 ? 7 : jsDay;
}
