/**
 * 푸시 대상 필터링 순수 함수 (합의 계획 push-notifications, US-2).
 * DB 를 모르는 순수 로직 → 단위테스트 용이. 발송 유틸(send.ts)과 이벤트 트리거(US-7)
 * 호출부가 공유한다.
 */

/**
 * 활성 학생 링크만 남긴다. 폐기(revokedAt !== null)되었거나 만료
 * (expiresAt !== null && expiresAt <= now)된 링크는 제외.
 */
export function filterActiveStudentTargets<
  T extends { revokedAt: Date | null; expiresAt: Date | null },
>(rows: T[], now: Date = new Date()): T[] {
  return rows.filter((row) => {
    if (row.revokedAt !== null) return false;
    if (row.expiresAt !== null && row.expiresAt <= now) return false;
    return true;
  });
}

/**
 * prefs 키가 켜져 있는지(기본 켜짐). prefs 가 객체이고 prefs[key] === false 일 때만
 * false. undefined/true/객체 아님은 전부 true. 옵트아웃 모델 — 명시적 false 만 끔.
 */
export function prefEnabled(prefs: unknown, key: string): boolean {
  if (typeof prefs !== "object" || prefs === null) return true;
  return (prefs as Record<string, unknown>)[key] !== false;
}
