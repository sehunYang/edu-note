import Link from "next/link";
import type { NudgeResult } from "@/lib/domain/nudge";

/**
 * 강제 넛지 배너 (계획 §3.4 nudgeEngine, AC-C). 해소 전까지 홈 상단에 노출.
 * 각 항목은 해당 작업 화면으로 바로 이동시킨다.
 */
export function NudgeBanner({
  nudges,
  suggestedStudentLabel,
}: {
  nudges: NudgeResult;
  suggestedStudentLabel: string | null;
}) {
  if (!nudges.hasAny) return null;

  return (
    <section className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <h2 className="text-sm font-semibold text-amber-800">오늘의 할 일 알림</h2>
      <ul className="mt-2 space-y-1.5 text-sm text-amber-900">
        {nudges.unrecordedObservation && (
          <li className="flex items-center justify-between gap-2">
            <span>
              관찰기록 추천:{" "}
              <strong>{suggestedStudentLabel ?? "학생"}</strong> 외{" "}
              {Math.max(0, nudges.unrecordedObservation.candidateCount - 1)}명
            </span>
            <Link href="/observations" className="shrink-0 underline">
              기록하기 →
            </Link>
          </li>
        )}
        {nudges.behaviorNotes && (
          <li className="flex items-center justify-between gap-2">
            <span>
              오늘 행동특성 미작성 {nudges.behaviorNotes.pendingCount}명 (16시 이후)
            </span>
            <Link href="/observations" className="shrink-0 underline">
              행특 쓰기 →
            </Link>
          </li>
        )}
        {nudges.pendingReports && (
          <li className="flex items-center justify-between gap-2">
            <span>
              미제출 신고서 {nudges.pendingReports.total}건
              {nudges.pendingReports.critical > 0 && (
                <span className="ml-1 font-semibold text-red-600">
                  (심각 {nudges.pendingReports.critical})
                </span>
              )}
              {nudges.pendingReports.warning > 0 && (
                <span className="ml-1 text-orange-600">
                  (위험 {nudges.pendingReports.warning})
                </span>
              )}
            </span>
            <Link href="/homeroom/attendance" className="shrink-0 underline">
              확인하기 →
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}
