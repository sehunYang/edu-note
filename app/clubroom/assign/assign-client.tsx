"use client";
import { useState } from "react";

interface Candidate {
  id: string;
  label: string;
}

/**
 * 부원 배정 선택 클라이언트 (QC v5 c9 D.3). 후보 학생을 체크/토글로 선택해
 * studentYearIds(콤마 구분) hidden 필드로 묶어 서버액션에 전달한다.
 * activities 일괄 선택 패턴을 따른다.
 */
export function AssignClient({
  candidates,
  action,
}: {
  candidates: Candidate[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === candidates.length
        ? new Set()
        : new Set(candidates.map((c) => c.id)),
    );
  }

  return (
    <form action={action} className="mt-3 space-y-3">
      <input
        type="hidden"
        name="studentYearIds"
        value={Array.from(selected).join(",")}
      />
      <button
        type="button"
        onClick={toggleAll}
        className="text-xs text-neutral-500 hover:underline"
      >
        {selected.size === candidates.length ? "전체 해제" : "전체 선택"}
      </button>
      <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
        {candidates.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded border border-neutral-200 px-2 py-1 text-sm hover:bg-neutral-50">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
              />
              <span>{c.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <button
        type="submit"
        disabled={selected.size === 0}
        className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        선택 {selected.size}명 배정
      </button>
    </form>
  );
}
