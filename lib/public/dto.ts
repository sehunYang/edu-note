/**
 * 공개 학생 페이지 allowlist DTO + 순수 집계/파서 (계획 §3.2, AC-I).
 *
 * 보안 핵심: 공개 응답에는 **사전집계된 허용 필드만** 담는다.
 * 절대 금지: 출결 `reason`/`note_field` 자유텍스트, 성적 원점수(raw)·수행 줄글,
 * 타 학생 데이터, 내부 ID. 이 모듈의 함수들은 모두 명시적 필드 선택(스프레드 금지)으로
 * 구성되어, 미래에 입력에 키가 추가돼도 출력에 새지 않는다.
 */
import type { AttendanceKind } from "@/lib/domain/types";

// ── 공통칸 ──
export interface PublicWeekTodo {
  title: string;
  at: string; // ISO 일시
}
export interface PublicTimetableSlot {
  weekday: number; // 1=월 .. 7=일
  period: number;
  subjectName: string;
}
export interface PublicMeal {
  date: string; // YYYY-MM-DD
  menu: string;
}

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

export interface PublicPagePayload {
  // 공통칸
  weekTodos: PublicWeekTodo[];
  commonNotice: string | null; // 교사 한마디
  timetable: PublicTimetableSlot[];
  meals: PublicMeal[];
  // 개별칸
  attendanceSummary: PublicAttendanceSummary;
  grades: PublicGradeStatus;
  personalMessage: string | null; // 교사 개별 메시지
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
  // common (room 등 추가 필드가 와도 무시)
  weekTodos: { title: string; at: string }[];
  commonNotice: string | null;
  timetable: { weekday: number; period: number; subjectName: string }[];
  meals: { date: string; menu: string }[];
  // 출결 원자료 (집계 전용)
  attendance: AttendanceRowForSummary[];
  // 성적
  gradesMock: boolean;
  grades: { subjectName: string; rank: number | null; grade5: number | null; achievement: string | null }[];
  personalMessage: string | null;
}

export function buildPublicPagePayload(
  input: RawPublicPageInput,
): PublicPagePayload {
  return {
    weekTodos: input.weekTodos.map((t) => ({ title: t.title, at: t.at })),
    commonNotice: input.commonNotice,
    timetable: input.timetable.map((s) => ({
      weekday: s.weekday,
      period: s.period,
      subjectName: s.subjectName,
    })),
    meals: input.meals.map((m) => ({ date: m.date, menu: m.menu })),
    attendanceSummary: summarizeAttendance(input.attendance),
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

function parseTodo(v: unknown): PublicWeekTodo | null {
  const o = rec(v);
  const title = asString(o.title);
  const at = asString(o.at);
  if (title === null || at === null) return null;
  return { title, at };
}
function parseSlot(v: unknown): PublicTimetableSlot | null {
  const o = rec(v);
  const weekday = asNumber(o.weekday);
  const period = asNumber(o.period);
  const subjectName = asString(o.subjectName);
  if (weekday === null || period === null || subjectName === null) return null;
  return { weekday, period, subjectName };
}
function parseMeal(v: unknown): PublicMeal | null {
  const o = rec(v);
  const date = asString(o.date);
  const menu = asString(o.menu);
  if (date === null || menu === null) return null;
  return { date, menu };
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

/**
 * 임의의 입력(SQL jsonb 등)에서 **허용 키만** 골라 DTO 를 만든다.
 * allowlist 외 키(reason·noteField·rawScore·studentYearId 등)는 절대 반영되지 않는다.
 */
export function parsePublicPagePayload(raw: unknown): PublicPagePayload {
  const o = rec(raw);
  return {
    weekTodos: asArray(o.weekTodos).map(parseTodo).filter((x): x is PublicWeekTodo => x !== null),
    commonNotice: asString(o.commonNotice),
    timetable: asArray(o.timetable).map(parseSlot).filter((x): x is PublicTimetableSlot => x !== null),
    meals: asArray(o.meals).map(parseMeal).filter((x): x is PublicMeal => x !== null),
    attendanceSummary: parseAttendance(o.attendanceSummary),
    grades: parseGrades(o.grades),
    personalMessage: asString(o.personalMessage),
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
