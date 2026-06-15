"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { NudgeResult } from "@/lib/domain/nudge";

/**
 * 오늘의 학교 넛지 모달 (QC v4 AC-7.1). 진입마다 표시하되, 닫으면 그 세션 동안
 * 다시 뜨지 않는다(sessionStorage 플래그). 새로고침/재진입(새 세션 아님)에도
 * 닫은 상태가 유지되며, 탭을 닫았다 새로 열면(새 세션) 다시 표시된다.
 *
 * 각 넛지는 사전선택 딥링크로 이동(AC-7.3/7.5/7.6). 데스크톱 홈(/)은 모달이 아닌
 * 배너(NudgeBanner)를 쓰므로 이 컴포넌트는 /today 전용이다.
 */
const DISMISS_KEY = "today-nudge-dismissed";

export function TodayNudgeModal({ nudges }: { nudges: NudgeResult }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!nudges.hasAny) return;
    const dismissed = sessionStorage.getItem(DISMISS_KEY) === "1";
    if (!dismissed) setOpen(true);
  }, [nudges.hasAny]);

  function close() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={close}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-neutral-800">오늘 해야 할 일</h2>
          <button
            type="button"
            onClick={close}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <ul className="mt-4 space-y-2 text-sm text-neutral-700">
          {nudges.unrecordedObservations.map((o) => (
            <li
              key={o.sectionKey}
              className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
            >
              <span>
                <span className="text-amber-700">{o.sectionLabel}</span> 관찰:{" "}
                <strong>{o.suggestedStudentName ?? "학생"}</strong>
                {o.candidateCount > 1 && ` 외 ${o.candidateCount - 1}명`}
              </span>
              <Link
                href={`/classroom/observations?studentYearId=${o.suggestedStudentId}&sectionId=${o.sectionKey}`}
                onClick={close}
                className="shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs text-white hover:bg-neutral-700"
              >
                기록
              </Link>
            </li>
          ))}

          {nudges.behaviorNotes && (
            <li className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <span>행동특성 미작성 {nudges.behaviorNotes.pendingCount}명</span>
              <Link
                href="/homeroom/behavior"
                onClick={close}
                className="shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs text-white hover:bg-neutral-700"
              >
                기록
              </Link>
            </li>
          )}

          {nudges.pendingReports && (
            <li className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <span>
                미제출 신고서 {nudges.pendingReports.total}건
                {nudges.pendingReports.critical > 0 && (
                  <span className="ml-1 font-semibold text-red-600">
                    심각 {nudges.pendingReports.critical}
                  </span>
                )}
              </span>
              <Link
                href="/homeroom/attendance?view=unsubmitted"
                onClick={close}
                className="shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs text-white hover:bg-neutral-700"
              >
                확인하기
              </Link>
            </li>
          )}
        </ul>

        <button
          type="button"
          onClick={close}
          className="mt-5 w-full rounded-lg border border-neutral-300 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
        >
          나중에 하기
        </button>
      </div>
    </div>
  );
}
