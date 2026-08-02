"use client";
import { useActionState } from "react";
import {
  syncHomeroomTimetableAction,
  autoDetectFixedClassesAction,
  applyFixedClassesAction,
  type HomeroomSyncState,
  type AutoDetectState,
  type ApplyFixedState,
} from "./timetable-actions";
import { Button } from "@/app/ui/button";

/**
 * 담임반 시간표 컴시간 동기화 트리거 (QC v4 US-5 AC-5.4 — 공지실에서 세팅실 컴시간
 * 시간표 동기화 섹션으로 이관). 세팅실 컴시간 학교 + 담임 학년/반으로 시간표를 가져와
 * 학생 안내(공개) 페이지 시간표 소스를 갱신한다. + 공통/선택 자동 감지(개학 후 정상 주간).
 */
export function HomeroomTimetableSync() {
  const [state, action, pending] = useActionState<HomeroomSyncState, FormData>(
    syncHomeroomTimetableAction,
    null,
  );
  const [detectState, detectAction, detecting] = useActionState<
    AutoDetectState,
    FormData
  >(autoDetectFixedClassesAction, null);
  const [applyState, applyAction, applying] = useActionState<
    ApplyFixedState,
    FormData
  >(applyFixedClassesAction, null);
  const preview = detectState?.ok ? detectState : null;

  return (
    <div className="mt-4 rounded-lg border border-neutral-200 p-4 text-sm">
      <form action={action}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4>담임반 시간표 동기화</h4>
            <p className="mt-1 text-xs text-neutral-500">
              컴시간에서 담임반 시간표를 가져와 학생 안내 페이지에 표시합니다.
            </p>
          </div>
          <Button
            type="submit"
            disabled={pending}
            className="shrink-0 px-4 py-2 text-sm font-normal disabled:opacity-60"
          >
            {pending ? "동기화 중…" : "담임반 동기화"}
          </Button>
        </div>

        {state && state.ok && (
          <p role="status" className="mt-3 rounded border border-green-200 bg-green-50 p-2 text-xs text-green-800">
            ✅ {state.grade}학년 {state.classNo}반 시간표 {state.slots}칸 동기화
          </p>
        )}
        {state && !state.ok && (
          <p role="status" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {state.message}
          </p>
        )}
      </form>

      <div className="mt-3 border-t border-neutral-100 pt-3">
        <form action={detectAction}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4>공통·선택 과목 자동 감지</h4>
              <p className="mt-1 text-xs text-neutral-500">
                컴시간 편성으로 반 전체 공통과목과 학생별 선택과목을 자동 구분합니다.
                감지 결과를 확인한 뒤 적용합니다.
                <span className="text-amber-600">
                  {" "}
                  정상 수업 주간(개학 후)에만 정확합니다.
                </span>
              </p>
            </div>
            <Button
              type="submit"
              disabled={detecting || applying}
              className="shrink-0 px-4 py-2 text-sm font-normal disabled:opacity-60"
            >
              {detecting ? "감지 중…" : preview ? "다시 감지" : "자동 감지"}
            </Button>
          </div>
          {detectState && !detectState.ok && (
            <p role="status" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {detectState.message}
            </p>
          )}
        </form>

        {/* 미리보기 — 적용 성공 후에는 성공 메시지로 대체 */}
        {preview && !(applyState && applyState.ok) && (
          <div className="mt-3 rounded border border-neutral-200 bg-neutral-50 p-3">
            <p className="text-xs text-neutral-600">
              {preview.grade}학년 {preview.classNo}반 감지 결과 — 확인 후 적용하세요.
              <span className="text-neutral-400"> (★ = 현재 설정과 달라짐)</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {preview.detected.map((d) => (
                <span
                  key={d.subjectName}
                  className={`rounded px-2 py-0.5 text-xs ${
                    d.isFixed
                      ? "bg-green-100 text-green-800"
                      : "bg-neutral-200 text-neutral-700"
                  }`}
                >
                  {d.subjectName} {d.isFixed ? "공통" : "선택"}
                  {d.changed && <span className="ml-0.5 text-amber-600">★</span>}
                </span>
              ))}
            </div>
            {preview.unclassified.length > 0 && (
              <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
                이번 주 편성에 없어 판별 못 한 과목: {preview.unclassified.join(", ")} — 저장 시
                건드리지 않습니다. 수동으로 확인하세요.
              </p>
            )}
            <form action={applyAction} className="mt-3">
              <input
                type="hidden"
                name="detected"
                value={JSON.stringify(
                  preview.detected.map((d) => ({
                    subjectName: d.subjectName,
                    isFixed: d.isFixed,
                  })),
                )}
              />
              <Button
                type="submit"
                disabled={applying}
                className="px-4 py-2 text-sm font-normal disabled:opacity-60"
              >
                {applying ? "적용 중…" : "이대로 적용"}
              </Button>
              {applyState && !applyState.ok && (
                <p role="status" className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  {applyState.message}
                </p>
              )}
            </form>
          </div>
        )}

        {applyState && applyState.ok && (
          <p role="status" className="mt-3 rounded border border-green-200 bg-green-50 p-2 text-xs text-green-800">
            ✅ {applyState.grade}학년 {applyState.classNo}반 — 공통 {applyState.fixed}과목 ·
            선택 {applyState.elective}과목으로 저장했습니다.
          </p>
        )}
      </div>
    </div>
  );
}
