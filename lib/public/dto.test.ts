import { describe, it, expect } from "vitest";
import {
  summarizeAttendance,
  buildPublicPagePayload,
  parsePublicPagePayload,
  resolvePublicPageState,
  type RawPublicPageInput,
  type PublicPagePayload,
} from "./dto";

// 금지 토큰: 직렬화 결과 어디에도 나타나면 안 되는 민감/내부 값
const FORBIDDEN_MARKERS = [
  "생리통", // reason/note_field 자유텍스트
  "질병",
  "rawScore",
  "98", // 원점수
  "수행 줄글 내용",
  "studentYearId",
  "other-student",
  "secret-internal",
];

function assertNoForbidden(payload: unknown) {
  const json = JSON.stringify(payload);
  for (const marker of FORBIDDEN_MARKERS) {
    expect(json).not.toContain(marker);
  }
}

describe("summarizeAttendance", () => {
  it("성격별 횟수만 집계한다", () => {
    const s = summarizeAttendance([
      { kind: "late", reportRequired: false, reportSubmitted: false },
      { kind: "late", reportRequired: false, reportSubmitted: false },
      { kind: "early_leave", reportRequired: true, reportSubmitted: true },
      { kind: "absent", reportRequired: true, reportSubmitted: false },
      { kind: "absent_period", reportRequired: false, reportSubmitted: false },
    ]);
    expect(s).toEqual({
      late: 2,
      earlyLeave: 1,
      absentPeriod: 1,
      absent: 1,
      hasUnsubmittedReport: true,
    });
  });

  it("미제출 신고서가 없으면 플래그 false", () => {
    const s = summarizeAttendance([
      { kind: "absent", reportRequired: true, reportSubmitted: true },
      { kind: "late", reportRequired: false, reportSubmitted: false },
    ]);
    expect(s.hasUnsubmittedReport).toBe(false);
  });
});

describe("buildPublicPagePayload — 골든 페이로드", () => {
  // 금지 필드를 일부러 섞은 원자료(타입 외 키도 포함)
  const rawInput = {
    weekTodos: [{ title: "수행평가 안내", at: "2026-06-08T09:00:00Z", secretInternal: "x" }],
    commonNotice: "이번 주 잘 지냅시다",
    timetable: [{ weekday: 1, period: 3, subjectName: "물리학", room: "과학실2" }],
    meals: [{ date: "2026-06-08", menu: "비빔밥" }],
    attendance: [
      // reason/noteField 가 섞여 있어도 빌더는 읽지 않는다
      { kind: "early_leave", reportRequired: true, reportSubmitted: false, reason: "illness", noteField: "생리통" },
      { kind: "absent", reportRequired: true, reportSubmitted: true, reason: "질병" },
    ],
    gradesMock: true,
    grades: [
      { subjectName: "물리학", rank: 1, grade5: 1, achievement: "A", rawScore: 98, prose: "수행 줄글 내용" },
    ],
    personalMessage: "꾸준함이 돋보입니다",
  } as unknown as RawPublicPageInput;

  const payload = buildPublicPagePayload(rawInput);

  it("사유텍스트·원점수·수행줄글·내부키가 직렬화에 전혀 없다", () => {
    assertNoForbidden(payload);
  });

  it("출결은 횟수 집계 + 미제출 플래그만", () => {
    expect(payload.attendanceSummary).toEqual({
      late: 0,
      earlyLeave: 1,
      absentPeriod: 0,
      absent: 1,
      hasUnsubmittedReport: true,
    });
  });

  it("목업 성적은 '준비중'이고 어떤 값도 직렬화되지 않는다", () => {
    expect(payload.grades).toEqual({ status: "preparing" });
    expect(JSON.stringify(payload.grades)).not.toContain("물리학");
  });

  it("timetable 은 room 을 버리고 요일·교시·과목명만", () => {
    expect(payload.timetable).toEqual([
      { weekday: 1, period: 3, subjectName: "물리학" },
    ]);
  });

  it("weekTodos 는 title·at 만", () => {
    expect(payload.weekTodos).toEqual([
      { title: "수행평가 안내", at: "2026-06-08T09:00:00Z" },
    ]);
  });

  it("성적 ready 모드에서도 rank/grade5/achievement 만(raw 점수·prose 제외)", () => {
    const ready = buildPublicPagePayload({ ...rawInput, gradesMock: false });
    expect(ready.grades).toEqual({
      status: "ready",
      items: [{ subjectName: "물리학", rank: 1, grade5: 1, achievement: "A" }],
    });
    assertNoForbidden(ready);
  });
});

describe("parsePublicPagePayload — allowlist 외 키 미반영", () => {
  it("SQL jsonb 에 예기치 않은 키가 있어도 출력에 새지 않는다", () => {
    const raw = {
      weekTodos: [{ title: "할일", at: "2026-06-08T09:00:00Z", leak: "secret-internal" }],
      commonNotice: "공지",
      timetable: [{ weekday: 2, period: 1, subjectName: "수학", room: "secret-internal" }],
      meals: [{ date: "2026-06-08", menu: "김치찌개" }],
      attendanceSummary: {
        late: 1,
        earlyLeave: 0,
        absentPeriod: 0,
        absent: 0,
        hasUnsubmittedReport: false,
        reason: "생리통", // 절대 반영 금지
        noteField: "질병",
      },
      grades: { status: "preparing" },
      personalMessage: "메시지",
      studentYearId: "other-student", // 절대 반영 금지
      rawScore: 98,
    };
    const parsed = parsePublicPagePayload(raw);
    assertNoForbidden(parsed);
    // 허용 키 집합이 정확히 고정
    expect(Object.keys(parsed).sort()).toEqual(
      [
        "attendanceSummary",
        "commonNotice",
        "grades",
        "meals",
        "personalMessage",
        "timetable",
        "weekTodos",
      ].sort(),
    );
    expect(Object.keys(parsed.attendanceSummary).sort()).toEqual(
      ["absent", "absentPeriod", "earlyLeave", "hasUnsubmittedReport", "late"].sort(),
    );
  });

  it("빈/이상 입력도 안전한 기본 DTO", () => {
    const parsed: PublicPagePayload = parsePublicPagePayload(null);
    expect(parsed.weekTodos).toEqual([]);
    expect(parsed.attendanceSummary.late).toBe(0);
    expect(parsed.grades).toEqual({ status: "preparing" });
  });
});

describe("resolvePublicPageState", () => {
  const now = new Date("2026-06-05T00:00:00Z");
  it("없는 토큰 → not_found(404)", () => {
    expect(resolvePublicPageState(null, now)).toEqual({ status: "not_found" });
  });
  it("폐기 → revoked(410)", () => {
    expect(
      resolvePublicPageState({ revokedAt: "2026-06-01T00:00:00Z", expiresAt: null }, now),
    ).toEqual({ status: "revoked" });
  });
  it("만료 → expired(410)", () => {
    expect(
      resolvePublicPageState({ revokedAt: null, expiresAt: "2026-06-04T00:00:00Z" }, now),
    ).toEqual({ status: "expired" });
  });
  it("유효 → valid", () => {
    expect(
      resolvePublicPageState({ revokedAt: null, expiresAt: "2026-12-31T00:00:00Z" }, now),
    ).toEqual({ status: "valid" });
    expect(resolvePublicPageState({ revokedAt: null, expiresAt: null }, now)).toEqual({
      status: "valid",
    });
  });
});
