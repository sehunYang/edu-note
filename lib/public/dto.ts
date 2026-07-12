/**
 * 공개 학생 페이지 allowlist DTO + 순수 집계/파서 (계획 §3.2, AC-I).
 *
 * 보안 핵심: 공개 응답에는 **사전집계된 허용 필드만** 담는다.
 * 절대 금지: 출결 `reason`/`note_field` 자유텍스트, 성적 원점수(raw)·수행 줄글,
 * 타 학생 데이터, 내부 ID. 이 모듈의 함수들은 모두 명시적 필드 선택(스프레드 금지)으로
 * 구성되어, 미래에 입력에 키가 추가돼도 출력에 새지 않는다.
 */
import type { AttendanceKind } from "@/lib/domain/types";
import type { EventKind } from "@/lib/domain/calendar-keywords";

// ── 공통칸 ──
/**
 * eventKind: calendar_events.event_kind(EventKind) 또는 상담예약 고정 리터럴 'counsel'.
 * 미지값/누락 시 null(구버전 호환 — 색상 없는 기본 칩으로 렌더).
 */
export interface PublicWeekTodo {
  title: string;
  at: string; // ISO 일시
  eventKind: EventKind | "counsel" | null;
}

/** 방학 구간(v9) — academic_vacations(0050) 기반. 학생페이지 캘린더 배경 밴드용. */
export interface PublicVacationSpan {
  start: string; // YYYY-MM-DD (포함)
  end: string; // YYYY-MM-DD (포함)
}
export interface PublicTimetableSlot {
  weekday: number; // 1=월 .. 7=일
  period: number;
  subjectName: string;
  isFixed: boolean; // 고정반(원반) 여부. false 면 선택과목 칸(자가매핑 대상).
  electiveMapped: string | null; // 학생이 자가매핑한 선택과목(없으면 null).
}
export interface PublicMeal {
  date: string; // YYYY-MM-DD
  menu: string;
  calInfo: string | null; // 칼로리(CAL_INFO) — 표로 분리 표시. v4.
  ntrInfo: string | null; // 영양정보(NTR_INFO) — 표로 분리 표시. v4.
}
/**
 * 교사 한마디/개별 공지 한 건(v10~). body(본문) + postedAt(게시 ISO 일시) + unread(미읽음).
 * postedAt = teacher_notes.updated_at(v11~) — 내용 수정 시 갱신되어 게시일이 수정일로 표시.
 * unread(v12~) = 이 학생이 현재 게시본을 아직 안 읽음 → New 배지. 학생이 열람하면
 * markNoticeRead 로 읽음 처리되고, 교사가 다시 수정하면 자동으로 unread=true 로 복귀.
 * id 는 읽음 처리 호출용 식별자(teacher_notes.id). 레거시/누락 시 id=null·unread=false·
 * postedAt=null 로 안전 파싱(구버전 호환 — New/읽음처리 비활성).
 */
export interface PublicNotice {
  id: string | null; // teacher_notes.id — 읽음 처리용. 레거시/누락 시 null.
  body: string;
  postedAt: string | null; // ISO 일시(teacher_notes.updated_at). 레거시/누락 시 null.
  unread: boolean; // 이 학생 미읽음(New 배지). 레거시/누락 시 false.
}
/** 빌더/파서 입력의 공지 객체 형태(모든 필드 선택 — 파서가 기본값 보강). */
type NoticeInput = {
  id?: string | null;
  body: string;
  postedAt?: string | null;
  unread?: boolean;
};

// ── 개별칸 ──
/** 성격별 횟수 집계 + 미제출 신고서 유무. 원자료 행 절대 미포함. */
export interface PublicAttendanceSummary {
  late: number; // 지각
  earlyLeave: number; // 조퇴
  absentPeriod: number; // 결과
  absent: number; // 결석
  hasUnsubmittedReport: boolean; // 미제출 신고서 유무(플래그)
}

export interface PublicGradeItem {
  subjectName: string;
  rank: number | null; // 석차 (평가방식 따라)
  grade5: number | null; // 5등급
  achievement: string | null; // 성취도 A~E
}
/** Phase 1 grades 는 목업 → 'preparing'(준비중)으로 비활성, 어떤 값도 직렬화 안 됨. */
export type PublicGradeStatus =
  | { status: "preparing" }
  | { status: "ready"; items: PublicGradeItem[] };

/**
 * 출결 2D 매트릭스: 성격(kind) × 사유(reason) 의 **횟수 집계**(승인된 노출 — 사유 카테고리
 * 카운트). reason 자유텍스트(note_field)는 절대 포함하지 않는다. 카운트 숫자만.
 */
export interface PublicAttendanceReasonCounts {
  accepted: number; // 인정
  illness: number; // 질병
  unaccepted: number; // 미인정
  etc: number; // 기타
}
export interface PublicAttendance2D {
  late: PublicAttendanceReasonCounts; // 지각
  earlyLeave: PublicAttendanceReasonCounts; // 조퇴
  absentPeriod: PublicAttendanceReasonCounts; // 결과
  absent: PublicAttendanceReasonCounts; // 결석
}

/**
 * 출결 상세 한 건(v8). 학생 본인이 2D 표의 0 아닌 칸을 눌러 "언제 어떤 사유(카테고리)로"
 * 처리됐는지 확인하는 용도. reason 은 2D 매트릭스와 동일한 **카테고리 enum**만 —
 * note_field 자유텍스트는 이 타입에 존재하지 않으며 절대 노출하지 않는다.
 */
export interface PublicAttendanceRecord {
  date: string; // YYYY-MM-DD
  kind: "late" | "early_leave" | "absent_period" | "absent";
  reason: "accepted" | "illness" | "unaccepted" | "etc";
  periods: number[] | null; // 해당 교시(지각/조퇴 기점·결과 다중). 결석 등은 null.
}

/** 학생 개인 메모/일정(QC v6 ⑤). 본인 토큰 스코프 — 모달 CRUD용. id 는 본인 메모 식별자. */
export interface PublicStudentMemo {
  id: string;
  date: string; // YYYY-MM-DD
  body: string;
}

/** 상담 신청 가능 슬롯(잔여>0 또는 본인 예약분). 학생이 신청/확인하는 최소 정보만. */
export interface PublicCounselSlot {
  date: string; // YYYY-MM-DD
  remaining: number; // 잔여 정원
  reserved: boolean; // 이 학생 본인의 예약 여부
  cancelRequested: boolean; // 본인 예약의 취소 요청 상태(교사 승인 대기). v4.
}

export interface PublicPagePayload {
  // 머리말
  studentName: string | null; // 학생 본인 이름(본인 페이지 — 노출 OK)
  // 공통칸
  weekTodos: PublicWeekTodo[];
  commonNotice: string | null; // 교사 한마디(단일, 하위호환 — body 문자열)
  notices: PublicNotice[]; // 다중 교사 한마디(전체 공개 — 스와이프). v10~: {body,postedAt}
  individualNotices: PublicNotice[]; // 이 학생 대상 개별 공지(전체 공지와 병렬). v4 AC-5.3, v10~ postedAt
  timetable: PublicTimetableSlot[];
  meals: PublicMeal[];
  // 개별칸
  attendanceSummary: PublicAttendanceSummary; // 1D(하위호환)
  attendance2D: PublicAttendance2D; // 성격×사유 매트릭스
  attendanceDetail: PublicAttendanceRecord[]; // 기록별 날짜·성격·사유카테고리·교시(v8)
  counselSlots: PublicCounselSlot[]; // 상담 신청
  studentMemos: PublicStudentMemo[]; // 학생 개인 메모/일정(본인 토큰 스코프). QC v6 ⑤.
  grades: PublicGradeStatus;
  personalMessage: string | null; // 교사 개별 메시지
  vacationSpans: PublicVacationSpan[]; // 방학 구간(v9) — 배경 밴드용
}

/** 페이지 상태 — 라우트가 404/410 으로 매핑. */
export type PublicPageState =
  | { status: "ok"; payload: PublicPagePayload }
  | { status: "not_found" } // → 404
  | { status: "revoked" } // → 410
  | { status: "expired" }; // → 410

// ──────────────────────────────────────────────────────────────
// 순수 집계
// ──────────────────────────────────────────────────────────────

/** 출결 원자료 한 행(서버 내부용). 공개 응답에는 절대 그대로 나가지 않는다. */
export interface AttendanceRowForSummary {
  kind: AttendanceKind;
  reportRequired: boolean;
  reportSubmitted: boolean;
  // reason / noteField 등은 의도적으로 받지 않는다(집계에 불필요).
}

/** 출결 원자료 → 성격별 횟수 + 미제출 신고서 유무. */
export function summarizeAttendance(
  rows: AttendanceRowForSummary[],
): PublicAttendanceSummary {
  const summary: PublicAttendanceSummary = {
    late: 0,
    earlyLeave: 0,
    absentPeriod: 0,
    absent: 0,
    hasUnsubmittedReport: false,
  };
  for (const r of rows) {
    switch (r.kind) {
      case "late":
        summary.late += 1;
        break;
      case "early_leave":
        summary.earlyLeave += 1;
        break;
      case "absent_period":
        summary.absentPeriod += 1;
        break;
      case "absent":
        summary.absent += 1;
        break;
    }
    if (r.reportRequired && !r.reportSubmitted) {
      summary.hasUnsubmittedReport = true;
    }
  }
  return summary;
}

// ──────────────────────────────────────────────────────────────
// 원자료 → DTO 빌더 (서버 집계 경로의 참조 구현)
// ──────────────────────────────────────────────────────────────

/**
 * 원자료(금지 필드가 섞여 있을 수 있음)에서 명시적으로 허용 필드만 골라 DTO 구성.
 * 출결은 횟수로 집계되고 reason/note_field 는 읽지 않는다. grades 가 목업이면 '준비중'.
 */
export interface RawPublicPageInput {
  studentName?: string | null;
  // common (room 등 추가 필드가 와도 무시)
  weekTodos: { title: string; at: string; eventKind?: string | null }[];
  commonNotice: string | null;
  // v10~: 문자열(레거시) 또는 { id, body, postedAt, unread } 객체 모두 수용(파서가 정규화).
  notices?: (string | NoticeInput)[];
  individualNotices?: (string | NoticeInput)[];
  timetable: {
    weekday: number;
    period: number;
    subjectName: string;
    isFixed?: boolean;
    electiveMapped?: string | null;
  }[];
  meals: { date: string; menu: string; calInfo?: string | null; ntrInfo?: string | null }[];
  // 출결 원자료 (집계 전용)
  attendance: AttendanceRowForSummary[];
  attendance2D?: PublicAttendance2D;
  attendanceDetail?: {
    date: string;
    kind: string;
    reason: string;
    periods?: number[] | null;
  }[];
  counselSlots?: {
    date: string;
    remaining: number;
    reserved: boolean;
    cancelRequested?: boolean;
  }[];
  studentMemos?: { id: string; date: string; body: string }[];
  // 성적
  gradesMock: boolean;
  grades: { subjectName: string; rank: number | null; grade5: number | null; achievement: string | null }[];
  personalMessage: string | null;
  vacationSpans?: { start: string; end: string }[];
}

function emptyReasonCounts(): PublicAttendanceReasonCounts {
  return { accepted: 0, illness: 0, unaccepted: 0, etc: 0 };
}
function emptyAttendance2D(): PublicAttendance2D {
  return {
    late: emptyReasonCounts(),
    earlyLeave: emptyReasonCounts(),
    absentPeriod: emptyReasonCounts(),
    absent: emptyReasonCounts(),
  };
}

export function buildPublicPagePayload(
  input: RawPublicPageInput,
): PublicPagePayload {
  return {
    studentName: input.studentName ?? null,
    weekTodos: input.weekTodos.map((t) => ({
      title: t.title,
      at: t.at,
      eventKind: parseEventKind(t.eventKind),
    })),
    commonNotice: input.commonNotice,
    notices: parseNoticeArray(input.notices),
    individualNotices: parseNoticeArray(input.individualNotices),
    timetable: input.timetable.map((s) => ({
      weekday: s.weekday,
      period: s.period,
      subjectName: s.subjectName,
      isFixed: s.isFixed ?? false,
      electiveMapped: s.electiveMapped ?? null,
    })),
    meals: input.meals.map((m) => ({
      date: m.date,
      menu: m.menu,
      calInfo: m.calInfo ?? null,
      ntrInfo: m.ntrInfo ?? null,
    })),
    attendanceSummary: summarizeAttendance(input.attendance),
    attendance2D: input.attendance2D ?? emptyAttendance2D(),
    // 기록별 상세도 strict 파서를 재사용해 kind/reason 을 enum allowlist 로 강제.
    attendanceDetail: (input.attendanceDetail ?? [])
      .map(parseAttendanceRecord)
      .filter((x): x is PublicAttendanceRecord => x !== null),
    counselSlots: (input.counselSlots ?? []).map((c) => ({
      date: c.date,
      remaining: c.remaining,
      reserved: c.reserved,
      cancelRequested: c.cancelRequested ?? false,
    })),
    studentMemos: (input.studentMemos ?? []).map((m) => ({
      id: m.id,
      date: m.date,
      body: m.body,
    })),
    grades: input.gradesMock
      ? { status: "preparing" }
      : {
          status: "ready",
          items: input.grades.map((g) => ({
            subjectName: g.subjectName,
            rank: g.rank,
            grade5: g.grade5,
            achievement: g.achievement,
          })),
        },
    personalMessage: input.personalMessage,
    vacationSpans: (input.vacationSpans ?? [])
      .map(parseVacationSpan)
      .filter((x): x is PublicVacationSpan => x !== null),
  };
}

// ──────────────────────────────────────────────────────────────
// strict allowlist 파서 (심층방어)
// ──────────────────────────────────────────────────────────────

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/**
 * 공지 한 건 파서(v10~). 문자열(레거시 v9 이하) → { id:null, body, postedAt:null, unread:false },
 * 객체 → { id, body, postedAt, unread }(명시 필드만). body 가 없으면 항목 drop.
 */
function parseNotice(v: unknown): PublicNotice | null {
  if (typeof v === "string")
    return { id: null, body: v, postedAt: null, unread: false };
  const o = rec(v);
  const body = asString(o.body);
  if (body === null) return null;
  return {
    id: asString(o.id),
    body,
    postedAt: asString(o.postedAt),
    unread: o.unread === true,
  };
}
function parseNoticeArray(v: unknown): PublicNotice[] {
  return asArray(v)
    .map(parseNotice)
    .filter((x): x is PublicNotice => x !== null);
}

const EVENT_KIND_VALUES = [
  "exam",
  "mock_exam",
  "vacation",
  "holiday",
  "club",
  "self_activity",
  "career_activity",
  "etc",
  "counsel",
] as const;
/** weekTodos.eventKind allowlist 파서(v9). 8개 EventKind + 'counsel' 외 값/누락 → null. */
function parseEventKind(v: unknown): EventKind | "counsel" | null {
  return EVENT_KIND_VALUES.find((k) => k === v) ?? null;
}
function parseTodo(v: unknown): PublicWeekTodo | null {
  const o = rec(v);
  const title = asString(o.title);
  const at = asString(o.at);
  if (title === null || at === null) return null;
  return { title, at, eventKind: parseEventKind(o.eventKind) };
}
/** 방학 구간 파서(v9). start/end 가 문자열이 아니면 항목 drop. */
function parseVacationSpan(v: unknown): PublicVacationSpan | null {
  const o = rec(v);
  const start = asString(o.start);
  const end = asString(o.end);
  if (start === null || end === null) return null;
  return { start, end };
}
function parseSlot(v: unknown): PublicTimetableSlot | null {
  const o = rec(v);
  const weekday = asNumber(o.weekday);
  const period = asNumber(o.period);
  const subjectName = asString(o.subjectName);
  if (weekday === null || period === null || subjectName === null) return null;
  return {
    weekday,
    period,
    subjectName,
    isFixed: o.isFixed === true,
    electiveMapped: asString(o.electiveMapped),
  };
}
function parseMeal(v: unknown): PublicMeal | null {
  const o = rec(v);
  const date = asString(o.date);
  const menu = asString(o.menu);
  if (date === null || menu === null) return null;
  return {
    date,
    menu,
    calInfo: asString(o.calInfo),
    ntrInfo: asString(o.ntrInfo),
  };
}
function parseGradeItem(v: unknown): PublicGradeItem | null {
  const o = rec(v);
  const subjectName = asString(o.subjectName);
  if (subjectName === null) return null;
  // rank/grade5/achievement 외(raw 점수·prose 등)는 절대 읽지 않는다.
  return {
    subjectName,
    rank: asNumber(o.rank),
    grade5: asNumber(o.grade5),
    achievement: asString(o.achievement),
  };
}
function parseAttendance(v: unknown): PublicAttendanceSummary {
  const o = rec(v);
  return {
    late: asNumber(o.late) ?? 0,
    earlyLeave: asNumber(o.earlyLeave) ?? 0,
    absentPeriod: asNumber(o.absentPeriod) ?? 0,
    absent: asNumber(o.absent) ?? 0,
    hasUnsubmittedReport: o.hasUnsubmittedReport === true,
  };
}
function parseGrades(v: unknown): PublicGradeStatus {
  const o = rec(v);
  if (o.status === "ready") {
    return { status: "ready", items: asArray(o.items).map(parseGradeItem).filter((x): x is PublicGradeItem => x !== null) };
  }
  return { status: "preparing" };
}
function parseReasonCounts(v: unknown): PublicAttendanceReasonCounts {
  const o = rec(v);
  return {
    accepted: asNumber(o.accepted) ?? 0,
    illness: asNumber(o.illness) ?? 0,
    unaccepted: asNumber(o.unaccepted) ?? 0,
    etc: asNumber(o.etc) ?? 0,
  };
}
function parseAttendance2D(v: unknown): PublicAttendance2D {
  const o = rec(v);
  return {
    late: parseReasonCounts(o.late),
    earlyLeave: parseReasonCounts(o.earlyLeave),
    absentPeriod: parseReasonCounts(o.absentPeriod),
    absent: parseReasonCounts(o.absent),
  };
}
const ATTENDANCE_DETAIL_KINDS = [
  "late",
  "early_leave",
  "absent_period",
  "absent",
] as const;
const ATTENDANCE_DETAIL_REASONS = [
  "accepted",
  "illness",
  "unaccepted",
  "etc",
] as const;
/**
 * 출결 상세 한 건 파서(v8). date + kind/reason **enum allowlist** + periods(숫자만).
 * noteField 등 다른 키는 어떤 이름이 와도 절대 읽지 않는다.
 */
function parseAttendanceRecord(v: unknown): PublicAttendanceRecord | null {
  const o = rec(v);
  const date = asString(o.date);
  const kind = ATTENDANCE_DETAIL_KINDS.find((k) => k === o.kind);
  const reason = ATTENDANCE_DETAIL_REASONS.find((r) => r === o.reason);
  if (date === null || kind === undefined || reason === undefined) return null;
  const periods = Array.isArray(o.periods)
    ? o.periods.filter(
        (p): p is number => typeof p === "number" && Number.isFinite(p),
      )
    : null;
  return { date, kind, reason, periods };
}

function parseCounselSlot(v: unknown): PublicCounselSlot | null {
  const o = rec(v);
  const date = asString(o.date);
  if (date === null) return null;
  return {
    date,
    remaining: asNumber(o.remaining) ?? 0,
    reserved: o.reserved === true,
    cancelRequested: o.cancelRequested === true,
  };
}
function parseStudentMemo(v: unknown): PublicStudentMemo | null {
  const o = rec(v);
  const id = asString(o.id);
  const date = asString(o.date);
  const body = asString(o.body);
  if (id === null || date === null || body === null) return null;
  return { id, date, body };
}

/**
 * 임의의 입력(SQL jsonb 등)에서 **허용 키만** 골라 DTO 를 만든다.
 * allowlist 외 키(reason·noteField·rawScore·studentYearId 등)는 절대 반영되지 않는다.
 */
export function parsePublicPagePayload(raw: unknown): PublicPagePayload {
  const o = rec(raw);
  return {
    studentName: asString(o.studentName),
    weekTodos: asArray(o.weekTodos).map(parseTodo).filter((x): x is PublicWeekTodo => x !== null),
    commonNotice: asString(o.commonNotice),
    notices: parseNoticeArray(o.notices),
    individualNotices: parseNoticeArray(o.individualNotices),
    timetable: asArray(o.timetable).map(parseSlot).filter((x): x is PublicTimetableSlot => x !== null),
    meals: asArray(o.meals).map(parseMeal).filter((x): x is PublicMeal => x !== null),
    attendanceSummary: parseAttendance(o.attendanceSummary),
    attendance2D: parseAttendance2D(o.attendance2D),
    attendanceDetail: asArray(o.attendanceDetail)
      .map(parseAttendanceRecord)
      .filter((x): x is PublicAttendanceRecord => x !== null),
    counselSlots: asArray(o.counselSlots).map(parseCounselSlot).filter((x): x is PublicCounselSlot => x !== null),
    studentMemos: asArray(o.studentMemos).map(parseStudentMemo).filter((x): x is PublicStudentMemo => x !== null),
    grades: parseGrades(o.grades),
    personalMessage: asString(o.personalMessage),
    vacationSpans: asArray(o.vacationSpans)
      .map(parseVacationSpan)
      .filter((x): x is PublicVacationSpan => x !== null),
  };
}

// ──────────────────────────────────────────────────────────────
// 상태 판정 (토큰 폐기/만료)
// ──────────────────────────────────────────────────────────────

export function resolvePublicPageState(
  row:
    | { revokedAt: Date | string | null; expiresAt: Date | string | null }
    | null,
  now: Date = new Date(),
): Exclude<PublicPageState, { status: "ok" }> | { status: "valid" } {
  if (row === null) return { status: "not_found" };
  if (row.revokedAt !== null) return { status: "revoked" };
  if (row.expiresAt !== null && new Date(row.expiresAt) <= now) {
    return { status: "expired" };
  }
  return { status: "valid" };
}
