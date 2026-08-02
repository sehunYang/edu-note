"use client";
import { useState } from "react";
import Link from "next/link";
import type { AlertEntry, AlertKind, SystemicAlert } from "@/lib/domain/stats-alerts";

/**
 * 이상징후 경보 패널 (사용성 개선 P0-1).
 *
 * 이전 구현은 판정된 학생 전원을 카드로 펼쳐 화면 8,553px(전체 페이지의 57%)을
 * 차지했고, 실제 통계 차트는 9.7화면 아래로 밀렸다. 카드에는 링크가 하나도 없어
 * 경보를 보고도 조치할 수 없었다. 여기서는 세 가지를 바꾼다.
 *  1. 모집단 과반에서 난 종류는 서버(summarizeAlerts)에서 이미 systemic 으로
 *     접혀 오고, 이 컴포넌트는 그것을 요약 1줄로 렌더한다.
 *  2. 개별 경보는 심각도 상위 VISIBLE_COUNT 건만 기본 노출하고 나머지는 접는다.
 *  3. 각 사유에 조치 화면 딥링크를 붙여 경보 → 작업이 1클릭이 되게 한다.
 */

const VISIBLE_COUNT = 5;

const KIND_LABEL: Record<AlertKind, string> = {
  attendance: "출결 급증",
  gradeDrop: "성적 급락",
  recordGap: "기록 공백",
};

/** 사유 종류별 조치 화면. 학생을 사전선택해 바로 기입할 수 있게 한다. */
function actionFor(
  kind: AlertKind,
  studentYearId: string,
  isHomeroomStudent: boolean,
): { href: string; label: string } {
  switch (kind) {
    case "attendance":
      return {
        href: `/homeroom/attendance?view=student&studentYearId=${studentYearId}`,
        label: "출결 보기",
      };
    case "gradeDrop":
      return { href: "/classroom/grades", label: "성적 보기" };
    case "recordGap":
      return isHomeroomStudent
        ? {
            href: `/homeroom/behavior?studentYearId=${studentYearId}`,
            label: "행특 쓰기",
          }
        : {
            href: `/classroom/observations?studentYearId=${studentYearId}`,
            label: "관찰 쓰기",
          };
  }
}

export interface AlertPanelEntry extends AlertEntry {
  isHomeroomStudent: boolean;
}

export function AlertPanel({
  individual,
  systemic,
  cohortSize,
}: {
  individual: AlertPanelEntry[];
  systemic: SystemicAlert[];
  cohortSize: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hidden = Math.max(0, individual.length - VISIBLE_COUNT);
  const shown = expanded ? individual : individual.slice(0, VISIBLE_COUNT);

  return (
    <section className="mt-6 rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm text-neutral-700">이상징후 경보</h2>
        {individual.length > 0 && (
          <p className="text-xs text-neutral-500">
            개입 필요 <span className="tabular-nums">{individual.length}</span>명 ·
            전체 <span className="tabular-nums">{cohortSize}</span>명
          </p>
        )}
      </div>

      {/* 모집단 과반 종류 — 개별 경보가 아니라 현재 상태로 1줄 요약 */}
      {systemic.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {systemic.map((s) => (
            <li
              key={s.kind}
              className="rounded-md border border-neutral-200 px-3 py-2 text-xs text-neutral-500"
            >
              {KIND_LABEL[s.kind]}이 전체 {cohortSize}명 중{" "}
              <span className="tabular-nums text-neutral-300">{s.count}명</span>(
              {Math.round(s.ratio * 100)}%)에게 해당해 개별 경보에서 제외했습니다 —
              특정 학생의 이상이 아니라 학급 전체 상태입니다.
            </li>
          ))}
        </ul>
      )}

      {individual.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-400">
          {systemic.length > 0
            ? "개별 개입이 필요한 학생은 없습니다."
            : "특이사항 없음"}
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {shown.map((a) => (
              <li key={a.studentYearId} className="rounded-md bg-red-50 p-3 text-sm">
                <span className="font-normal text-red-700">{a.name}</span>
                <ul className="mt-1 space-y-1 text-xs text-red-600">
                  {a.reasons.map((r, i) => {
                    const action = actionFor(
                      r.kind,
                      a.studentYearId,
                      a.isHomeroomStudent,
                    );
                    return (
                      <li
                        key={i}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <span>· {r.text}</span>
                        <Link
                          href={action.href}
                          className="shrink-0 rounded-full border border-red-300 px-2 py-1 text-xs text-red-500 hover:bg-red-100"
                        >
                          {action.label} →
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>

          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-3 min-h-11 w-full rounded-lg border border-neutral-200 px-3 text-sm text-neutral-500 hover:bg-white/5"
            >
              {expanded ? "접기" : `나머지 ${hidden}명 펼치기`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
