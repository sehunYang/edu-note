"use client";
import { useState } from "react";
import { Button } from "@/app/ui/button";

/**
 * 오늘의 학교 공지 위젯 (QC v4 AC-7.10). 공지실 데이터 이관:
 *  - 교사 한마디: 여러 장을 스와이프(carousel)로 열람.
 *  - 할일·공지: 제목 + 내용(content)까지 목록 표시(읽기 전용 위젯).
 * 편집은 공지실(/homeroom/notice)에서 — 위젯은 노출만 한다.
 */
export interface NoticeWidgetEvent {
  id: string;
  date: string;
  title: string;
  content: string | null;
}

export function NoticeWidget({
  notes,
  events,
}: {
  notes: string[];
  events: NoticeWidgetEvent[];
}) {
  return (
    <section className="rounded-lg border border-neutral-200 p-4 md:col-span-2">
      <h2 className="text-sm font-normal text-neutral-700">공지</h2>
      <div className="mt-2 grid gap-4 md:grid-cols-2">
        <TeacherNotesCarousel notes={notes} />
        <EventsList events={events} />
      </div>
    </section>
  );
}

function TeacherNotesCarousel({ notes }: { notes: string[] }) {
  const [idx, setIdx] = useState(0);
  if (notes.length === 0) {
    return (
      <div className="rounded border border-neutral-100 bg-neutral-50 p-3">
        <p className="text-xs font-normal text-neutral-400">교사 한마디</p>
        <p className="mt-2 text-sm text-neutral-400">등록된 한마디가 없습니다.</p>
      </div>
    );
  }
  const cur = Math.min(idx, notes.length - 1);
  return (
    <div className="rounded border border-neutral-100 bg-neutral-50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-normal text-neutral-500">교사 한마디</p>
        {notes.length > 1 && (
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <Button
              type="button"
              onClick={() => setIdx((cur - 1 + notes.length) % notes.length)}
              className="px-2 py-0.5"
            >
              ‹
            </Button>
            <span>
              {cur + 1}/{notes.length}
            </span>
            <Button
              type="button"
              onClick={() => setIdx((cur + 1) % notes.length)}
              className="px-2 py-0.5"
            >
              ›
            </Button>
          </div>
        )}
      </div>
      <p className="mt-2 whitespace-pre-line text-sm text-neutral-700">{notes[cur]}</p>
    </div>
  );
}

function EventsList({ events }: { events: NoticeWidgetEvent[] }) {
  return (
    <div className="rounded border border-neutral-100 p-3">
      <p className="text-xs font-normal text-neutral-500">할일 · 공지</p>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-400">등록된 할일·공지가 없습니다.</p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {events.map((e) => (
            <li key={e.id}>
              <div className="flex gap-2">
                <span className="shrink-0 text-xs text-neutral-400">{e.date}</span>
                <span className="font-normal text-neutral-700">{e.title}</span>
              </div>
              {e.content && (
                <p className="mt-0.5 whitespace-pre-line pl-[3.5rem] text-xs text-neutral-500">
                  {e.content}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
