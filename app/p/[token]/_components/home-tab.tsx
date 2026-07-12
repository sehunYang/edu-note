"use client";
import { useState } from "react";
import type { PublicNotice, PublicPagePayload } from "@/lib/public";
import { Button } from "@/app/ui/button";
import {
  NoticeMeta,
  useMarkNoticeReadOnView,
  kstToday,
  kstWeekday,
  eventChipClass,
} from "../_shared";

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
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-xl leading-none"
              >
                ‹
              </Button>
              <span>
                {cur + 1}/{items.length}
              </span>
              <Button
                type="button"
                onClick={() => setIdx((cur + 1) % items.length)}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-xl leading-none"
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
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded border border-amber-300 text-xl leading-none hover:bg-white/10"
              >
                ‹
              </button>
              <span>
                {cur + 1}/{notices.length}
              </span>
              <button
                type="button"
                onClick={() => setIdx((cur + 1) % notices.length)}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded border border-amber-300 text-xl leading-none hover:bg-white/10"
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

// ── 개별 메시지(교사가 이 학생에게만 남긴 메모) ──────────────────────────────
function PersonalMessage({ message }: { message: string }) {
  return (
    <section className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <h2 className="text-sm font-normal text-blue-600">개별 메시지</h2>
      <p className="mt-1 whitespace-pre-line text-sm">{message}</p>
    </section>
  );
}

// ── 오늘 요약(오늘 시간표 축약 + 오늘 급식) — 탭하면 시간표 탭으로 이동 ────────
function TodaySummary({
  timetable,
  meals,
  onNavigate,
}: {
  timetable: PublicPagePayload["timetable"];
  meals: PublicPagePayload["meals"];
  onNavigate: () => void;
}) {
  const todayWeekday = kstWeekday();
  const todayStr = kstToday();
  const todaySlots = [...timetable]
    .filter((s) => s.weekday === todayWeekday)
    .sort((a, b) => a.period - b.period);
  const todayMeal = meals.find((m) => m.date === todayStr) ?? null;

  return (
    <button
      type="button"
      onClick={onNavigate}
      className="block w-full min-h-[44px] rounded-2xl border border-hairline bg-card p-4 text-left transition hover:border-blue-400"
    >
      <h2 className="text-sm font-normal text-neutral-700">오늘 요약</h2>
      <div className="mt-2 space-y-1">
        {todaySlots.length === 0 ? (
          <p className="text-sm text-neutral-400">오늘 수업이 없습니다</p>
        ) : (
          todaySlots.map((s) => (
            <div
              key={s.period}
              className="flex min-h-[44px] items-center text-sm"
            >
              {s.period}교시 {s.subjectName}
            </div>
          ))
        )}
      </div>
      <div className="mt-3 border-t border-hairline pt-2">
        <p className="truncate text-sm">
          {todayMeal ? todayMeal.menu : "오늘 급식 정보가 없습니다"}
        </p>
      </div>
    </button>
  );
}

// ── 다가오는 일정 미리보기(2~3건) — 탭하면 일정 탭으로 이동 ───────────────────
function UpcomingEvents({
  todos,
  onNavigate,
}: {
  todos: PublicPagePayload["weekTodos"];
  onNavigate: () => void;
}) {
  const todayStr = kstToday();
  const upcoming = [...todos]
    .filter((t) => t.at.slice(0, 10) >= todayStr)
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, 3);

  return (
    <button
      type="button"
      onClick={onNavigate}
      className="block w-full min-h-[44px] rounded-2xl border border-hairline bg-card p-4 text-left transition hover:border-blue-400"
    >
      <h2 className="text-sm font-normal text-neutral-700">다가오는 일정</h2>
      <div className="mt-2 space-y-1">
        {upcoming.length === 0 ? (
          <p className="text-sm text-neutral-400">다가오는 일정이 없습니다</p>
        ) : (
          upcoming.map((t, i) => (
            <div key={i} className="flex min-h-[44px] items-center gap-2 text-sm">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${eventChipClass(t.eventKind)}`}
              />
              <span className="shrink-0 text-neutral-400">
                {t.at.slice(5, 10)}
              </span>
              <span className="truncate">{t.title}</span>
            </div>
          ))
        )}
      </div>
    </button>
  );
}

/**
 * 학생 공개 페이지 — 홈 탭 (public-page-mobile-v2, Step 4).
 * 순서: 교사 한마디 → 개별 공지 → 개별 메시지(조건부) → 오늘 요약 → 다가오는 일정.
 * 5개 카드 나열 요소에 `.stagger`를 부여(직계 자식 개별 진입 애니메이션).
 */
export function HomeTab({
  token,
  payload,
  onNavigateTimetable,
  onNavigateSchedule,
}: {
  token: string;
  payload: PublicPagePayload;
  onNavigateTimetable: () => void;
  onNavigateSchedule: () => void;
}) {
  return (
    <div className="stagger space-y-4">
      <Notices
        token={token}
        notices={payload.notices}
        commonNotice={payload.commonNotice}
      />
      <IndividualNotices token={token} notices={payload.individualNotices} />
      {payload.personalMessage && (
        <PersonalMessage message={payload.personalMessage} />
      )}
      <TodaySummary
        timetable={payload.timetable}
        meals={payload.meals}
        onNavigate={onNavigateTimetable}
      />
      <UpcomingEvents todos={payload.weekTodos} onNavigate={onNavigateSchedule} />
    </div>
  );
}
