"use client";
import { useState } from "react";
import { Paginator } from "@/lib/ui/paginator";
import { paginate } from "@/lib/db/pagination";
import {
  addFieldTripAction,
  toggleFieldTripAction,
  updateFieldTripAction,
  deleteFieldTripAction,
} from "./actions";
import type { FieldTripRow } from "@/lib/db/queries";
import { Button } from "@/app/ui/button";
import { ConfirmButton } from "@/app/ui/confirm-button";

/**
 * 교외체험학습 사후보고서 (QC v4 US-4, AC-4.2/4.6/4.7).
 * - 기간(시작~종료, 종료 선택=당일) 입력 → 수업일마다 인정결석 자동 생성.
 * - 목록 10개 페이지네이션. "교외체험학습 등록" 별도 탭에서 렌더.
 * - 인라인 수정(학생·기간)과 삭제 — 자동 생성된 인정결석도 함께 바뀐다(서버액션).
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

/** 인라인 수정 폼 — 등록 폼과 같은 칸(학생·시작·종료). */
function EditFieldTripForm({
  trip,
  students,
  onDone,
}: {
  trip: FieldTripRow;
  students: FieldTripStudent[];
  onDone: () => void;
}) {
  const [startDate, setStartDate] = useState(trip.startDate ?? trip.tripDate);
  // 목록은 올해 담임반이지만 체험 목록은 연도 제한이 없다. 이 체험의 학생이 목록에
  // 없으면 그대로 두어야 한다 — 없는 값을 select 에 주면 브라우저가 첫 학생을 골라
  // 저장 한 번에 엉뚱한 학생에게 옮겨진다.
  const ownStudentMissing = !students.some((s) => s.id === trip.studentYearId);
  return (
    <form
      action={updateFieldTripAction}
      onSubmit={onDone}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="id" value={trip.id} />
      <select aria-label="학생"
        name="studentYearId"
        defaultValue={trip.studentYearId}
        required
        className="rounded border border-neutral-300 px-2 py-1 text-xs"
      >
        {ownStudentMissing && (
          <option value={trip.studentYearId}>
            {trip.sid} {trip.name}
          </option>
        )}
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.sid} {s.name}
          </option>
        ))}
      </select>
      <label className="text-xs text-neutral-500">시작</label>
      <input aria-label="시작"
        type="date"
        name="startDate"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        required
        className="rounded border border-neutral-300 px-2 py-1 text-xs"
      />
      <label className="text-xs text-neutral-500">종료(선택=당일)</label>
      <input aria-label="종료(선택=당일)"
        type="date"
        name="endDate"
        defaultValue={trip.endDate ?? ""}
        min={startDate}
        className="rounded border border-neutral-300 px-2 py-1 text-xs"
      />
      <Button className="px-2 py-1 text-xs">저장</Button>
      <button
        type="button"
        onClick={onDone}
        className="text-xs text-neutral-500 hover:underline"
      >
        취소
      </button>
    </form>
  );
}

export function FieldTripSection({
  students,
  trips,
}: {
  students: FieldTripStudent[];
  trips: FieldTripRow[];
}) {
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { pageItems, totalPages, currentPage } = paginate(trips, page, PAGE_SIZE);

  return (
    <>
      {students.length > 0 && (
        <form
          action={addFieldTripAction}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <select aria-label="학생"
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
          <input aria-label="시작"
            type="date"
            name="startDate"
            required
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          />
          <label className="text-xs text-neutral-500">종료(선택=당일)</label>
          <input aria-label="종료(선택=당일)"
            type="date"
            name="endDate"
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          />
          <Button className="px-3 py-1 text-sm">
            체험 추가
          </Button>
        </form>
      )}

      {trips.length > 0 && (
        <>
          <ul className="mt-3 space-y-1 text-sm">
            {pageItems.map((t) =>
              editingId === t.id ? (
                <li
                  key={t.id}
                  className="border-t border-neutral-100 bg-neutral-50 py-2"
                >
                  <EditFieldTripForm
                    trip={t}
                    students={students}
                    onDone={() => setEditingId(null)}
                  />
                </li>
              ) : (
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
                  <span className="flex shrink-0 items-center gap-2">
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
                    <button
                      type="button"
                      onClick={() => setEditingId(t.id)}
                      className="text-xs text-neutral-500 hover:underline"
                    >
                      수정
                    </button>
                    <form action={deleteFieldTripAction} className="inline">
                      <input type="hidden" name="id" value={t.id} />
                      <ConfirmButton
                        message="이 교외체험학습을 삭제할까요? 자동 생성된 인정결석 출결도 함께 삭제됩니다."
                        className="text-xs text-red-500 hover:underline"
                      >
                        삭제
                      </ConfirmButton>
                    </form>
                  </span>
                </li>
              ),
            )}
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
