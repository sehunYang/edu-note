"use client";
import { useState } from "react";
import { Paginator } from "@/lib/ui/paginator";
import { paginate } from "@/lib/db/pagination";
import { addFieldTripAction, toggleFieldTripAction } from "./actions";
import type { FieldTripRow } from "@/lib/db/queries";

/**
 * 교외체험학습 사후보고서 (QC v4 US-4, AC-4.2/4.6/4.7).
 * - 기간(시작~종료, 종료 선택=당일) 입력 → 수업일마다 인정결석 자동 생성.
 * - 목록 10개 페이지네이션. "교외체험학습 등록" 별도 탭에서 렌더.
 */
const PAGE_SIZE = 10;

const TIER_LABEL: Record<string, string> = {
  normal: "정상",
  warning: "위험",
  critical: "심각",
};
const TIER_CLASS: Record<string, string> = {
  normal: "text-neutral-400",
  warning: "text-orange-600",
  critical: "font-normal text-red-600",
};

export interface FieldTripStudent {
  id: string;
  sid: string;
  name: string;
}

/** 체험 기간 라벨(당일이면 단일 날짜). */
function rangeLabel(t: FieldTripRow): string {
  const start = t.startDate ?? t.tripDate;
  const end = t.endDate ?? t.tripDate;
  return start === end ? start : `${start} ~ ${end}`;
}

export function FieldTripSection({
  students,
  trips,
}: {
  students: FieldTripStudent[];
  trips: FieldTripRow[];
}) {
  const [page, setPage] = useState(1);
  const { pageItems, totalPages, currentPage } = paginate(trips, page, PAGE_SIZE);

  return (
    <>
      {students.length > 0 && (
        <form
          action={addFieldTripAction}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <select
            name="studentYearId"
            required
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.sid} {s.name}
              </option>
            ))}
          </select>
          <label className="text-xs text-neutral-500">시작</label>
          <input
            type="date"
            name="startDate"
            required
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          />
          <label className="text-xs text-neutral-500">종료(선택=당일)</label>
          <input
            type="date"
            name="endDate"
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          />
          <button className="rounded-full border border-white/25 bg-transparent px-3 py-1 text-sm text-white hover:bg-white/10">
            체험 추가
          </button>
        </form>
      )}

      {trips.length > 0 && (
        <>
          <ul className="mt-3 space-y-1 text-sm">
            {pageItems.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 border-t border-neutral-100 py-2"
              >
                <span>
                  {t.sid} {t.name} · 체험 {rangeLabel(t)}
                  {t.deadlineDate && (
                    <span className="ml-2 text-xs text-neutral-400">
                      마감 {t.deadlineDate}
                    </span>
                  )}
                  {!t.postReportSubmitted && (
                    <span className={`ml-2 text-xs ${TIER_CLASS[t.tier]}`}>
                      {TIER_LABEL[t.tier]}
                    </span>
                  )}
                </span>
                <form action={toggleFieldTripAction} className="inline">
                  <input type="hidden" name="id" value={t.id} />
                  <input
                    type="hidden"
                    name="submitted"
                    value={(!t.postReportSubmitted).toString()}
                  />
                  <button
                    className={`rounded border px-2 py-0.5 text-xs ${
                      t.postReportSubmitted
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-amber-300 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {t.postReportSubmitted ? "제출됨" : "미제출"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <Paginator
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
            className="mt-3"
          />
        </>
      )}
    </>
  );
}
