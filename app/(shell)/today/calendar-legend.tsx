"use client";
import { useState } from "react";
import {
  EVENT_KIND_LABEL,
  EVENT_KIND_CHIP,
} from "@/lib/domain/event-kind-display";
import type { EventKind } from "@/lib/domain/calendar-keywords";

/**
 * 월간 캘린더 범례 (사용성 개선 P2-13).
 *
 * 캘린더는 event_kind 8종을 서로 다른 색 칩으로, 구글 캘린더 일정은 "G" 접두사로
 * 표시하는데 화면 어디에도 범례가 없었다("G AI 강의" 의 G 는 title 속성에만 있어
 * 마우스를 올려야 알 수 있고, 터치 기기에서는 알 방법이 없었다). 색과 접두사가
 * 무엇을 뜻하는지 여기서 한 번에 밝힌다. 평소엔 접어 두어 캘린더를 가리지 않는다.
 */

const KINDS: EventKind[] = [
  "exam",
  "mock_exam",
  "vacation",
  "holiday",
  "club",
  "self_activity",
  "career_activity",
  "etc",
];

export function CalendarLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-1 text-neutral-500 hover:text-neutral-300"
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span> 색상·표기 안내
      </button>

      {open && (
        <div className="mt-1 space-y-2 rounded-lg border border-neutral-200 p-3">
          <ul className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <li
                key={k}
                className={`rounded px-1.5 py-0.5 ${EVENT_KIND_CHIP[k]}`}
              >
                {EVENT_KIND_LABEL[k]}
              </li>
            ))}
          </ul>
          <ul className="space-y-1 text-neutral-500">
            <li>
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">
                G
              </span>{" "}
              로 시작하는 일정은 연결된 <strong>구글 캘린더</strong>에서 가져온
              것입니다(읽기 전용 — 수정·삭제는 구글에서).
            </li>
            <li>
              <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-700">
                메모 N
              </span>{" "}
              는 그날 적어 둔 메모 개수입니다. 날짜를 누르면 열립니다.
            </li>
            <li>
              방학 기간은 칸 배경이 옅은 <strong>노란색</strong>으로 칠해집니다.
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
