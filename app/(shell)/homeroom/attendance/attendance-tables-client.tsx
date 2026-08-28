"use client";
import { useState } from "react";
import Link from "next/link";
import { Paginator } from "@/lib/ui/paginator";
import { paginate } from "@/lib/db/pagination";
import {
  toggleReportSubmittedAction,
  deleteAttendanceAction,
  updateAttendanceAction,
  markUnsubmittedSubmittedAction,
} from "./actions";
import type { AttendanceStudentRow } from "@/lib/db/queries";
import type { SubmissionTier } from "@/lib/domain/attendance";
import { Button } from "@/app/ui/button";
import { ATTENDANCE_KIND_CHIP, ATTENDANCE_REASON_CHIP } from "@/lib/domain/attendance-display";
import { ConfirmButton } from "@/app/ui/confirm-button";

/**
 * 출결 목록 클라이언트 (QC v4 US-4, AC-4.5~4.7).
 * - 월별/학생별/미제출/교외체험 목록 10개씩 페이지네이션(공용 Paginator).
 * - 출결 기록 인라인 수정(사유/성격/비고/교시) — 지조결은 교시도 함께 수정.
 * - 학생/날짜 링크는 월별뿐 아니라 오늘 입력·학생별·미제출에서도 각자 켠다.
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

// 조회=0, 이후 1..7교시 (attendance-period-client 와 동일 목록).
const PERIODS = Array.from({ length: 8 }, (_, i) => i);

function periodLabel(p: number): string {
  return p === 0 ? "조회" : `${p}교시`;
}

/** 교시 배열 → 라벨(조회=0). */
function periodsLabel(periods: number[] | null): string {
  if (!periods || periods.length === 0) return "—";
  return periods.map((p) => (p === 0 ? "조회" : `${p}교시`)).join(", ");
}

/** 학생별 검색 뷰 링크. */
function studentHref(studentYearId: string): string {
  return `/homeroom/attendance?view=student&studentYearId=${studentYearId}`;
}

/** 해당 날짜의 오늘 입력 뷰 링크. */
function dateHref(date: string): string {
  return `/homeroom/attendance?view=today&date=${date}`;
}

/** 저장된 periods 에서 지각/조퇴 기점을 복원한다(지각=최대, 조퇴=최소). */
function initialPivot(kind: string, periods: number[] | null): number {
  if (!periods || periods.length === 0) return 0;
  if (kind === "late") return Math.max(...periods);
  if (kind === "early_leave") return Math.min(...periods);
  return 0;
}

/**
 * 인라인 수정 폼. 성격을 바꾸면 교시 입력도 그 성격의 방식으로 바뀐다
 * (지각/조퇴=기점 라디오, 결과=다중 체크, 결석=전체라 입력 없음) — 신규 입력
 * (AttendancePeriodClient)과 같은 규칙. 서버가 absentPeriods 로 재파생한다.
 */
function EditAttendanceForm({
  row,
  onDone,
}: {
  row: AttendanceStudentRow;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<string>(row.kind);
  const [pivotPeriod, setPivotPeriod] = useState(() =>
    initialPivot(row.kind, row.periods),
  );
  const [selected, setSelected] = useState<number[]>(() =>
    row.kind === "absent_period" ? (row.periods ?? []) : [],
  );

  const showPivot = kind === "late" || kind === "early_leave";
  const showMulti = kind === "absent_period";

  function toggle(p: number) {
    setSelected((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
    );
  }

  return (
    <form
      action={updateAttendanceAction}
      className="space-y-2"
      onSubmit={onDone}
    >
      <input type="hidden" name="id" value={row.id} />
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="출결 성격"
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 text-xs"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <select aria-label="출결 사유"
          name="reason"
          defaultValue={row.reason}
          className="rounded border border-neutral-300 px-2 py-1 text-xs"
        >
          {REASONS.map((rs) => (
            <option key={rs} value={rs}>
              {REASON_LABEL[rs]}
            </option>
          ))}
        </select>
        <input aria-label="비고"
          name="noteField"
          defaultValue={row.noteField ?? ""}
          placeholder="비고"
          className="rounded border border-neutral-300 px-2 py-1 text-xs"
        />
        <Button className="px-2 py-1 text-xs">
          저장
        </Button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-neutral-500 hover:underline"
        >
          취소
        </button>
      </div>

      {showPivot && (
        <fieldset className="flex flex-wrap items-center gap-2 text-xs">
          <legend className="mr-2 text-xs text-neutral-500">
            {kind === "late" ? "지각 기점(이 교시까지)" : "조퇴 기점(이 교시부터)"}
          </legend>
          {PERIODS.map((p) => (
            <label key={p} className="flex items-center gap-1">
              <input
                type="radio"
                name="pivotPeriod"
                value={p}
                checked={pivotPeriod === p}
                onChange={() => setPivotPeriod(p)}
              />
              {periodLabel(p)}
            </label>
          ))}
        </fieldset>
      )}

      {showMulti && (
        <fieldset className="flex flex-wrap items-center gap-2 text-xs">
          <legend className="mr-2 text-xs text-neutral-500">
            결과 교시(다중 선택)
          </legend>
          {PERIODS.map((p) => (
            <label key={p} className="flex items-center gap-1">
              <input
                type="checkbox"
                name="periods"
                value={p}
                checked={selected.includes(p)}
                onChange={() => toggle(p)}
              />
              {periodLabel(p)}
            </label>
          ))}
        </fieldset>
      )}
    </form>
  );
}

/** 수정 가능한 출결 기록 테이블(인라인 편집 + 신고서 토글 + 삭제) + 페이지네이션. */
export function EditableAttendanceTable({
  rows,
  withDate = false,
  linkStudent = false,
  linkDate = false,
}: {
  rows: AttendanceStudentRow[];
  withDate?: boolean;
  /** 학생명 클릭 → 학생별 검색 뷰(AC-2.2). 편집 모드에는 미적용. */
  linkStudent?: boolean;
  /** 날짜 클릭 → 그 날짜의 오늘 입력 뷰(AC-2.3). withDate 일 때만 의미. */
  linkDate?: boolean;
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
                  <EditAttendanceForm row={r} onDone={() => setEditingId(null)} />
                </td>
              </tr>
            ) : (
              <tr key={r.id} className="border-t border-neutral-100">
                <td className="py-2">
                  {linkStudent ? (
                    <Link
                      href={studentHref(r.studentYearId)}
                      className="hover:underline"
                    >
                      {r.sid} {r.name}
                    </Link>
                  ) : (
                    <>
                      {r.sid} {r.name}
                    </>
                  )}
                </td>
                {withDate && (
                  <td className="py-2">
                    {linkDate ? (
                      <Link href={dateHref(r.date)} className="hover:underline">
                        {r.date}
                      </Link>
                    ) : (
                      r.date
                    )}
                  </td>
                )}
                <td className="py-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${ATTENDANCE_KIND_CHIP[r.kind]}`}>
                    {KIND_LABEL[r.kind]}
                  </span>
                </td>
                <td className="py-2 text-xs text-neutral-500">
                  {periodsLabel(r.periods)}
                </td>
                <td className="py-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${ATTENDANCE_REASON_CHIP[r.reason]}`}>
                    {REASON_LABEL[r.reason]}
                  </span>
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
                    <ConfirmButton
                      message="이 출결 기록을 삭제할까요? 되돌릴 수 없습니다."
                      className="text-xs text-red-500 hover:underline"
                    >
                      삭제
                    </ConfirmButton>
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
  tier: SubmissionTier;
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
  expired: "제출불가",
};
const TIER_CLASS: Record<string, string> = {
  normal: "text-neutral-400",
  warning: "text-orange-600",
  critical: "font-normal text-red-600",
  expired: "font-normal text-red-700",
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
      {/* 등급 범례 — 남은 수업일 기준(마감 = 결석계 5수업일·교외체험 10수업일).
          결석계는 마감을 넘기면 미인정 전환 대상이라 제출불가로 닫는다. */}
      <p className="mt-3 text-xs text-neutral-500">
        남은 수업일 <span className={TIER_CLASS.normal}>정상</span> 3+ ·{" "}
        <span className={TIER_CLASS.warning}>위험</span> 2 ·{" "}
        <span className={TIER_CLASS.critical}>심각</span> 1~0 ·{" "}
        <span className={TIER_CLASS.expired}>제출불가</span> 마감 경과(미인정 전환)
        · 마감 옆 괄호 = 남은 수업일
      </p>
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-neutral-400">
          <tr>
            <th className="py-1 font-normal">학생</th>
            <th className="py-1 font-normal">날짜</th>
            <th className="py-1 font-normal">성격</th>
            <th className="py-1 font-normal">교시</th>
            <th className="py-1 font-normal">사유</th>
            <th className="py-1 font-normal">마감</th>
            <th className="py-1 font-normal">상태</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {pageItems.map((r) => (
            <tr key={r.id} className="border-t border-neutral-100">
              <td className="py-2">
                <Link
                  href={studentHref(r.studentYearId)}
                  className="hover:underline"
                >
                  {r.sid} {r.name}
                </Link>
              </td>
              <td className="py-2">
                <Link href={dateHref(r.date)} className="hover:underline">
                  {r.date}
                </Link>
              </td>
              <td className="py-2">
                <span className={`rounded px-1.5 py-0.5 text-xs ${ATTENDANCE_KIND_CHIP[r.kind]}`}>
                  {KIND_LABEL[r.kind]}
                </span>
                <span className="ml-1 text-xs text-neutral-400">
                  ({SOURCE_LABEL[r.source]})
                </span>
              </td>
              <td className="py-2 text-xs text-neutral-500">{periodsLabel(r.periods)}</td>
              <td className="py-2">
                <span className={`rounded px-1.5 py-0.5 text-xs ${ATTENDANCE_REASON_CHIP[r.reason]}`}>
                  {REASON_LABEL[r.reason]}
                </span>
                {r.noteField ? (
                  <span className="ml-1 text-xs text-neutral-400">({r.noteField})</span>
                ) : null}
              </td>
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
                {r.tier === "expired" ? (
                  // 마감 경과 결석계는 제출을 받지 않는다 — 기록의 사유를
                  // 미인정으로 수정하는 게 다음 행동이다.
                  <span className="text-xs text-neutral-400">기한 경과</span>
                ) : (
                  <form action={markUnsubmittedSubmittedAction} className="inline">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="source" value={r.source} />
                    <button className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                      제출 처리
                    </button>
                  </form>
                )}
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
