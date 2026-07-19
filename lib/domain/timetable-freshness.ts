/**
 * NEIS '이번 주 실제' 시간표 최신성 배지 규칙(순수 함수). 학생 페이지·오늘의학교 공용.
 * syncedAt(마지막 갱신 ISO)과 오늘(KST yyyy-mm-dd)을 비교해 배지 문구를 만든다.
 * 미갱신(null)이면 배지 숨김(null 반환).
 */
export interface FreshnessBadge {
  label: string;
  stale: boolean; // true 면 경고 톤(오래됨)
}

/** ISO 일시 → KST(UTC+9) 날짜 yyyy-mm-dd. 파싱 불가면 null. */
function kstDateOf(iso: string): string | null {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return new Date(t.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 두 yyyy-mm-dd 사이 일수(a - b). */
function dayDiff(a: string, b: string): number {
  const ta = new Date(a + "T00:00:00Z").getTime();
  const tb = new Date(b + "T00:00:00Z").getTime();
  return Math.round((ta - tb) / (24 * 60 * 60 * 1000));
}

export function neisFreshnessBadge(
  syncedAt: string | null,
  today: string,
): FreshnessBadge | null {
  if (!syncedAt) return null;
  const synced = kstDateOf(syncedAt);
  if (synced === null) return null;
  const days = dayDiff(today, synced);
  if (days <= 0) return { label: "✓ 오늘 갱신", stale: false };
  return { label: `⚠ ${days}일 전 기준`, stale: true };
}
