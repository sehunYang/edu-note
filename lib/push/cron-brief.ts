import { timingSafeEqual, createHash } from "node:crypto";
import { prefEnabled } from "@/lib/push/targeting";

/**
 * 일일 브리핑 크론 순수 로직 (합의 계획 push-notifications, US-8).
 * DB·네트워크를 모르는 순수 함수만 모아 단위테스트를 쉽게 한다. route.ts 는
 * 이 함수들을 조합해 오너 순회·발송을 수행한다.
 */

/**
 * 크론 인증 — Authorization: Bearer <CRON_SECRET> 검증.
 * provided 와 secret 을 항상 32바이트 sha256 해시로 비교하므로 길이가 어떻든
 * timingSafeEqual 이 RangeError 를 던지지 않는다. secret 미설정·헤더 없음·불일치는 전부 false.
 */
export function authorizeCron(
  authHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  const header = authHeader ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(secret).digest();
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export interface BriefingCounts {
  lessons: number;
  nudges: number;
  reports: number;
  events: number;
}

/**
 * 교사 브리핑 body 합성 — 4요소 개수 요약만(개인정보·사유 없이). 4요소가 전부 0이면
 * null 을 반환해 발송을 생략하게 한다.
 */
export function composeBriefingBody(counts: BriefingCounts): string | null {
  const { lessons, nudges, reports, events } = counts;
  if (lessons === 0 && nudges === 0 && reports === 0 && events === 0) {
    return null;
  }
  return `오늘 수업 ${lessons}개 · 넛지 ${nudges}건 · 미제출 신고서 ${reports}건 · 일정 ${events}건`;
}

interface OwnerPrefRow {
  ownerId: string;
  prefs: unknown;
}

/** T3 대상 오너 — audience='teacher' 구독 중 prefs.briefing 이 꺼지지 않은 오너(distinct). */
export function distinctTeacherBriefingOwners(rows: OwnerPrefRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (prefEnabled(r.prefs, "briefing")) set.add(r.ownerId);
  }
  return [...set];
}

/**
 * S3 대상 오너 — audience='student' 구독(publicPages 조인으로 도출한 ownerId) 중
 * prefs.s3 가 꺼지지 않은 오너(distinct). T3 의 briefing 토글과 완전히 독립이다.
 */
export function distinctStudentS3Owners(rows: OwnerPrefRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (prefEnabled(r.prefs, "s3")) set.add(r.ownerId);
  }
  return [...set];
}
