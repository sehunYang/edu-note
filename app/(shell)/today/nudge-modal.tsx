"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { NudgeResult } from "@/lib/domain/nudge";
import { Button } from "@/app/ui/button";

/**
 * 오늘의 학교 넛지 모달 (QC v5 c7 B.1). 해결 전까지 /today 진입마다 표시한다.
 * sessionStorage dismiss 로직은 제거됨 — 새로고침/재진입에도 매번 다시 뜬다(AC-7.1).
 *
 * "다음에 하기"(또는 ✕/배경 클릭)는 **모달 state 만 닫는다**. 상단 넛지 배너
 * (NudgeBanner)는 별도 컴포넌트로 같은 nudges 를 읽으므로 모달을 닫아도 유지된다
 * (AC-7.2). 각 넛지는 사전선택 딥링크로 이동. 이 컴포넌트는 /today 전용.
 */
export function TodayNudgeModal({ nudges }: { nudges: NudgeResult }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (nudges.hasAny) setOpen(true);
  }, [nudges.hasAny]);

  // 모달 state 만 닫는다(배너는 영향 없음 — AC-7.2).
  function close() {
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in-up items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={close}
    >
      <div
        className="w-full max-w-md animate-scale-in rounded-xl bg-card p-6 border border-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-normal text-neutral-800">오늘 해야 할 일</h2>
          <button
            type="button"
            onClick={close}
            className="rounded p-1 text-neutral-400 hover:bg-white/10 hover:text-neutral-600"
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
                className="shrink-0 rounded-full border border-white/25 bg-transparent px-2 py-1 text-xs text-white hover:bg-white/10"
              >
                기록
              </Link>
            </li>
          ))}

          {nudges.behaviorNotes && (
            <li className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <span>
                행동특성 기록 추천:{" "}
                <strong>{nudges.behaviorNotes.suggestedStudentName ?? "학생"}</strong>
                {nudges.behaviorNotes.pendingCount > 1 &&
                  ` (미작성 ${nudges.behaviorNotes.pendingCount}명)`}
              </span>
              <Link
                href={
                  nudges.behaviorNotes.suggestedStudentId
                    ? `/homeroom/behavior?studentYearId=${nudges.behaviorNotes.suggestedStudentId}`
                    : "/homeroom/behavior"
                }
                onClick={close}
                className="shrink-0 rounded-full border border-white/25 bg-transparent px-2 py-1 text-xs text-white hover:bg-white/10"
              >
                기록
              </Link>
            </li>
          )}

          {nudges.pendingCounselLogs.map((c) => (
            <li
              key={c.reservationId}
              className="flex items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2"
            >
              <span>
                상담일지 미작성 <strong>{c.studentLabel}</strong>
                <span className="ml-1 text-xs text-sky-600">({c.date})</span>
              </span>
              <Link
                href={`/homeroom/counsel?studentYearId=${c.studentYearId}`}
                onClick={close}
                className="shrink-0 rounded-full border border-white/25 bg-transparent px-2 py-1 text-xs text-white hover:bg-white/10"
              >
                작성
              </Link>
            </li>
          ))}

          {nudges.pendingReports && (
            <li className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <span>
                미제출 신고서 {nudges.pendingReports.total}건
                {nudges.pendingReports.critical > 0 && (
                  <span className="ml-1 font-normal text-red-600">
                    심각 {nudges.pendingReports.critical}
                  </span>
                )}
              </span>
              <Link
                href="/homeroom/attendance?view=unsubmitted"
                onClick={close}
                className="shrink-0 rounded-full border border-white/25 bg-transparent px-2 py-1 text-xs text-white hover:bg-white/10"
              >
                확인하기
              </Link>
            </li>
          )}
        </ul>

        <Button
          type="button"
          onClick={close}
          className="mt-5 w-full py-2 text-sm text-neutral-600"
        >
          다음에 하기
        </Button>
      </div>
    </div>
  );
}
