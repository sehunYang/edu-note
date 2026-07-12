"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type {
  PublicPagePayload,
  PublicAttendance2D,
  PublicAttendanceRecord,
  PublicCounselSlot,
  PublicVacationSpan,
  PublicNotice,
} from "@/lib/public";
import {
  saveElectiveAction,
  reserveCounselAction,
  requestCounselCancelAction,
  saveStudentMemoAction,
  deleteStudentMemoAction,
  markNoticeReadAction,
} from "./actions";
import type { PublicStudentMemo } from "@/lib/public";
import type { EventKind } from "@/lib/domain/calendar-keywords";
import {
  EVENT_KIND_CHIP,
  VACATION_BAND_BG,
} from "@/lib/domain/event-kind-display";
import { Button } from "@/app/ui/button";

/** 캘린더 칸/모달에 표시할 학사일정 항목(제목 + 종류). 상담 예약은 "counsel"(green), 미분류는 null. */
interface DayEvent {
  title: string;
  eventKind: EventKind | "counsel" | null;
}

/**
 * 학사일정 칩 색상(오늘의학교 캘린더와 동일 팔레트). nullClass 로 호출부별
 * 기존 기본 배경(캘린더 칸 vs 모달 목록)을 그대로 유지한다.
 */
function eventChipClass(
  eventKind: EventKind | "counsel" | null,
  nullClass: string = "bg-neutral-200 text-neutral-700",
): string {
  if (eventKind === "counsel") return "bg-green-100 text-green-700";
  if (eventKind === null) return nullClass;
  return EVENT_KIND_CHIP[eventKind];
}

/** KST(UTC+9) 기준 오늘 날짜(YYYY-MM-DD). 12시간 고정이 아닌 날짜 경계로 산출. */
function kstToday(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
/** KST 기준 오늘의 요일(1=월 .. 7=일). 시간표 열 강조용. */
function kstWeekday(now: Date = new Date()): number {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dow = kst.getUTCDay(); // 0=일 .. 6=토
  return dow === 0 ? 7 : dow;
}
/** KST 기준 이번 주(월요일 시작) 월~금 날짜 "M/D" 맵. 시간표 요일 헤더 표기용. */
function kstWeekDates(now: Date = new Date()): Record<number, string> {
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

/**
 * 공개 학생 안내 페이지 클라이언트 뷰 (QC v3 Part B, US-B13, AC-12.1~12.8).
 *
 * 모든 데이터는 allowlist DTO(get_public_page → parsePublicPagePayload) 로 사전집계된 값.
 * 쓰기(선택과목 자가매핑·상담신청)는 토큰 스코프 서버액션으로만 수행한다.
 */
export function PublicPageView({
  token,
  payload,
}: {
  token: string;
  payload: PublicPagePayload;
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10 space-y-8">
      <header>
        <h1 className="text-2xl font-normal tracking-tight">
          {payload.studentName ? `${payload.studentName} 학생 안내 페이지` : "학생 안내 페이지"}
        </h1>
        <p className="mt-1 text-xs text-neutral-400">
          이 페이지의 링크는 외부에 공유하지 마세요.
        </p>
      </header>

      <Notices
        token={token}
        notices={payload.notices}
        commonNotice={payload.commonNotice}
      />
      <IndividualNotices token={token} notices={payload.individualNotices} />
      <CalendarSection
        token={token}
        todos={payload.weekTodos}
        memos={payload.studentMemos}
        vacationSpans={payload.vacationSpans}
      />
      <Timetable token={token} slots={payload.timetable} />
      <Meals meals={payload.meals} />
      <Attendance2DTable
        matrix={payload.attendance2D}
        records={payload.attendanceDetail}
      />
      <CounselSlots token={token} slots={payload.counselSlots} />

      {payload.personalMessage && (
        <section className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h2 className="text-sm font-normal text-blue-600">개별 메시지</h2>
          <p className="mt-1 whitespace-pre-line text-sm">
            {payload.personalMessage}
          </p>
        </section>
      )}
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-200 p-4">
      <h2 className="text-sm font-normal text-neutral-700">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

// ── 교사 한마디/개별 공지 게시일 메타(날짜 + New 배지) ──────────────────────
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
function NoticeMeta({
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
        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-normal leading-none text-white">
          New
        </span>
      )}
      {label && <span className="text-[11px] text-neutral-400">{label}</span>}
    </span>
  );
}

/**
 * 현재 보고 있는 공지를 '읽음' 처리(v12). 미읽음(unread)이고 id 가 있는 공지가 화면에
 * 나타나면 토큰 스코프 액션으로 읽음 기록(fire-and-forget — revalidate 없이 다음 방문에 반영).
 * 세션 내 중복 호출은 ref 로 방지.
 */
function useMarkNoticeReadOnView(
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

// ── 다중 교사 한마디(스와이프) ──────────────────────────────────────────────
function Notices({
  token,
  notices,
  commonNotice,
}: {
  token: string;
  notices: PublicNotice[];
  commonNotice: string | null;
}) {
  // notices 우선, 비면 commonNotice 단일 폴백(레거시 — 게시일·New 없음).
  const items: PublicNotice[] =
    notices.length > 0
      ? notices
      : commonNotice
        ? [{ id: null, body: commonNotice, postedAt: null, unread: false }]
        : [];
  const [idx, setIdx] = useState(0);
  const cur = items.length > 0 ? Math.min(idx, items.length - 1) : 0;
  const item = items[cur];
  useMarkNoticeReadOnView(token, item);
  if (items.length === 0) return null;
  return (
    <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-normal text-neutral-500">교사 한마디</h2>
        <div className="flex items-center gap-2">
          <NoticeMeta postedAt={item.postedAt} unread={item.unread} />
          {items.length > 1 && (
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Button
                type="button"
                onClick={() => setIdx((cur - 1 + items.length) % items.length)}
                className="px-2 py-0.5"
              >
                ‹
              </Button>
              <span>
                {cur + 1}/{items.length}
              </span>
              <Button
                type="button"
                onClick={() => setIdx((cur + 1) % items.length)}
                className="px-2 py-0.5"
              >
                ›
              </Button>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm">{item.body}</p>
    </section>
  );
}

// ── 개별 공지(이 학생 대상 — 전체 공지처럼 한 건씩 스와이프 분리, QC v6 ④) ────
function IndividualNotices({
  token,
  notices,
}: {
  token: string;
  notices: PublicNotice[];
}) {
  const [idx, setIdx] = useState(0);
  const cur = notices.length > 0 ? Math.min(idx, notices.length - 1) : 0;
  const item = notices[cur];
  useMarkNoticeReadOnView(token, item);
  if (notices.length === 0) return null;
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-normal text-amber-600">개별 공지</h2>
        <div className="flex items-center gap-2">
          <NoticeMeta postedAt={item.postedAt} unread={item.unread} />
          {notices.length > 1 && (
            <div className="flex items-center gap-2 text-xs text-amber-500">
              <button
                type="button"
                onClick={() => setIdx((cur - 1 + notices.length) % notices.length)}
                className="rounded border border-amber-300 px-2 py-0.5 hover:bg-white/10"
              >
                ‹
              </button>
              <span>
                {cur + 1}/{notices.length}
              </span>
              <button
                type="button"
                onClick={() => setIdx((cur + 1) % notices.length)}
                className="rounded border border-amber-300 px-2 py-0.5 hover:bg-white/10"
              >
                ›
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm">{item.body}</p>
    </section>
  );
}

