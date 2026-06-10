"use client";
import { useActionState } from "react";
import { syncTimetableAction, type SyncState } from "./timetable-actions";

/** 컴시간 동기화 폼 (C5 세팅실). 학교명·교사명 → 시간표 sync(과목/분반 생성). */
export function TimetableSync({
  defaultSchool,
  defaultTeacher,
}: {
  defaultSchool: string;
  defaultTeacher: string;
}) {
  const [state, action, pending] = useActionState<SyncState, FormData>(
    syncTimetableAction,
    null,
  );

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">학교명</label>
          <input
            name="school"
            defaultValue={defaultSchool}
            placeholder="예: 인천해송고등학교"
            className="w-56 rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">교사명(본인)</label>
          <input
            name="teacher"
            defaultValue={defaultTeacher}
            placeholder="예: 양세훈"
            className="w-40 rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
      >
        {pending ? "동기화 중…" : "컴시간 동기화"}
      </button>

      {state && state.ok && (
        <p className="rounded border border-green-200 bg-green-50 p-3 text-sm">
          ✅ {state.teacher} 시간표 동기화 — 과목 {state.subjects} · 분반{" "}
          {state.sections} · 수업 {state.slots}개
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
