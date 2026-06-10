"use client";
import { useActionState, useState } from "react";
import {
  calendarSyncAction,
  updateEventAttrsAction,
  type CalendarSyncState,
  type UpdateAttrsState,
} from "../actions";
import type { CalendarEventAttrView } from "@/lib/db/queries";
import type { EventKind } from "@/lib/domain/calendar-keywords";

const KIND_LABEL: Record<EventKind, string> = {
  exam: "지필평가",
  vacation_start: "방학식",
  vacation_end: "개학식",
  club: "동아리",
  none: "미분류",
};

/**
 * C3 학사일정 키워드 보정 UI (AC-3.1~3.4). NEIS 동기화 → 자동 분류 결과를 표로 보여주고
 * 교사가 event_kind/시험 학기·회차를 교정한다(보정이 최종 진실원).
 */
export function CalendarAttrs({ events }: { events: CalendarEventAttrView[] }) {
  const [syncState, sync, syncing] = useActionState<CalendarSyncState, FormData>(
    calendarSyncAction,
    null,
  );

  return (
    <div className="mt-5 space-y-5">
      <section className="rounded-lg border border-neutral-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-700">NEIS 동기화</h3>
            <p className="mt-1 text-xs text-neutral-400">
              활성 학년도 범위의 학사일정·급식을 가져오고 키워드를 자동 분류합니다.
            </p>
          </div>
          <form action={sync}>
            <button
              type="submit"
              disabled={syncing}
              className="rounded-md border border-neutral-800 bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              {syncing ? "동기화 중…" : "동기화"}
            </button>
          </form>
        </div>
        {syncState && syncState.ok && (
          <p className="mt-3 rounded border border-green-200 bg-green-50 p-2 text-xs text-green-800">
            ✅ 수업일 {syncState.schoolDays}일 · 이벤트 {syncState.events}건 동기화
          </p>
        )}
        {syncState && !syncState.ok && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {syncState.message}
          </p>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-neutral-700">
          자동 분류 결과 보정 ({events.length}건)
        </h3>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">
            아직 동기화된 학사일정이 없습니다. 위에서 동기화하세요.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {events.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EventRow({ event }: { event: CalendarEventAttrView }) {
  const [kind, setKind] = useState<EventKind>(event.eventKind);
  const [state, action, pending] = useActionState<UpdateAttrsState, FormData>(
    updateEventAttrsAction,
    null,
  );

  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-2 rounded border border-neutral-200 px-3 py-2 text-sm"
    >
      <input type="hidden" name="eventId" value={event.id} />
      <span className="w-24 shrink-0 text-xs text-neutral-500">{event.date}</span>
      <span className="min-w-0 flex-1 truncate">{event.title}</span>
      <select
        name="eventKind"
        value={kind}
        onChange={(e) => setKind(e.target.value as EventKind)}
        className="rounded border border-neutral-300 px-2 py-1 text-xs"
      >
        {(Object.keys(KIND_LABEL) as EventKind[]).map((k) => (
          <option key={k} value={k}>
            {KIND_LABEL[k]}
          </option>
        ))}
      </select>
      {kind === "exam" && (
        <>
          <select
            name="examSemester"
            defaultValue={event.examSemester ?? ""}
            className="rounded border border-neutral-300 px-2 py-1 text-xs"
          >
            <option value="">학기?</option>
            <option value="1">1학기</option>
            <option value="2">2학기</option>
          </select>
          <select
            name="examOrdinal"
            defaultValue={event.examOrdinal ?? ""}
            className="rounded border border-neutral-300 px-2 py-1 text-xs"
          >
            <option value="">회차?</option>
            <option value="1">1차(중간)</option>
            <option value="2">2차(기말)</option>
          </select>
        </>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-40"
      >
        {pending ? "저장…" : "저장"}
      </button>
      {state && state.ok && state.eventId === event.id && (
        <span className="text-xs text-green-700">✓</span>
      )}
      {state && !state.ok && (
        <span className="text-xs text-red-700">{state.message}</span>
      )}
    </form>
  );
}
