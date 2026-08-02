"use client";
import { useState } from "react";
import { Paginator } from "@/lib/ui/paginator";
import { paginate } from "@/lib/db/pagination";
import {
  addNoticeEventAction,
  updateNoticeEventAction,
  deleteNoticeEventAction,
} from "./actions";
import type { NoticeEventRow } from "@/lib/db/queries";
import { Button } from "@/app/ui/button";
import { ConfirmButton } from "@/app/ui/confirm-button";

const PAGE_SIZE = 10;

/**
 * 할 일 / 공지 관리 (QC v3 Part B AC-10.2 + QC v4 US-5 AC-5.5). 추가 + 인라인 수정
 * (제목·날짜·내용) + 삭제 + 10개씩 페이지네이션. 내용(content)은 calendar_events.content
 * 본문이며 공개 페이지에 함께 노출된다.
 */
export function EventsManager({
  events,
  today,
}: {
  events: NoticeEventRow[];
  today: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { pageItems, totalPages, currentPage } = paginate(
    events,
    page,
    PAGE_SIZE,
  );

  return (
    <section className="mt-8">
      <h2 className="flex flex-wrap items-baseline gap-2 text-sm text-neutral-700">
        할 일 / 공지
        <span className="text-xs text-neutral-400">
          7일 이내 = 학생 페이지 &lsquo;이번 주 할 일&rsquo;
        </span>
      </h2>

      <form action={addNoticeEventAction} className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="일정 날짜"
            type="date"
            name="date"
            defaultValue={today}
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <input aria-label="공지/할 일 제목"
            name="title"
            required
            placeholder="공지/할 일 제목"
            className="min-w-0 flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm"
          />
          <Button className="px-3 py-1.5 text-sm">
            추가
          </Button>
        </div>
        <textarea aria-label="내용(선택) — 공개 페이지 본문에 함께 표시"
          name="content"
          rows={2}
          placeholder="내용(선택) — 공개 페이지 본문에 함께 표시"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          <input type="checkbox" name="isPublic" defaultChecked />
          학생 공개 페이지에 표시
        </label>
      </form>

      {events.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">등록된 공지가 없습니다.</p>
      ) : (
        <>
        <ul className="mt-3 space-y-2">
          {pageItems.map((e) => {
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
                      <input aria-label="일정 날짜"
                        type="date"
                        name="date"
                        defaultValue={e.date}
                        className="rounded border border-neutral-300 px-2 py-1 text-sm"
                      />
                      <input aria-label="일정 제목"
                        name="title"
                        defaultValue={e.title}
                        required
                        className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
                      />
                    </div>
                    <textarea aria-label="내용(선택)"
                      name="content"
                      rows={2}
                      defaultValue={e.content ?? ""}
                      placeholder="내용(선택)"
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                      <input
                        type="checkbox"
                        name="isPublic"
                        defaultChecked={e.isPublic}
                      />
                      학생 공개 페이지에 표시
                    </label>
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
                    {!e.isPublic && (
                      <span className="ml-2 text-xs text-amber-600">
                        (학생 비공개)
                      </span>
                    )}
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
                      <ConfirmButton
                        message="이 일정을 삭제할까요? 되돌릴 수 없습니다."
                        className="text-xs text-red-500 hover:underline"
                      >
                        삭제
                      </ConfirmButton>
                    </form>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        <Paginator
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
          className="mt-3"
        />
        </>
      )}
    </section>
  );
}
