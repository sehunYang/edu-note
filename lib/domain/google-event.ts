/**
 * 구글 캘린더 동기화 도메인 (구글 캘린더 단방향 동기화 계획 2단계). 순수 함수
 * (DB·네트워크 없음). 날짜 문자열(YYYY-MM-DD) 연산은 이 프로젝트의 기존 관례
 * (`lesson-plan.ts`의 `weekdayOf`)와 동일하게 UTC 고정으로 처리해 타임존 무관·
 * 결정론을 보장한다.
 */

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 메모 UUID → 구글 캘린더 이벤트 id(하이픈 제거·소문자 32-hex). 구글 이벤트 id
 * 규격(charset a–v/0–9, 길이 5–1024)을 충족한다. 결정론(같은 memoId → 같은 id)이
 * 재시도 멱등의 핵심(A′ 설계) — 별도 매핑 컬럼 없이 항상 같은 이벤트를 가리킨다.
 */
export function deriveGoogleEventId(memoId: string): string {
  return memoId.replace(/-/g, "").toLowerCase();
}

export type ValidateMemoTimeResult = { ok: true } | { ok: false; error: string };

/**
 * 선택적 시작/종료 시간 검증(AC-3). 둘 다 null → 종일(ok). HH:MM 형식만 허용.
 * 시작 없이 종료만 입력하면 거부. 종료 < 시작이면 거부(같은 값은 허용).
 */
export function validateMemoTime(
  startTime: string | null,
  endTime: string | null,
): ValidateMemoTimeResult {
  if (startTime === null && endTime === null) return { ok: true };
  if (startTime === null && endTime !== null) {
    return { ok: false, error: "시작 시간 없이 종료 시간만 입력할 수 없습니다." };
  }
  if (startTime !== null && !HHMM_RE.test(startTime)) {
    return { ok: false, error: "시작 시간 형식이 올바르지 않습니다." };
  }
  if (endTime !== null && !HHMM_RE.test(endTime)) {
    return { ok: false, error: "종료 시간 형식이 올바르지 않습니다." };
  }
  if (startTime !== null && endTime !== null && endTime < startTime) {
    return { ok: false, error: "종료 시간은 시작 시간보다 늦어야 합니다." };
  }
  return { ok: true };
}

/**
 * access token 캐시 신선도(AC-12). 만료 60초 전 여유를 두고 판정 — 여유 안이면
 * 신선(true, 갱신 불필요), expiresAt 이 없으면 항상 false(갱신 필요).
 */
export function isAccessTokenFresh(
  expiresAt: Date | string | null,
  now: Date,
): boolean {
  if (expiresAt === null) return false;
  const expiresAtMs = new Date(expiresAt).getTime();
  return now.getTime() < expiresAtMs - 60_000;
}

/** 날짜 문자열(YYYY-MM-DD)의 다음 날짜. UTC 문자열 연산 — 월말/연말 캐리 처리. */
function nextDateStr(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** HH:MM + 1시간. 자정을 넘으면 dayOffset=1(다음 날로 이월). */
function addOneHour(time: string): { time: string; dayOffset: number } {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + 60;
  const dayOffset = total >= 24 * 60 ? 1 : 0;
  const wrapped = total % (24 * 60);
  const hh = String(Math.floor(wrapped / 60)).padStart(2, "0");
  const mm = String(wrapped % 60).padStart(2, "0");
  return { time: `${hh}:${mm}`, dayOffset };
}

export interface BuildGoogleEventPayloadInput {
  /** 메모 날짜(YYYY-MM-DD). */
  date: string;
  startTime: string | null;
  endTime: string | null;
  content: string;
}

/**
 * 구글 캘린더 이벤트 payload 생성. 종일(둘 다 null)이면 end-exclusive 익일 날짜,
 * 시간 지정이면 timeZone 'Asia/Seoul' + 오프셋 없는 로컬 dateTime 문자열(AC-1/AC-2).
 * 종료 시간 미입력 시 시작+1시간(23:xx 등 자정 경계는 종료 날짜가 익일로 이월).
 * summary = content 첫 줄(최대 80자, 단순 slice), description = content 전체.
 */
export function buildGoogleEventPayload(
  input: BuildGoogleEventPayloadInput,
): object {
  const { date, startTime, endTime, content } = input;
  const firstLine = content.split("\n", 1)[0];
  const summary = firstLine.slice(0, 80);
  const description = content;

  if (startTime === null) {
    return {
      summary,
      description,
      start: { date },
      end: { date: nextDateStr(date) },
    };
  }

  let endTimeStr = endTime;
  let endDate = date;
  if (endTimeStr === null) {
    const { time, dayOffset } = addOneHour(startTime);
    endTimeStr = time;
    endDate = dayOffset > 0 ? nextDateStr(date) : date;
  }

  return {
    summary,
    description,
    start: { dateTime: `${date}T${startTime}:00`, timeZone: "Asia/Seoul" },
    end: { dateTime: `${endDate}T${endTimeStr}:00`, timeZone: "Asia/Seoul" },
  };
}
