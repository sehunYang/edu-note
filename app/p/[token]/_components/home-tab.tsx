"use client";
import { useState } from "react";
import type { PublicNotice, PublicPagePayload } from "@/lib/public";
import { Button } from "@/app/ui/button";
import { NoticeMeta, useMarkNoticeReadOnView } from "../_shared";

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

// ── 개별 메시지(교사가 이 학생에게만 남긴 메모) ──────────────────────────────
function PersonalMessage({ message }: { message: string }) {
  return (
    <section className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <h2 className="text-sm font-normal text-blue-600">개별 메시지</h2>
      <p className="mt-1 whitespace-pre-line text-sm">{message}</p>
    </section>
  );
}

/**
 * 학생 공개 페이지 — 홈 탭 (public-page-mobile-v2, Step 4).
 * 순서: 교사 한마디 → 개별 공지 → 개별 메시지(조건부).
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
  void onNavigateTimetable;
  void onNavigateSchedule;
  return (
    <>
      <Notices
        token={token}
        notices={payload.notices}
        commonNotice={payload.commonNotice}
      />
      <IndividualNotices token={token} notices={payload.individualNotices} />
      {payload.personalMessage && (
        <PersonalMessage message={payload.personalMessage} />
      )}
    </>
  );
}
