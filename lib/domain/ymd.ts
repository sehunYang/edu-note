/**
 * yyyy-mm-dd 문자열 산술 — 타임존 무관(UTC 고정).
 *
 * 브라우저 로컬 시간대에 기대지 않으므로 서버(Vercel=UTC)와 교사 PC(KST) 어디서
 * 돌려도 같은 답이 나온다. "오늘"이 필요하면 kst.ts 의 kstDateString 을 쓴다.
 */

function toUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

/** (year, month 1-based, day) → yyyy-mm-dd. */
export function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** ymd 에 일수를 더한다(음수 가능). 월·연 경계와 윤년은 Date 가 넘긴다. */
export function shiftYmd(ymd: string, days: number): string {
  const d = toUtc(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 요일(0=일 .. 6=토). */
export function ymdWeekday(ymd: string): number {
  return toUtc(ymd).getUTCDay();
}

/** 달력 격자(일요일 시작): 첫째 날 앞 빈칸은 null, 이후 1..말일. */
export function monthGrid(year: number, month: number): (number | null)[] {
  const lead = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: last }, (_, i) => i + 1),
  ];
}

/** 모양(yyyy-mm-dd)뿐 아니라 실제 달력에 있는 날짜인지(2026-13-45 거부). */
export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = toUtc(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
