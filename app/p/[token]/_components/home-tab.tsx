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
  slotColorKey,
  subjectColorsForTimetable,
} from "../_shared";
import { vacationWeekdays } from "@/lib/domain/timetable-actual";
import { NotifyCard } from "./notify-card";

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
  weeklyActual,
  onNavigate,
}: {
  timetable: PublicPagePayload["timetable"];
  meals: PublicPagePayload["meals"];
  weeklyActual: PublicPagePayload["weeklyActual"];
  onNavigate: () => void;
}) {
  const todayWeekday = kstWeekday();
  const todayStr = kstToday();
  // 오늘이 방학 요일이면(이번 주 NEIS 실제가 전부 방학) 수업 대신 방학 표시.
  const vacationDays = vacationWeekdays(
    weeklyActual.map((a) => ({
      weekday: a.weekday,
      period: a.period,
      subject: a.subjectName,
    })),
  );
  const isVacationToday = vacationDays.has(todayWeekday);
  // 빈 subjectName 을 건너뛰고 방학 슬롯의 실제 라벨을 뽑는다(빈 라벨 방지).
  const vacationLabel =
    weeklyActual
      .filter((a) => a.weekday === todayWeekday && a.subjectName.trim())
      .map((a) => a.subjectName.trim())[0] ?? "방학";
  const todaySlots = [...timetable]
    .filter((s) => s.weekday === todayWeekday)
    .sort((a, b) => a.period - b.period);
  const todayMeal = meals.find((m) => m.date === todayStr) ?? null;
  // 주간 전체 기준 과목색 — 시간표 탭과 동일 맵이라 같은 과목=같은 색.
  const subjectColors = subjectColorsForTimetable(timetable);

  return (
    <button
      type="button"
      onClick={onNavigate}
      className="block w-full min-h-[44px] rounded-2xl border border-hairline bg-card p-4 text-left transition hover:border-blue-400"
    >
      <h2 className="text-sm font-normal text-neutral-700">오늘 요약</h2>
      <div className="mt-2 space-y-1.5">
        {isVacationToday ? (
          <div className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <span>🏖️</span>
            <span>{vacationLabel} · 수업이 없습니다</span>
          </div>
        ) : todaySlots.length === 0 ? (
          <p className="text-sm text-neutral-400">오늘 수업이 없습니다</p>
        ) : (
          todaySlots.map((s) => {
            const key = slotColorKey(s);
            const color = key ? subjectColors.get(key) : undefined;
            const name = s.isFixed ? s.subjectName : (s.electiveMapped ?? "선택과목");
            return (
              <div key={s.period} className="flex min-h-[44px] items-center gap-2 text-sm">
                <span className="w-6 shrink-0 text-neutral-400">{s.period}</span>
                <span
                  className={`flex min-h-[38px] min-w-0 flex-1 items-center truncate rounded border px-2 ${
                    color ?? "border-hairline text-neutral-500"
                  }`}
                >
                  {name}
                </span>
              </div>
            );
          })
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
              <span className="shrink-0 text-neutral-400">
                {t.at.slice(5, 10)}
              </span>
              <span
                className={`truncate rounded px-1.5 py-0.5 text-xs ${eventChipClass(t.eventKind)}`}
              >
                {t.title}
              </span>
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
        weeklyActual={payload.weeklyActual}
        onNavigate={onNavigateTimetable}
      />
      <UpcomingEvents todos={payload.weekTodos} onNavigate={onNavigateSchedule} />
      <NotifyCard token={token} />
    </div>
  );
}
