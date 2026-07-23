"use client";
import { useEffect, useRef } from "react";
import type { PublicNotice, PublicPagePayload } from "@/lib/public";
import { markNoticeReadAction } from "./actions";
import type { EventKind } from "@/lib/domain/calendar-keywords";
import { EVENT_KIND_CHIP } from "@/lib/domain/event-kind-display";
import { assignSubjectColors } from "@/lib/domain/subject-colors";

/** 캘린더 칸/인라인 상세에 표시할 학사일정 항목(제목 + 종류). 상담 예약은 "counsel"(green), 미분류는 null. */
export interface DayEvent {
  title: string;
  eventKind: EventKind | "counsel" | null;
}

/**
 * 학사일정 칩 색상(오늘의학교 캘린더와 동일 팔레트). nullClass 로 호출부별
 * 기존 기본 배경(캘린더 칸 vs 상세 목록)을 그대로 유지한다.
 */
export function eventChipClass(
  eventKind: EventKind | "counsel" | null,
  nullClass: string = "bg-neutral-200 text-neutral-700",
): string {
  if (eventKind === "counsel") return "bg-green-100 text-green-700";
  if (eventKind === null) return nullClass;
  return EVENT_KIND_CHIP[eventKind];
}

/** KST(UTC+9) 기준 오늘 날짜(YYYY-MM-DD). 12시간 고정이 아닌 날짜 경계로 산출. */
export function kstToday(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
/** KST 기준 오늘의 요일(1=월 .. 7=일). 시간표 열 강조용. */
export function kstWeekday(now: Date = new Date()): number {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dow = kst.getUTCDay(); // 0=일 .. 6=토
  return dow === 0 ? 7 : dow;
}
/** KST 기준 이번 주(월요일 시작) 월~금 날짜 "M/D" 맵. 시간표 요일 헤더 표기용. */
export function kstWeekDates(now: Date = new Date()): Record<number, string> {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const isoDow = kstWeekday(now); // 1=월 .. 7=일
  const monday = new Date(kst.getTime() - (isoDow - 1) * 24 * 60 * 60 * 1000);
  const map: Record<number, string> = {};
  for (let w = 1; w <= 5; w++) {
    const d = new Date(monday.getTime() + (w - 1) * 24 * 60 * 60 * 1000);
    map[w] = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  }
  return map;
}

/** KST 기준 이번 주(월요일 시작) 월~금 요일→"YYYY-MM-DD" 맵. 방학 날짜 판정용. */
export function kstWeekDatesIso(now: Date = new Date()): Record<number, string> {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const isoDow = kstWeekday(now); // 1=월 .. 7=일
  const monday = new Date(kst.getTime() - (isoDow - 1) * 24 * 60 * 60 * 1000);
  const map: Record<number, string> = {};
  for (let w = 1; w <= 5; w++) {
    const d = new Date(monday.getTime() + (w - 1) * 24 * 60 * 60 * 1000);
    map[w] = d.toISOString().slice(0, 10);
  }
  return map;
}

/** "YYYY-MM-DD" 포맷. */
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "1·3교시" 형태 교시 라벨. 교시 정보 없으면 null. */
export function periodsLabel(periods: number[] | null): string | null {
  if (!periods || periods.length === 0) return null;
  return `${[...periods].sort((a, b) => a - b).join("·")}교시`;
}

// ── 과목 색(오늘의학교 오늘 시간표와 동일 팔레트) ─────────────────────────
/**
 * 시간표 슬롯의 색 키 — 공통과목=과목명, 지정된 선택과목=지정 과목명,
 * 미지정 선택과목=null(색 없음 — 점선 파랑 유도 스타일 유지).
 */
export function slotColorKey(
  slot: PublicPagePayload["timetable"][number],
): string | null {
  if (slot.isFixed) return slot.subjectName;
  return slot.electiveMapped ?? null;
}

/**
 * 주간 시간표 전체(weekday→period 순) 등장순 과목색 맵. 시간표 탭과 홈 탭
 * 오늘 요약이 같은 맵을 쓰므로 같은 과목=항상 같은 색(요일 변경에도 안정).
 */
export function subjectColorsForTimetable(
  slots: PublicPagePayload["timetable"],
): Map<string, string> {
  const ordered = [...slots].sort(
    (a, b) => a.weekday - b.weekday || a.period - b.period,
  );
  const names: string[] = [];
  for (const s of ordered) {
    const key = slotColorKey(s);
    if (key) names.push(key);
  }
  return assignSubjectColors(names);
}

// ── 시간표 상수 ──────────────────────────────────────────────────────────
export const TT_WEEKDAYS = [1, 2, 3, 4, 5];
export const TT_WEEKDAY_LABEL: Record<number, string> = {
  1: "월",
  2: "화",
  3: "수",
  4: "목",
  5: "금",
};
export const TT_PERIODS = [1, 2, 3, 4, 5, 6, 7];

// ── 출결 상수 ────────────────────────────────────────────────────────────
import type { PublicAttendance2D, PublicAttendanceRecord } from "@/lib/public";

export const KIND_ROWS: [keyof PublicAttendance2D, string][] = [
  ["late", "지각"],
  ["earlyLeave", "조퇴"],
  ["absentPeriod", "결과"],
  ["absent", "결석"],
];
export const REASON_COLS: [keyof PublicAttendance2D["late"], string][] = [
  ["accepted", "인정"],
  ["illness", "질병"],
  ["unaccepted", "미인정"],
  ["etc", "기타"],
];

/** 2D 매트릭스 키(camel) → 상세 기록 kind(enum) 매핑. */
export const KIND_TO_RECORD_KIND: Record<
  keyof PublicAttendance2D,
  PublicAttendanceRecord["kind"]
> = {
  late: "late",
  earlyLeave: "early_leave",
  absentPeriod: "absent_period",
  absent: "absent",
};
export const REASON_LABEL: Record<PublicAttendanceRecord["reason"], string> = {
  accepted: "인정",
  illness: "질병",
  unaccepted: "미인정",
  etc: "기타",
};

// ── 카드(공용 컨테이너) ──────────────────────────────────────────────────
export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-hairline bg-card p-4">
      <h2 className="text-sm font-normal text-neutral-700">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

// ── 공지 게시일 메타(날짜 + New 배지) ────────────────────────────────────
/**
 * 공지 게시일 라벨(KST "M월 D일"). postedAt = teacher_notes.updated_at → 수정 시 수정일 표시.
 * postedAt(ISO) 이 없거나 파싱 불가하면 null(레거시/누락 안전).
 */
function noticeDateLabel(postedAt: string | null): string | null {
  if (!postedAt) return null;
  const t = new Date(postedAt);
  if (Number.isNaN(t.getTime())) return null;
  const kst = new Date(t.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
}

/**
 * 공지 게시일 + New 배지(교사 한마디·개별 공지 공용). New 는 이 학생이 현재 게시본을
 * 아직 안 읽었을 때만(unread) 표시 — 열람하면 다음 방문부터 사라지고, 교사가 수정하면 재노출.
 */
export function NoticeMeta({
  postedAt,
  unread,
}: {
  postedAt: string | null;
  unread: boolean;
}) {
  const label = noticeDateLabel(postedAt);
  if (!label && !unread) return null;
  return (
    <span className="flex items-center gap-1.5">
      {unread && (
        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-normal leading-none text-white">
          New
        </span>
      )}
      {label && <span className="text-xs text-neutral-400">{label}</span>}
    </span>
  );
}

/**
 * 현재 보고 있는 공지를 '읽음' 처리(v12). 미읽음(unread)이고 id 가 있는 공지가 화면에
 * 나타나면 토큰 스코프 액션으로 읽음 기록(fire-and-forget — revalidate 없이 다음 방문에 반영).
 * 세션 내 중복 호출은 ref 로 방지.
 */
export function useMarkNoticeReadOnView(
  token: string,
  item: PublicNotice | undefined,
) {
  const firedRef = useRef<Set<string>>(new Set());
  const id = item?.id ?? null;
  const unread = item?.unread ?? false;
  useEffect(() => {
    if (!id || !unread || firedRef.current.has(id)) return;
    firedRef.current.add(id);
    void markNoticeReadAction(token, id);
  }, [token, id, unread]);
}
