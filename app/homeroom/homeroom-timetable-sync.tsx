"use client";
import { useActionState } from "react";
import {
  syncHomeroomTimetableAction,
  type HomeroomSyncState,
} from "./timetable-actions";

/**
 * 담임반 시간표 컴시간 동기화 트리거 (QC v3 Part B, US-B13, AC-12.3).
 * 세팅실 컴시간 학교 + 담임 학년/반으로 시간표를 가져와 공개 페이지 시간표 소스를 갱신한다.
 */
export function HomeroomTimetableSync() {
  const [state, action, pending] = useActionState<HomeroomSyncState, FormData>(
    syncHomeroomTimetableAction,
    null,
  );

  return (
    <form
      action={action}
      className="rounded-lg border border-neutral-200 p-4 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">담임반 시간표 동기화</h2>
          <p className="mt-1 text-xs text-neutral-500">
            컴시간에서 담임반 시간표를 가져와 학생 안내 페이지에 표시합니다.
          </p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {pending ? "동기화 중…" : "컴시간 동기화"}
        </button>
      </div>

      {state && state.ok && (
        <p className="mt-3 rounded border border-green-200 bg-green-50 p-2 text-xs text-green-800">
          ✅ {state.grade}학년 {state.classNo}반 시간표 {state.slots}칸 동기화
        </p>
      )}
      {state && !state.ok && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {state.message}
        </p>
      )}
    </form>
  );
}
