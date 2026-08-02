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
      <h2 className="text-sm text-neutral-700">공지</h2>
      {/* items-start: 한쪽이 길면 다른 쪽 빈 카드가 같이 늘어났다(실측 "할일·공지"
          빈 카드가 300px). 밀도 개선 D-13. */}
      <div className="mt-2 grid items-start gap-4 md:grid-cols-2">
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
      <NoteBody text={notes[cur] ?? ""} />
    </div>
  );
}

/**
 * 한마디 본문 — 기본 5줄로 접고 필요할 때 펼친다 (밀도 개선 D-13).
 *
 * 교사 한마디는 조회 안내를 통째로 붙여 넣는 자리라 실제 데이터가 20줄을
 * 넘는다. 홈 위젯에서 이걸 전부 펼치면 카드 하나가 300px 를 먹고, 그 옆
 * 칸과 아래 실 바로가기가 전부 스크롤 밖으로 밀린다. 위젯의 역할은 "무엇이
 * 있는지 알리는 것"이지 전문(全文) 읽기가 아니다 — 앞부분을 보여주고
 * 나머지는 클릭으로 연다.
 */
function NoteBody({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  // 줄 수로 판단한다 — 한마디는 줄바꿈이 의미를 갖는 형식이라 글자 수보다
  // 줄 수가 실제 높이에 비례한다.
  const clamped = text.split("\n").length > 6;

  return (
    <>
      <p
        className={`mt-2 whitespace-pre-line text-sm text-neutral-700 ${
          clamped && !expanded ? "line-clamp-5" : ""
        }`}
      >
        {text}
      </p>
      {clamped && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 text-xs text-neutral-400 hover:text-white hover:underline"
        >
          {expanded ? "접기" : "더 보기"}
        </button>
      )}
    </>
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
