"use client";
import { useMemo, useState, useTransition } from "react";
import {
  saveSessionPlanBulkAction,
  type SessionSaveState,
} from "../actions";
import { sixDigitCode, parseSixDigit } from "@/lib/domain/lesson-unit";
import { Paginator } from "@/lib/ui/paginator";
import { paginate, DEFAULT_PAGE_SIZE } from "@/lib/db/pagination";

/**
 * 차시 계획 클라이언트 에디터 (QC v4 US-2, AC-1.6~1.10). 과목 선택 → 차시 1..N 행.
 * 각 행: 6자리 단원코드 입력(유효 시 단원명·핵심개념 자동표시, 무효 시 인라인 오류),
 * 수업내용 textarea, 핵심개념 입력. 상단 일괄 저장(AC-1.9). 저장 시 최소차시 초과
 * 단원이 있으면 확인 모달(AC-1.8). 차시 리스트는 10개씩 번호 페이지네이션(AC-1.10).
 */
export interface SessionUnit {
  id: string;
  majorNo: number;
  midNo: number;
  minorNo: number;
  majorName: string;
  midName: string;
  minorName: string;
  keywords: string[];
  minOrdinals: number;
}

export interface SessionEntry {
  ordinal: number;
  content: string;
  keywords: string[];
  unitId: string | null;
}

export interface SubjectSessionView {
  subjectId: string;
  subjectName: string;
  semesterComplete: boolean;
  planLength: number;
  ordinals: {
    ordinal: number;
    month: number;
    weekOfMonth: number;
    examLabel: string | null;
  }[];
  entries: SessionEntry[];
  units: SessionUnit[];
}

interface RowState {
  ordinal: number;
  content: string;
  keywords: string;
  /** 6자리 코드 문자열(빈 = 미연결). */
  code: string;
}

function code6(u: { majorNo: number; midNo: number; minorNo: number }): string {
  return String(sixDigitCode(u)).padStart(6, "0");
}

export function SessionEditor({ subjects }: { subjects: SubjectSessionView[] }) {
  const firstComplete =
    subjects.find((s) => s.semesterComplete) ?? subjects[0];
  const [selectedId, setSelectedId] = useState(firstComplete?.subjectId ?? "");
  const selected =
    subjects.find((s) => s.subjectId === selectedId) ?? firstComplete;

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
            <option key={s.subjectId} value={s.subjectId} disabled={!s.semesterComplete}>
              {s.subjectName}
              {s.semesterComplete ? "" : " (학기계획 미완)"}
            </option>
          ))}
        </select>
      </div>

      {!selected.semesterComplete ? (
        <p className="text-sm text-amber-700">
          이 과목은 학기 계획(세부 단원)이 비어 있어 차시 계획을 작성할 수 없습니다.
        </p>
      ) : (
        <SubjectSessionEditor key={selected.subjectId} subject={selected} />
      )}
    </div>
  );
}

function SubjectSessionEditor({ subject }: { subject: SubjectSessionView }) {
  const rowCount = useMemo(() => {
    const maxEntry = subject.entries.reduce((m, e) => Math.max(m, e.ordinal), 0);
    return Math.max(subject.planLength, maxEntry);
  }, [subject]);

  const unitByCode = useMemo(() => {
    const map = new Map<number, SessionUnit>();
    for (const u of subject.units) map.set(sixDigitCode(u), u);
    return map;
  }, [subject]);

  const unitById = useMemo(() => {
    const map = new Map<string, SessionUnit>();
    for (const u of subject.units) map.set(u.id, u);
    return map;
  }, [subject]);

  const [rows, setRows] = useState<RowState[]>(() => {
    const byOrdinal = new Map<number, SessionEntry>();
    for (const e of subject.entries) byOrdinal.set(e.ordinal, e);
    return Array.from({ length: rowCount }, (_, i) => {
      const ordinal = i + 1;
      const e = byOrdinal.get(ordinal);
      const unit = e?.unitId ? unitById.get(e.unitId) : undefined;
      return {
        ordinal,
        content: e?.content ?? "",
        keywords: (e?.keywords ?? []).join(" "),
        code: unit ? code6(unit) : "",
      };
    });
  });

  const [page, setPage] = useState(1);
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [exceeded, setExceeded] = useState<
    NonNullable<SessionSaveState["exceededUnits"]>
  >([]);

  const metaByOrdinal = useMemo(() => {
    const map = new Map<number, SubjectSessionView["ordinals"][number]>();
    for (const m of subject.ordinals) map.set(m.ordinal, m);
    return map;
  }, [subject]);

  const { pageItems, totalPages, currentPage } = paginate(
    rows,
    page,
    DEFAULT_PAGE_SIZE,
  );

  function updateRow(ordinal: number, patch: Partial<RowState>) {
    setRows((rs) =>
      rs.map((r) => (r.ordinal === ordinal ? { ...r, ...patch } : r)),
    );
  }

  function buildPayload(confirm: boolean) {
    return {
      subjectId: subject.subjectId,
      confirmMinOrdinals: confirm,
      rows: rows.map((r) => ({
        ordinal: r.ordinal,
        content: r.content,
        keywords: r.keywords
          .split(/[,\s]+/)
          .map((k) => k.replace(/^#/, "").trim())
          .filter((k) => k.length > 0),
        code: r.code.trim() ? Number(r.code.trim()) : null,
      })),
    };
  }

  function save(confirm: boolean) {
    setServerError(null);
    startTransition(async () => {
      const res = await saveSessionPlanBulkAction(buildPayload(confirm));
      if (!res.ok && res.exceededUnits && res.exceededUnits.length > 0) {
        setExceeded(res.exceededUnits);
        return;
      }
      if (!res.ok) {
        setServerError(res.error ?? "저장에 실패했습니다.");
        return;
      }
      setExceeded([]);
    });
  }

  if (rowCount === 0) {
    return (
      <p className="text-sm text-neutral-400">
        이 과목의 시간표·수업일이 없어 차시 수를 산출할 수 없습니다. 세팅실에서
        시간표를 동기화하세요.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-400">차시 {rowCount}개</span>
        <button
          type="button"
          onClick={() => save(false)}
          disabled={pending}
          className="rounded bg-neutral-800 px-4 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {pending ? "저장 중…" : "일괄 저장"}
        </button>
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}

      <ul className="space-y-3">
        {pageItems.map((r) => (
          <SessionRow
            key={r.ordinal}
            row={r}
            meta={metaByOrdinal.get(r.ordinal)}
            unitByCode={unitByCode}
            onChange={(patch) => updateRow(r.ordinal, patch)}
          />
        ))}
      </ul>

      <Paginator
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
      />

      {exceeded.length > 0 && (
        <ExceedModal
          exceeded={exceeded}
          pending={pending}
          onConfirm={() => save(true)}
          onCancel={() => setExceeded([])}
        />
      )}
    </div>
  );
}

function SessionRow({
  row,
  meta,
  unitByCode,
  onChange,
}: {
  row: RowState;
  meta?: SubjectSessionView["ordinals"][number];
  unitByCode: Map<number, SessionUnit>;
  onChange: (patch: Partial<RowState>) => void;
}) {
  const trimmed = row.code.trim();
  const codeNum = trimmed ? Number(trimmed) : null;
  const formatOk = codeNum === null || parseSixDigit(codeNum) !== null;
  const unit =
    codeNum !== null && formatOk ? unitByCode.get(codeNum) : undefined;
  const codeError =
    codeNum !== null && (!formatOk || !unit)
      ? !formatOk
        ? "6자리 숫자(대2+중2+소2)로 입력하세요."
        : "존재하지 않는 단원 코드입니다."
      : null;

  return (
    <li className="rounded-lg border border-neutral-200 p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-neutral-700">
          {row.ordinal}차시
        </span>
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

      <div className="mt-2 flex items-center gap-2">
        <label className="text-xs text-neutral-500">단원 코드</label>
        <input
          value={row.code}
          onChange={(e) =>
            onChange({ code: e.target.value.replace(/[^0-9]/g, "").slice(0, 6) })
          }
          placeholder="6자리"
          className={`w-24 rounded border px-2 py-1 text-sm ${
            codeError ? "border-red-400" : "border-neutral-300"
          }`}
        />
        {unit && (
          <span className="text-xs text-neutral-500">
            {unit.majorName} &gt; {unit.midName} &gt; {unit.minorName}
            {unit.keywords.length > 0 && (
              <span className="ml-1 text-blue-600">#{unit.keywords.join(" #")}</span>
            )}
          </span>
        )}
      </div>
      {codeError && <p className="mt-1 text-xs text-red-600">{codeError}</p>}

      <textarea
        value={row.content}
        onChange={(e) => onChange({ content: e.target.value })}
        rows={3}
        placeholder="수업내용"
        className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
      />
      <input
        value={row.keywords}
        onChange={(e) => onChange({ keywords: e.target.value })}
        placeholder="핵심개념(콤마/공백 구분, #는 자동 제거)"
        className="mt-2 w-full rounded border border-neutral-300 px-3 py-1.5 text-sm"
      />
    </li>
  );
}

function ExceedModal({
  exceeded,
  pending,
  onConfirm,
  onCancel,
}: {
  exceeded: NonNullable<SessionSaveState["exceededUnits"]>;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
        <h3 className="text-base font-semibold text-neutral-800">
          학기 계획을 변경하시겠습니까?
        </h3>
        <p className="mt-2 text-sm text-neutral-600">
          아래 단원은 학기 계획의 최소 차시보다 더 많은 차시가 배정되었습니다. &quot;네&quot;를
          누르면 단원의 최소 차시를 실제 차시 수로 갱신합니다.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-neutral-700">
          {exceeded.map((e) => (
            <li key={e.unitId}>
              · {e.unitName} — 최소 {e.minOrdinals} → 실제 {e.actual}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            네
          </button>
        </div>
      </div>
    </div>
  );
}
