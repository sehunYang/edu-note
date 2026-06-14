"use client";
import { useState } from "react";
import {
  addNoticeEventAction,
  updateNoticeEventAction,
  deleteNoticeEventAction,
} from "./actions";
import type { NoticeEventRow } from "@/lib/db/queries";

/**
 * 할 일 / 공지 관리 (QC v3 Part B AC-10.2). 추가 + 인라인 수정(제목·날짜·내용) + 삭제.
 * 내용(content)은 calendar_events.content 본문이며 공개 페이지에 함께 노출된다.
 */
export function EventsManager({
  events,
  today,
}: {
  events: NoticeEventRow[];
  today: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-neutral-700">할 일 / 공지</h2>
      <p className="mt-1 text-xs text-neutral-400">
        공개 페이지에는 오늘부터 7일 이내 항목이 “이번 주 할 일”로 표시됩니다.
      </p>

      <form action={addNoticeEventAction} className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            name="date"
            defaultValue={today}
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <input
            name="title"
            required
            placeholder="공지/할 일 제목"
            className="flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm"
          />
          <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700">
            추가
          </button>
        </div>
        <textarea
          name="content"
          rows={2}
          placeholder="내용(선택) — 공개 페이지 본문에 함께 표시"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        />
      </form>

      {events.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">등록된 공지가 없습니다.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {events.map((e) => {
            const upcoming = e.date >= today;
            if (editing === e.id) {
              return (
                <li
                  key={e.id}
                  className="rounded-lg border border-neutral-200 p-3 text-sm"
                >
                  <form
                    action={updateNoticeEventAction}
                    onSubmit={() => setEditing(null)}
                    className="space-y-2"
                  >
                    <input type="hidden" name="id" value={e.id} />
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        name="date"
                        defaultValue={e.date}
                        className="rounded border border-neutral-300 px-2 py-1 text-sm"
                      />
                      <input
                        name="title"
                        defaultValue={e.title}
                        required
                        className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
                      />
                    </div>
                    <textarea
                      name="content"
                      rows={2}
                      defaultValue={e.content ?? ""}
                      placeholder="내용(선택)"
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                    />
                    <div className="flex gap-3">
                      <button className="text-xs text-neutral-700 hover:underline">
                        저장
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="text-xs text-neutral-400 hover:underline"
                      >
                        취소
                      </button>
                    </div>
                  </form>
                </li>
              );
            }
            return (
              <li
                key={e.id}
                className="rounded-lg border border-neutral-200 p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <span>
                    <span
                      className={`mr-2 text-xs ${upcoming ? "text-neutral-500" : "text-neutral-300"}`}
                    >
                      {e.date}
                    </span>
                    {e.title}
                    {!upcoming && (
                      <span className="ml-2 text-xs text-neutral-300">
                        (지난 항목)
                      </span>
                    )}
                    {e.content ? (
                      <span className="mt-1 block text-xs text-neutral-500">
                        {e.content}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 gap-3">
                    <button
                      type="button"
                      onClick={() => setEditing(e.id)}
                      className="text-xs text-neutral-500 hover:underline"
                    >
                      수정
                    </button>
                    <form action={deleteNoticeEventAction} className="inline">
                      <input type="hidden" name="id" value={e.id} />
                      <button className="text-xs text-red-500 hover:underline">
                        삭제
                      </button>
                    </form>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
