import { describe, it, expect } from "vitest";
import {
  deriveGoogleEventId,
  validateMemoTime,
  isAccessTokenFresh,
  buildGoogleEventPayload,
  mapGoogleEventToDisplay,
  filterExternalGoogleEvents,
} from "./google-event";

/**
 * 구글 캘린더 동기화 도메인 단위 테스트(계획 2단계). 결정론 파생 id, 시간 검증,
 * payload 생성(종일/시간·경계 이월), access token 신선도 경계를 커버한다.
 */
describe("deriveGoogleEventId", () => {
  it("하이픈 제거 · 32자 hex", () => {
    const id = deriveGoogleEventId("550e8400-e29b-41d4-a716-446655440000");
    expect(id).toBe("550e8400e29b41d4a716446655440000");
    expect(id).toHaveLength(32);
    expect(id).toMatch(/^[0-9a-v]+$/);
  });

  it("결정론 — 같은 입력은 항상 같은 출력", () => {
    const memoId = "abc12345-6789-4abc-8def-0123456789ab";
    expect(deriveGoogleEventId(memoId)).toBe(deriveGoogleEventId(memoId));
  });

  it("대문자 UUID 입력도 소문자로 정규화", () => {
    const lower = deriveGoogleEventId("550e8400-e29b-41d4-a716-446655440000");
    const upper = deriveGoogleEventId("550E8400-E29B-41D4-A716-446655440000");
    expect(upper).toBe(lower);
    expect(upper).toBe(upper.toLowerCase());
  });
});

describe("validateMemoTime", () => {
  it("둘 다 null → ok(종일)", () => {
    expect(validateMemoTime(null, null)).toEqual({ ok: true });
  });

  it("둘 다 있음, 정상 범위 → ok", () => {
    expect(validateMemoTime("09:00", "10:00")).toEqual({ ok: true });
  });

  it("start만 있음 → ok", () => {
    expect(validateMemoTime("14:00", null)).toEqual({ ok: true });
  });

  it("같은 값(start === end) → ok(허용)", () => {
    expect(validateMemoTime("09:00", "09:00")).toEqual({ ok: true });
  });

  it("형식 오류 — HH:MM 아님", () => {
    expect(validateMemoTime("9:00", null).ok).toBe(false);
    expect(validateMemoTime("25:00", null).ok).toBe(false);
    expect(validateMemoTime("09:60", null).ok).toBe(false);
    expect(validateMemoTime("09:00", "abc").ok).toBe(false);
  });

  it("종료 < 시작 → 오류", () => {
    const r = validateMemoTime("10:00", "09:00");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("종료");
  });

  it("시작 없이 종료만 → 오류", () => {
    const r = validateMemoTime(null, "10:00");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("시작");
  });
});

describe("isAccessTokenFresh (AC-12, 만료 60초 여유)", () => {
  it("expiresAt null → false", () => {
    expect(isAccessTokenFresh(null, new Date("2026-07-05T00:00:00Z"))).toBe(
      false,
    );
  });

  it("여유(60초) 안 → true", () => {
    const expiresAt = "2026-07-05T00:10:00Z";
    const now = new Date("2026-07-05T00:08:59Z"); // 61초 전
    expect(isAccessTokenFresh(expiresAt, now)).toBe(true);
  });

  it("경계 정확히 60초 전 → false(신선하지 않음, 갱신)", () => {
    const expiresAt = "2026-07-05T00:10:00Z";
    const now = new Date("2026-07-05T00:09:00Z"); // 정확히 60초 전
    expect(isAccessTokenFresh(expiresAt, now)).toBe(false);
  });

  it("이미 만료 → false", () => {
    const expiresAt = "2026-07-05T00:10:00Z";
    const now = new Date("2026-07-05T00:10:01Z");
    expect(isAccessTokenFresh(expiresAt, now)).toBe(false);
  });
});

describe("buildGoogleEventPayload — 종일(둘 다 null)", () => {
  it("익일 exclusive 날짜(일반)", () => {
    const p = buildGoogleEventPayload({
      date: "2026-07-05",
      startTime: null,
      endTime: null,
      content: "회의",
    });
    expect(p).toEqual({
      summary: "회의",
      description: "회의",
      start: { date: "2026-07-05" },
      end: { date: "2026-07-06" },
    });
  });

  it("월말 캐리 — 12/31 → 1/1", () => {
    const p: any = buildGoogleEventPayload({
      date: "2026-12-31",
      startTime: null,
      endTime: null,
      content: "연말 정리",
    });
    expect(p.start).toEqual({ date: "2026-12-31" });
    expect(p.end).toEqual({ date: "2027-01-01" });
  });

  it("월 경계 캐리 — 2/28(평년) → 3/1", () => {
    const p: any = buildGoogleEventPayload({
      date: "2026-02-28",
      startTime: null,
      endTime: null,
      content: "월말",
    });
    expect(p.end).toEqual({ date: "2026-03-01" });
  });
});

describe("buildGoogleEventPayload — 시간 지정", () => {
  it("종료 미입력 → 시작+1시간 기본, timeZone Asia/Seoul", () => {
    const p: any = buildGoogleEventPayload({
      date: "2026-07-05",
      startTime: "14:00",
      endTime: null,
      content: "수업",
    });
    expect(p.start).toEqual({
      dateTime: "2026-07-05T14:00:00",
      timeZone: "Asia/Seoul",
    });
    expect(p.end).toEqual({
      dateTime: "2026-07-05T15:00:00",
      timeZone: "Asia/Seoul",
    });
  });

  it("종료 지정 → 그대로 사용", () => {
    const p: any = buildGoogleEventPayload({
      date: "2026-07-05",
      startTime: "09:00",
      endTime: "09:30",
      content: "짧은 상담",
    });
    expect(p.end).toEqual({
      dateTime: "2026-07-05T09:30:00",
      timeZone: "Asia/Seoul",
    });
  });

  it("23:30 시작 + 기본 1시간 → 종료가 익일 00:30로 이월", () => {
    const p: any = buildGoogleEventPayload({
      date: "2026-07-05",
      startTime: "23:30",
      endTime: null,
      content: "야간 업무",
    });
    expect(p.start).toEqual({
      dateTime: "2026-07-05T23:30:00",
      timeZone: "Asia/Seoul",
    });
    expect(p.end).toEqual({
      dateTime: "2026-07-06T00:30:00",
      timeZone: "Asia/Seoul",
    });
  });

  it("자정 정각(23:00 시작) 이월 경계 — 24:00은 없으므로 00:00 이월", () => {
    const p: any = buildGoogleEventPayload({
      date: "2026-12-31",
      startTime: "23:00",
      endTime: null,
      content: "연말 야간",
    });
    expect(p.end).toEqual({
      dateTime: "2027-01-01T00:00:00",
      timeZone: "Asia/Seoul",
    });
  });
});

describe("buildGoogleEventPayload — summary 절단", () => {
  it("content 첫 줄이 80자 초과하면 80자로 slice", () => {
    const longLine = "가".repeat(100);
    const p: any = buildGoogleEventPayload({
      date: "2026-07-05",
      startTime: null,
      endTime: null,
      content: `${longLine}\n둘째 줄`,
    });
    expect(p.summary).toBe(longLine.slice(0, 80));
    expect(p.summary).toHaveLength(80);
    expect(p.description).toBe(`${longLine}\n둘째 줄`);
  });

  it("짧은 content는 그대로, 첫 줄만 summary", () => {
    const p: any = buildGoogleEventPayload({
      date: "2026-07-05",
      startTime: null,
      endTime: null,
      content: "짧은 제목\n본문 내용",
    });
    expect(p.summary).toBe("짧은 제목");
    expect(p.description).toBe("짧은 제목\n본문 내용");
  });
});

describe("mapGoogleEventToDisplay", () => {
  it("종일 이벤트 — start.date만 있으면 startTime/endTime null", () => {
    const item = mapGoogleEventToDisplay({
      id: "abc123",
      summary: "체육대회",
      start: { date: "2026-09-10" },
      end: { date: "2026-09-11" },
    });
    expect(item).toEqual({
      date: "2026-09-10",
      title: "체육대회",
      startTime: null,
      endTime: null,
    });
  });

  it("시간 이벤트 — dateTime에서 날짜·HH:MM 분리 추출", () => {
    const item = mapGoogleEventToDisplay({
      id: "def456",
      summary: "학부모 상담",
      start: { dateTime: "2026-09-10T14:00:00+09:00" },
      end: { dateTime: "2026-09-10T15:00:00+09:00" },
    });
    expect(item).toEqual({
      date: "2026-09-10",
      title: "학부모 상담",
      startTime: "14:00",
      endTime: "15:00",
    });
  });

  it("summary 없으면 '(제목 없음)'", () => {
    const item = mapGoogleEventToDisplay({
      id: "ghi789",
      start: { date: "2026-09-10" },
    });
    expect(item?.title).toBe("(제목 없음)");
  });

  it("start 정보가 전혀 없으면 null(표시 안 함)", () => {
    expect(mapGoogleEventToDisplay({ id: "x" })).toBeNull();
  });

  it("종료 시간 없이 시작만 있어도 처리(endTime null)", () => {
    const item = mapGoogleEventToDisplay({
      id: "jkl012",
      summary: "메모",
      start: { dateTime: "2026-09-10T09:00:00+09:00" },
    });
    expect(item?.startTime).toBe("09:00");
    expect(item?.endTime).toBeNull();
  });
});

describe("filterExternalGoogleEvents", () => {
  it("우리가 push한 이벤트(파생 id 일치)는 제외한다", () => {
    const memoId = "550e8400-e29b-41d4-a716-446655440000";
    const ownEventId = deriveGoogleEventId(memoId); // 550e8400e29b41d4a716446655440000
    const events = [
      { id: ownEventId, summary: "우리 메모" },
      { id: "external-1", summary: "구글에서 직접 만든 일정" },
    ];
    const result = filterExternalGoogleEvents(events, [memoId]);
    expect(result).toEqual([{ id: "external-1", summary: "구글에서 직접 만든 일정" }]);
  });

  it("로컬 메모가 없으면 전부 외부 이벤트로 통과", () => {
    const events = [{ id: "a" }, { id: "b" }];
    expect(filterExternalGoogleEvents(events, [])).toEqual(events);
  });

  it("여러 로컬 메모의 파생 id를 모두 제외한다", () => {
    const id1 = "550e8400-e29b-41d4-a716-446655440000";
    const id2 = "660e8400-e29b-41d4-a716-446655440001";
    const events = [
      { id: deriveGoogleEventId(id1) },
      { id: deriveGoogleEventId(id2) },
      { id: "external" },
    ];
    expect(filterExternalGoogleEvents(events, [id1, id2])).toEqual([
      { id: "external" },
    ]);
  });
});
