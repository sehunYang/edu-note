/**
 * 공개 표면(/p/*) IP 레이트리밋 — 고정창(fixed-window) 인메모리 (보안점검 2026-07 ②).
 *
 * 미인증 토큰 페이지·서버액션은 요청당 DB 를 치므로, 대량 토큰 스캔(404 플러딩)이나
 * 유효 토큰 보유자의 반복 호출이 DB 부하로 직결되는 것을 미들웨어 단에서 차단한다.
 *
 * 한계: 인스턴스별 카운터(다중 인스턴스/재기동 시 리셋)라 완전한 방어가 아닌 1차
 * 방어선이다. 플랫폼 레벨 방어(Vercel WAF rate limit)와 병행을 권장.
 *
 * 한도 산정: 학교 NAT 뒤에서 학급 전체(30여 명)가 같은 공인 IP 를 쓰는 경우를
 * 고려해 넉넉히 잡는다(정상 사용 차단 방지, 플러딩만 차단).
 */
export const RATE_WINDOW_MS = 60_000; // 1분 창
export const RATE_MAX_PER_WINDOW = 300; // 창당 IP 별 최대 요청
const MAX_KEYS = 10_000; // 버킷 맵 메모리 상한

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** 만료 버킷 제거. 그래도 가득이면 전체 초기화(메모리 상한이 정확도보다 우선). */
function sweep(now: number): void {
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size >= MAX_KEYS) buckets.clear();
}

/**
 * key(IP) 의 이번 요청 허용 여부. true=허용, false=한도 초과(429 응답 대상).
 * now 는 테스트 주입용.
 */
export function checkPublicRateLimit(
  key: string,
  now: number = Date.now(),
): boolean {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) sweep(now);
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  b.count += 1;
  return b.count <= RATE_MAX_PER_WINDOW;
}

/** 테스트 전용 — 버킷 초기화. */
export function resetPublicRateLimit(): void {
  buckets.clear();
}
