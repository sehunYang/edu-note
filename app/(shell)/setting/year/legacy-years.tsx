"use client";
import { useState, useActionState } from "react";
import { deleteYearAction, type DeleteYearState } from "../actions";
import { Button } from "@/app/ui/button";

interface YearRow {
  schoolYear: number;
  studentCount: number;
}

/**
 * 레거시 연도 목록 + 연도 단위 삭제(AC-1.3/1.4). 활성 연도는 삭제 불가.
 * 삭제는 확인란에 연도를 정확히 입력해야 실행된다(오삭제 방지).
 */
export function LegacyYears({
  years,
  activeYear,
}: {
  years: YearRow[];
  activeYear: number;
}) {
  const [state, action, pending] = useActionState<DeleteYearState, FormData>(
    deleteYearAction,
    null,
  );

  if (years.length === 0) {
    return (
      <p className="mt-3 text-sm text-neutral-400">
        아직 보유한 연도 데이터가 없습니다.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {years.map((y) => (
        <div
          key={y.schoolYear}
          className="flex items-center justify-between rounded border border-neutral-200 px-4 py-2 text-sm"
        >
          <span>
            <strong>{y.schoolYear}학년도</strong> · 학생 {y.studentCount}명
            {y.schoolYear === activeYear && (
              <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">
                활성
              </span>
            )}
          </span>
          {y.schoolYear !== activeYear && (
            <DeleteForm year={y.schoolYear} action={action} pending={pending} />
          )}
        </div>
      ))}

      {state && state.ok && (
        <p role="status" className="rounded border border-green-200 bg-green-50 p-3 text-sm">
          ✅ {state.year}학년도 삭제 · 학적 {state.removedStudentYears}건 제거 ·
          참조 영속학생 {state.preservedPersons}명 보존
        </p>
      )}
      {state && !state.ok && (
        <p role="status" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {state.message}
        </p>
      )}
    </div>
  );
}

function DeleteForm({
  year,
  action,
  pending,
}: {
  year: number;
  action: (fd: FormData) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button
        variant="destructive"
        onClick={() => setOpen(true)}
        className="px-2 py-1 text-xs"
      >
        삭제
      </Button>
    );
  }
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="year" value={year} />
      <input aria-label="삭제 확인용 연도 입력"
        name="confirm"
        type="number"
        placeholder={`${year} 입력`}
        className="w-24 rounded border border-red-300 px-2 py-1 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-red-500 bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600 disabled:opacity-50"
      >
        {pending ? "삭제 중…" : "확정"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded border border-neutral-300 px-2 py-1 text-xs"
      >
        취소
      </button>
    </form>
  );
}
