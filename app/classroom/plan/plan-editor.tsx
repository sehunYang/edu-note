"use client";
import { useMemo, useState } from "react";
import { saveLessonPlanAction, deleteLessonPlanEntryAction } from "./actions";

/**
 * 수업 계획실 클라이언트 에디터 (교실 2-2 단계2). 과목 선택 → 차시 1..N 행.
 * 각 행: 수업내용 textarea + 핵심개념 해시태그 입력(콤마/공백 → text[]). 저장은 행별.
 * neutral Tailwind 스타일(observations 페이지와 일관).
 */
export interface SubjectPlanEntry {
  ordinal: number;
  content: string;
  keywords: string[];
}

export interface PlanOrdinalMeta {
  ordinal: number;
  month: number;
  weekOfMonth: number;
  examLabel: string | null;
}

export interface SubjectPlanView {
  subjectId: string;
  subjectName: string;
  planLength: number;
  ordinals: PlanOrdinalMeta[];
  entries: SubjectPlanEntry[];
}

export function PlanEditor({ subjects }: { subjects: SubjectPlanView[] }) {
  const [selectedId, setSelectedId] = useState(subjects[0]?.subjectId ?? "");
  const selected = subjects.find((s) => s.subjectId === selectedId) ?? subjects[0];

  // 표시 차시 수 = max(N, 기존 입력 최대 ordinal). 데이터가 N을 초과해도 보존.
  const rowCount = useMemo(() => {
    if (!selected) return 0;
    const maxEntry = selected.entries.reduce((m, e) => Math.max(m, e.ordinal), 0);
    return Math.max(selected.planLength, maxEntry);
  }, [selected]);

  const entryByOrdinal = useMemo(() => {
    const map = new Map<number, SubjectPlanEntry>();
    for (const e of selected?.entries ?? []) map.set(e.ordinal, e);
    return map;
  }, [selected]);

  const metaByOrdinal = useMemo(() => {
    const map = new Map<number, PlanOrdinalMeta>();
    for (const m of selected?.ordinals ?? []) map.set(m.ordinal, m);
    return map;
  }, [selected]);

  if (!selected) return null;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-sm text-neutral-600">과목</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          {subjects.map((s) => (
            <option key={s.subjectId} value={s.subjectId}>
              {s.subjectName}
            </option>
          ))}
        </select>
        <span className="text-xs text-neutral-400">차시 {rowCount}개</span>
      </div>

      {rowCount === 0 ? (
        <p className="text-sm text-neutral-400">
          이 과목의 시간표·수업일이 없어 차시 수를 산출할 수 없습니다. 세팅실에서
          시간표를 동기화하세요.
        </p>
      ) : (
        <ul className="space-y-3">
          {Array.from({ length: rowCount }, (_, i) => i + 1).map((ordinal) => (
            <PlanRow
              key={`${selected.subjectId}-${ordinal}`}
              subjectId={selected.subjectId}
              ordinal={ordinal}
              entry={entryByOrdinal.get(ordinal)}
              meta={metaByOrdinal.get(ordinal)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PlanRow({
  subjectId,
  ordinal,
  entry,
  meta,
}: {
  subjectId: string;
  ordinal: number;
  entry?: SubjectPlanEntry;
  meta?: PlanOrdinalMeta;
}) {
  return (
    <li className="rounded-lg border border-neutral-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-neutral-700">{ordinal}차시</span>
          {meta && (
            <span className="text-xs text-neutral-400">
              {meta.month}월 {meta.weekOfMonth}주차
            </span>
          )}
          {meta?.examLabel && (
            <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600">
              {meta.examLabel} 시험
            </span>
          )}
        </div>
        {entry && (
          <form action={deleteLessonPlanEntryAction}>
            <input type="hidden" name="subjectId" value={subjectId} />
            <input type="hidden" name="ordinal" value={ordinal} />
            <button className="text-xs text-neutral-400 hover:text-red-600">
              삭제
            </button>
          </form>
        )}
      </div>
      <form action={saveLessonPlanAction} className="mt-2 space-y-2">
        <input type="hidden" name="subjectId" value={subjectId} />
        <input type="hidden" name="ordinal" value={ordinal} />
        <textarea
          name="content"
          rows={3}
          defaultValue={entry?.content ?? ""}
          placeholder="수업내용"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          name="keywords"
          defaultValue={(entry?.keywords ?? []).join(" ")}
          placeholder="핵심개념(콤마/공백 구분, #는 자동 제거)"
          className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm"
        />
        {entry && entry.keywords.length > 0 && (
          <p className="text-xs text-blue-600">#{entry.keywords.join(" #")}</p>
        )}
        <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700">
          저장
        </button>
      </form>
    </li>
  );
}
