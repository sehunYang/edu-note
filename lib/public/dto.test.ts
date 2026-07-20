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

  it("timetable 은 room 을 버리고 요일·교시·과목명(+isFixed·electiveMapped 기본값)만", () => {
    expect(payload.timetable).toEqual([
      {
        weekday: 1,
        period: 3,
        subjectName: "물리학",
        isFixed: false,
        electiveMapped: null,
      },
    ]);
  });

  it("weekTodos 는 title·at·eventKind(누락 시 null) 만", () => {
    expect(payload.weekTodos).toEqual([
      { title: "수행평가 안내", at: "2026-06-08T09:00:00Z", eventKind: null },
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
        "attendance2D",
        "attendanceDetail",
        "attendanceSummary",
        "commonNotice",
        "counselSlots",
        "grades",
        "individualNotices",
        "meals",
        "notices",
        "personalMessage",
        "studentMemos",
        "studentName",
        "subjectAliasPairs",
        "timetable",
        "vacationSpans",
        "weekTodos",
        "weeklyActual",
        "weeklyActualSyncedAt",
      ].sort(),
    );
    expect(Object.keys(parsed.attendanceSummary).sort()).toEqual(
      ["absent", "absentPeriod", "earlyLeave", "hasUnsubmittedReport", "late"].sort(),
    );
  });

  it("weeklyActual(v13)은 weekday·period·subjectName 만 통과, 이상행 drop", () => {
    const parsed = parsePublicPagePayload({
      weeklyActual: [
        { weekday: 4, period: 5, subjectName: "진로활동", secret: "x" },
        { weekday: 4, period: 6, subjectName: "" }, // 빈 과목도 문자열이라 통과(빈 문자열)
        { period: 1, subjectName: "누락요일" }, // weekday 없음 → drop
        "nope", // 형식 불명 → drop
      ],
      weeklyActualSyncedAt: "2026-07-19T22:20:00.000Z",
    });
    expect(parsed.weeklyActual).toEqual([
      { weekday: 4, period: 5, subjectName: "진로활동" },
      { weekday: 4, period: 6, subjectName: "" },
    ]);
    expect(parsed.weeklyActualSyncedAt).toBe("2026-07-19T22:20:00.000Z");
  });

  it("weeklyActual 누락 시 빈 배열·null 기본값", () => {
    const parsed = parsePublicPagePayload({});
    expect(parsed.weeklyActual).toEqual([]);
    expect(parsed.weeklyActualSyncedAt).toBeNull();
  });

  it("새 필드(studentName·notices·attendance2D·counselSlots·slot 확장)도 allowlist 로 파싱", () => {
    const raw = {
      studentName: "홍길동",
      notices: ["한마디1", "한마디2", 42], // 비문자열은 버림
      timetable: [
        {
          weekday: 1,
          period: 3,
          subjectName: "물리학",
          isFixed: true,
          electiveMapped: null,
          room: "secret-internal", // 절대 반영 금지
        },
        {
          weekday: 2,
          period: 4,
          subjectName: "선택",
          isFixed: false,
          electiveMapped: "생활과학",
        },
      ],
      attendance2D: {
        late: { accepted: 1, illness: 2, unaccepted: 0, etc: 0, noteField: "생리통" },
        earlyLeave: { illness: 1 },
        absentPeriod: {},
        absent: { unaccepted: 3 },
      },
      individualNotices: ["개별공지1", 7, "개별공지2"], // 비문자열 버림
      meals: [
        {
          date: "2026-06-20",
          menu: "비빔밥",
          calInfo: "820 Kcal",
          ntrInfo: "탄수화물(g) : 100.0\n단백질(g) : 30.0",
          rawScore: 98, // 절대 반영 금지
        },
      ],
      counselSlots: [
        {
          date: "2026-06-20",
          remaining: 2,
          reserved: false,
          studentYearId: "other-student",
        },
        { date: "2026-06-21", remaining: 0, reserved: true, cancelRequested: true },
      ],
    };
    const parsed = parsePublicPagePayload(raw);
    assertNoForbidden(parsed);
    expect(parsed.studentName).toBe("홍길동");
    // v10~: notices 는 { id, body, postedAt, unread } 객체. 레거시 문자열 → id/postedAt null·unread false.
    expect(parsed.notices).toEqual([
      { id: null, body: "한마디1", postedAt: null, unread: false },
      { id: null, body: "한마디2", postedAt: null, unread: false },
    ]);
    expect(parsed.individualNotices).toEqual([
      { id: null, body: "개별공지1", postedAt: null, unread: false },
      { id: null, body: "개별공지2", postedAt: null, unread: false },
    ]);
    expect(parsed.meals[0]).toEqual({
      date: "2026-06-20",
      menu: "비빔밥",
      calInfo: "820 Kcal",
      ntrInfo: "탄수화물(g) : 100.0\n단백질(g) : 30.0",
    });
    expect(parsed.timetable[0]).toEqual({
      weekday: 1,
      period: 3,
      subjectName: "물리학",
      isFixed: true,
      electiveMapped: null,
    });
    expect(parsed.timetable[1]).toEqual({
      weekday: 2,
      period: 4,
      subjectName: "선택",
      isFixed: false,
      electiveMapped: "생활과학",
    });
    expect(parsed.attendance2D.late).toEqual({
      accepted: 1,
      illness: 2,
      unaccepted: 0,
      etc: 0,
    });
    expect(parsed.attendance2D.absent.unaccepted).toBe(3);
    expect(parsed.attendance2D.absentPeriod).toEqual({
      accepted: 0,
      illness: 0,
      unaccepted: 0,
      etc: 0,
    });
    expect(parsed.counselSlots).toEqual([
      { date: "2026-06-20", remaining: 2, reserved: false, cancelRequested: false },
      { date: "2026-06-21", remaining: 0, reserved: true, cancelRequested: true },
    ]);
  });

  it("weekTodos.eventKind(v9)은 EventKind 8종 + 'counsel' allowlist, 미지값은 null", () => {
    const parsed = parsePublicPagePayload({
      weekTodos: [
        { title: "미지값", at: "2026-06-08T09:00:00Z", eventKind: "hacker" },
        { title: "지필", at: "2026-06-09T09:00:00Z", eventKind: "exam" },
        { title: "상담", at: "2026-06-10T09:00:00Z", eventKind: "counsel" },
        { title: "누락", at: "2026-06-11T09:00:00Z" },
      ],
    });
    assertNoForbidden(parsed);
    expect(parsed.weekTodos).toEqual([
      { title: "미지값", at: "2026-06-08T09:00:00Z", eventKind: null },
      { title: "지필", at: "2026-06-09T09:00:00Z", eventKind: "exam" },
      { title: "상담", at: "2026-06-10T09:00:00Z", eventKind: "counsel" },
      { title: "누락", at: "2026-06-11T09:00:00Z", eventKind: null },
    ]);
  });

  it("vacationSpans(v9)은 start/end 문자열 쌍만 통과, 이상값은 drop", () => {
    const parsed = parsePublicPagePayload({
      vacationSpans: [
        { start: "2026-07-25", end: "2026-08-17" },
        { start: "2026-12-24", end: 42 }, // end 비문자열 → drop
        { start: null, end: "2026-01-01" }, // start 비문자열 → drop
        {}, // 둘 다 누락 → drop
      ],
    });
    assertNoForbidden(parsed);
    expect(parsed.vacationSpans).toEqual([
      { start: "2026-07-25", end: "2026-08-17" },
    ]);
  });

  it("buildPublicPagePayload 도 weekTodos.eventKind·vacationSpans 를 동일 계약으로 반영", () => {
    const built = buildPublicPagePayload({
      weekTodos: [
        { title: "지필", at: "2026-06-09T09:00:00Z", eventKind: "exam" },
        { title: "미지값", at: "2026-06-08T09:00:00Z", eventKind: "hacker" },
        { title: "누락", at: "2026-06-11T09:00:00Z" },
      ],
      commonNotice: null,
      timetable: [],
      meals: [],
      attendance: [],
      gradesMock: true,
      grades: [],
      personalMessage: null,
      vacationSpans: [
        { start: "2026-07-25", end: "2026-08-17" },
        { start: "2026-12-24", end: 42 as unknown as string },
      ],
    });
    expect(built.weekTodos).toEqual([
      { title: "지필", at: "2026-06-09T09:00:00Z", eventKind: "exam" },
      { title: "미지값", at: "2026-06-08T09:00:00Z", eventKind: null },
      { title: "누락", at: "2026-06-11T09:00:00Z", eventKind: null },
    ]);
    expect(built.vacationSpans).toEqual([
      { start: "2026-07-25", end: "2026-08-17" },
    ]);
  });

  it("notices(v12)는 {id,body,postedAt,unread} 객체·레거시 문자열 모두 파싱, body 없으면 drop", () => {
    const parsed = parsePublicPagePayload({
      notices: [
        { id: "n1", body: "미읽음공지", postedAt: "2026-07-10T00:00:00Z", unread: true },
        { id: "n2", body: "읽은공지", postedAt: "2026-07-09T00:00:00Z", unread: false },
        "레거시문자열", // v9 이하 호환 → id/postedAt null, unread false
        { postedAt: "2026-07-10T00:00:00Z" }, // body 누락 → drop
        { body: "숫자postedAt", postedAt: 42, unread: "yes" }, // postedAt 비문자열→null, unread 비true→false
        7, // 문자열/객체 아님 → drop
      ],
      individualNotices: [
        { id: "i1", body: "개별", postedAt: "2026-07-11T00:00:00Z", unread: true },
      ],
    });
    assertNoForbidden(parsed);
    expect(parsed.notices).toEqual([
      { id: "n1", body: "미읽음공지", postedAt: "2026-07-10T00:00:00Z", unread: true },
      { id: "n2", body: "읽은공지", postedAt: "2026-07-09T00:00:00Z", unread: false },
      { id: null, body: "레거시문자열", postedAt: null, unread: false },
      { id: null, body: "숫자postedAt", postedAt: null, unread: false },
    ]);
    expect(parsed.individualNotices).toEqual([
      { id: "i1", body: "개별", postedAt: "2026-07-11T00:00:00Z", unread: true },
    ]);
  });

  it("attendanceDetail(v8)은 날짜·kind/reason enum·periods 만 통과, noteField 절대 미반영", () => {
    const parsed = parsePublicPagePayload({
      attendanceDetail: [
        {
          date: "2026-05-12",
          kind: "late",
          reason: "illness",
          periods: [1, 3, "x"], // 숫자 외 항목은 버림
          noteField: "생리통", // 절대 반영 금지
        },
        { date: "2026-05-20", kind: "absent", reason: "accepted" }, // periods 없음 → null
        { date: "2026-05-21", kind: "hacked", reason: "accepted" }, // kind allowlist 외 → 행 전체 버림
        { date: "2026-05-22", kind: "late", reason: "자유텍스트사유" }, // reason allowlist 외 → 버림
        { kind: "late", reason: "etc" }, // date 누락 → 버림
      ],
    });
    assertNoForbidden(parsed);
    expect(parsed.attendanceDetail).toEqual([
      { date: "2026-05-12", kind: "late", reason: "illness", periods: [1, 3] },
      { date: "2026-05-20", kind: "absent", reason: "accepted", periods: null },
    ]);
    expect(Object.keys(parsed.attendanceDetail[0]).sort()).toEqual(
      ["date", "kind", "periods", "reason"].sort(),
    );
  });

  it("buildPublicPagePayload 도 attendanceDetail 에 enum allowlist 를 강제한다", () => {
    const built = buildPublicPagePayload({
      weekTodos: [],
      commonNotice: null,
      timetable: [],
      meals: [],
      attendance: [],
      attendanceDetail: [
        { date: "2026-05-12", kind: "early_leave", reason: "etc", periods: [5] },
        { date: "2026-05-13", kind: "unknown", reason: "etc" }, // 버림
      ],
      gradesMock: true,
      grades: [],
      personalMessage: null,
    });
    expect(built.attendanceDetail).toEqual([
      { date: "2026-05-12", kind: "early_leave", reason: "etc", periods: [5] },
    ]);
  });

  it("slot 의 isFixed/electiveMapped 누락 시 기본값(false/null)", () => {
    const parsed = parsePublicPagePayload({
      timetable: [{ weekday: 3, period: 1, subjectName: "수학" }],
    });
    expect(parsed.timetable[0]).toEqual({
      weekday: 3,
      period: 1,
      subjectName: "수학",
      isFixed: false,
      electiveMapped: null,
    });
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
