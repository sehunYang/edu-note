import Link from "next/link";
import type { NudgeResult } from "@/lib/domain/nudge";

/**
 * 강제 넛지 배너 (계획 §3.4 / QC v4 AC-7). 해소 전까지 데스크톱 홈 상단에 노출
 * (모바일 /today 는 모달). 각 항목은 해당 작업 화면으로 사전선택 딥링크 이동시킨다.
 *  - 교과 관찰: 오늘 분반 수업당 1개(학생·분반 사전선택, AC-7.3).
 *  - 행동특성: 담임반 하루 1명(종일, AC-7.5).
 *  - 미제출 신고서: 출결 미제출 탭 리다이렉트(AC-7.6).
 */
export function NudgeBanner({ nudges }: { nudges: NudgeResult }) {
  if (!nudges.hasAny) return null;

  return (
    <section className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <h2 className="text-sm font-semibold text-amber-800">오늘의 할 일 알림</h2>
      <ul className="mt-2 space-y-1.5 text-sm text-amber-900">
        {nudges.unrecordedObservations.map((o) => (
          <li
            key={o.sectionKey}
            className="flex items-center justify-between gap-2"
          >
            <span>
              <span className="text-amber-700">{o.sectionLabel}</span> 관찰 추천:{" "}
              <strong>{o.suggestedStudentName ?? "학생"}</strong>
              {o.candidateCount > 1 && ` 외 ${o.candidateCount - 1}명`}
            </span>
            <Link
              href={`/classroom/observations?studentYearId=${o.suggestedStudentId}&sectionId=${o.sectionKey}`}
              className="shrink-0 underline"
            >
              기록하기 →
            </Link>
          </li>
        ))}
        {nudges.behaviorNotes && (
          <li className="flex items-center justify-between gap-2">
            <span>오늘 행동특성 미작성 {nudges.behaviorNotes.pendingCount}명</span>
            <Link href="/homeroom/behavior" className="shrink-0 underline">
              행특 쓰기 →
            </Link>
          </li>
        )}
        {nudges.pendingCounselLogs.map((c) => (
          <li
            key={c.reservationId}
            className="flex items-center justify-between gap-2"
          >
            <span>
              상담일지 미작성 <strong>{c.studentLabel}</strong>
              <span className="ml-1 text-xs">({c.date})</span>
            </span>
            <Link
              href={`/homeroom/counsel?studentYearId=${c.studentYearId}`}
              className="shrink-0 underline"
            >
              상담일지 쓰기 →
            </Link>
          </li>
        ))}
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
            <Link
              href="/homeroom/attendance?view=unsubmitted"
              className="shrink-0 underline"
            >
              확인하기 →
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}
