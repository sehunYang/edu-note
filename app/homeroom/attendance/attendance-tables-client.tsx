"use client";
import { useState } from "react";
import { Paginator } from "@/lib/ui/paginator";
import { paginate } from "@/lib/db/pagination";
import {
  toggleReportSubmittedAction,
  deleteAttendanceAction,
  updateAttendanceAction,
  markUnsubmittedSubmittedAction,
} from "./actions";
import type { AttendanceStudentRow } from "@/lib/db/queries";
import { Button } from "@/app/ui/button";

/**
 * 출결 목록 클라이언트 (QC v4 US-4, AC-4.5~4.7).
 * - 월별/학생별/미제출/교외체험 목록 10개씩 페이지네이션(공용 Paginator).
 * - 출결 기록 인라인 수정(사유/성격/비고) — 삭제만 가능하던 기존 동작 확장.
 */
const PAGE_SIZE = 10;

const REASON_LABEL: Record<string, string> = {
  illness: "질병",
  accepted: "인정",
  unaccepted: "미인정",
  etc: "기타",
};
const KIND_LABEL: Record<string, string> = {
  late: "지각",
  early_leave: "조퇴",
  absent_period: "결과",
  absent: "결석",
};
const REASONS = ["illness", "accepted", "unaccepted", "etc"] as const;
const KINDS = ["late", "early_leave", "absent_period", "absent"] as const;

/** 교시 배열 → 라벨(조회=0). */
function periodsLabel(periods: number[] | null): string {
  if (!periods || periods.length === 0) return "—";
  return periods.map((p) => (p === 0 ? "조회" : `${p}교시`)).join(", ");
}

/** 수정 가능한 출결 기록 테이블(인라인 편집 + 신고서 토글 + 삭제) + 페이지네이션. */
export function EditableAttendanceTable({
  rows,
  withDate = false,
}: {
  rows: AttendanceStudentRow[];
  withDate?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { pageItems, totalPages, currentPage } = paginate(rows, page, PAGE_SIZE);

  if (rows.length === 0) {
    return <p className="mt-3 text-sm text-neutral-400">출결 기록이 없습니다.</p>;
  }

  return (
    <>
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-neutral-400">
          <tr>
            <th className="py-1 font-normal">학생</th>
            {withDate && <th className="py-1 font-normal">날짜</th>}
            <th className="py-1 font-normal">성격</th>
            <th className="py-1 font-normal">교시</th>
            <th className="py-1 font-normal">사유</th>
            <th className="py-1 font-normal">신고서</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {pageItems.map((r) =>
            editingId === r.id ? (
              <tr key={r.id} className="border-t border-neutral-100 bg-neutral-50">
                <td className="py-2">
                  {r.sid} {r.name}
                </td>
                {withDate && <td className="py-2">{r.date}</td>}
                <td colSpan={4} className="py-2">
                  <form
                    action={updateAttendanceAction}
                    className="flex flex-wrap items-center gap-2"
                    onSubmit={() => setEditingId(null)}
                  >
                    <input type="hidden" name="id" value={r.id} />
                    <select
                      name="kind"
                      defaultValue={r.kind}
                      className="rounded border border-neutral-300 px-2 py-1 text-xs"
                    >
                      {KINDS.map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                    <select
                      name="reason"
                      defaultValue={r.reason}
                      className="rounded border border-neutral-300 px-2 py-1 text-xs"
                    >
                      {REASONS.map((rs) => (
                        <option key={rs} value={rs}>
                          {REASON_LABEL[rs]}
                        </option>
                      ))}
                    </select>
                    <input
                      name="noteField"
                      defaultValue={r.noteField ?? ""}
                      placeholder="비고"
                      className="rounded border border-neutral-300 px-2 py-1 text-xs"
                    />
                    <Button className="px-2 py-1 text-xs">
                      저장
                    </Button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-xs text-neutral-500 hover:underline"
                    >
                      취소
                    </button>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={r.id} className="border-t border-neutral-100">
                <td className="py-2">
                  {r.sid} {r.name}
                </td>
                {withDate && <td className="py-2">{r.date}</td>}
                <td className="py-2">{KIND_LABEL[r.kind]}</td>
                <td className="py-2 text-xs text-neutral-500">
                  {periodsLabel(r.periods)}
                </td>
                <td className="py-2">
                  {REASON_LABEL[r.reason]}
                  {r.noteField ? (
                    <span className="ml-1 text-xs text-neutral-400">({r.noteField})</span>
                  ) : null}
                </td>
                <td className="py-2">
                  {r.reportRequired ? (
                    <form action={toggleReportSubmittedAction} className="inline">
                      <input type="hidden" name="id" value={r.id} />
                      <input
                        type="hidden"
                        name="submitted"
                        value={(!r.reportSubmitted).toString()}
                      />
                      <button
                        className={`rounded border px-2 py-0.5 text-xs ${
                          r.reportSubmitted
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-amber-300 bg-amber-50 text-amber-700"
                        }`}
                      >
                        {r.reportSubmitted ? "제출됨" : "미제출"}
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-neutral-300">불필요</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setEditingId(r.id)}
                    className="mr-2 text-xs text-neutral-500 hover:underline"
                  >
                    수정
                  </button>
                  <form action={deleteAttendanceAction} className="inline">
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-xs text-red-500 hover:underline">삭제</button>
                  </form>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      <Paginator
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        className="mt-3"
      />
    </>
  );
}

export interface UnsubmittedRow extends AttendanceStudentRow {
  deadlineDate: string | null;
  remainingSchoolDays: number | null;
  tier: "normal" | "warning" | "critical";
  /** 출처: attendance=출결 신고서(id=attendance_record), fieldTrip=교외체험 사후보고서(id=field_trip). */
  source: "attendance" | "fieldTrip";
}

const SOURCE_LABEL: Record<string, string> = {
  attendance: "출결",
  fieldTrip: "교외체험",
};

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

/** 미제출 신고서 목록(페이지네이션 10). */
export function UnsubmittedTable({ rows }: { rows: UnsubmittedRow[] }) {
  const [page, setPage] = useState(1);
  const { pageItems, totalPages, currentPage } = paginate(rows, page, PAGE_SIZE);

  if (rows.length === 0) {
    return <p className="mt-3 text-sm text-neutral-400">미제출 신고서가 없습니다.</p>;
  }
  return (
    <>
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-neutral-400">
          <tr>
            <th className="py-1 font-normal">학생</th>
            <th className="py-1 font-normal">날짜</th>
            <th className="py-1 font-normal">성격</th>
            <th className="py-1 font-normal">교시</th>
            <th className="py-1 font-normal">마감</th>
            <th className="py-1 font-normal">상태</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {pageItems.map((r) => (
            <tr key={r.id} className="border-t border-neutral-100">
              <td className="py-2">
                {r.sid} {r.name}
              </td>
              <td className="py-2">{r.date}</td>
              <td className="py-2">
                {KIND_LABEL[r.kind]}
                <span className="ml-1 text-xs text-neutral-400">
                  ({SOURCE_LABEL[r.source]})
                </span>
              </td>
              <td className="py-2 text-xs text-neutral-500">{periodsLabel(r.periods)}</td>
              <td className="py-2 text-xs text-neutral-500">
                {r.deadlineDate ?? "—"}
                {r.remainingSchoolDays != null && (
                  <span className="ml-1 text-neutral-400">
                    ({r.remainingSchoolDays >= 0
                      ? `D-${r.remainingSchoolDays}`
                      : `+${-r.remainingSchoolDays}`}
                    )
                  </span>
                )}
              </td>
              <td className={`py-2 text-xs ${TIER_CLASS[r.tier]}`}>
                {TIER_LABEL[r.tier]}
              </td>
              <td className="py-2 text-right">
                <form action={markUnsubmittedSubmittedAction} className="inline">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="source" value={r.source} />
                  <button className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                    제출 처리
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Paginator
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        className="mt-3"
      />
    </>
  );
}
