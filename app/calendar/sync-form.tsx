"use client";
import { useActionState } from "react";
import { syncCalendarAction, type CalSyncState } from "./actions";

/** NEIS 캘린더 동기화 폼. 학교명 입력 → 학사일정·급식 sync. */
export function CalendarSyncForm({ defaultSchool }: { defaultSchool: string }) {
  const [state, action, pending] = useActionState<CalSyncState, FormData>(
    syncCalendarAction,
    null,
  );

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500">학교명(NEIS 등록명)</label>
        <input
          name="school"
          defaultValue={defaultSchool}
          placeholder="예: 인천해송고등학교"
          className="w-64 rounded border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
      >
        {pending ? "동기화 중…" : "NEIS 동기화"}
      </button>

      {state && state.ok && (
        <p className="rounded border border-green-200 bg-green-50 p-3 text-sm">
          ✅ {state.school} — 수업일 {state.schoolDays}일 · 학사일정 {state.events}건
          · 급식 {state.meals}일 동기화
        </p>
      )}
      {state && !state.ok && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {state.message}
        </p>
      )}
    </form>
  );
}
