"use client";
import { useMemo, useState, useTransition } from "react";
import {
  saveSessionPlanBulkAction,
  toggleSlackCellAction,
  untoggleSlackCellAction,
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

/** AC-1.3 — 시험까지 남은 차시 카운터(서버 computeRemainingToExam 결과). */
export interface RemainingToExam {
  activeOrdinal: 1 | 2 | null;
  examDate: string | null;
  remainingSchoolDays: number;
  remainingPeriods: number;
}

export interface SubjectSessionView {
  subjectId: string;
  subjectName: string;
  semesterComplete: boolean;
  planLength: number;
  /** AC-1.2 — 세부단원 최소차시 합(차시계획 총 차시 수). */
  totalOrdinals: number;
  /** AC-1.3 — 시험까지 남은 차시(없으면 null). */
  remaining: RemainingToExam | null;
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

/** entries 배치 시그니처(ordinal→unitId|content). 여유차시 시프트 후 remount 키. */
function entriesSig(s: SubjectSessionView): string {
  return s.entries
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((e) => `${e.ordinal}:${e.unitId ?? ""}:${e.content}`)
    .join("|");
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
        // key 에 entries 시그니처를 포함해, 여유차시 토글(서버 시프트+revalidate) 후
        // 새 서버 상태로 에디터가 remount 되어 로컬 rows 가 최신 배치를 반영하게 한다.
        <SubjectSessionEditor
          key={`${selected.subjectId}:${entriesSig(selected)}`}
          subject={selected}
        />
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
  // AC-1.3 맨 위 '여유 차시' 입력(예약 의도). (세부단원 차시합 + 여유차시) == 대표분반
  // 차시이면 안내가 사라진다.
  const [slackInput, setSlackInput] = useState("0");
  const [slackPending, startSlack] = useTransition();
  const [slackError, setSlackError] = useState<string | null>(null);

  // 세부단원 차시합 = 단원코드가 채워진(내용 있는) 행 수. 빈 행은 여유차시 후보.
  const contentRows = useMemo(
    () => rows.filter((r) => r.code.trim() !== "" || r.content.trim() !== "").length,
    [rows],
  );

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

  // AC-1.5 여유차시로 등록(토글)/해제. 서버 시프트 후 revalidate 로 새 상태 반영.
  function toggleSlack(ordinal: number, on: boolean) {
    setSlackError(null);
    startSlack(async () => {
      const res = on
        ? await toggleSlackCellAction({ subjectId: subject.subjectId, ordinal })
        : await untoggleSlackCellAction({ subjectId: subject.subjectId, ordinal });
      if (!res.ok) setSlackError(res.error ?? "여유차시 처리에 실패했습니다.");
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

  const slackNum = Number(slackInput) || 0;
  // AC-1.2/1.3: (세부단원 차시합 + 여유차시) == 대표분반 차시이면 안내 사라짐.
  const repLength = subject.planLength;
  const matchesRep = repLength > 0 && contentRows + slackNum === repLength;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-200 p-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-neutral-600">
            저장된 총 차시 <span className="font-normal">{rowCount}</span>개
          </span>
          <span className="text-neutral-600">
            대표분반 차시{" "}
            <span className="font-normal">{repLength}</span>개
          </span>
          <label className="flex items-center gap-1 text-neutral-600">
            여유 차시
            <input
              type="number"
              min={0}
              value={slackInput}
              onChange={(e) =>
                setSlackInput(e.target.value.replace(/[^0-9]/g, ""))
              }
              className="w-16 rounded border border-neutral-300 px-2 py-1 text-sm"
            />
          </label>
        </div>
        {repLength > 0 && !matchesRep && (
          <p className="mt-2 text-xs text-amber-700">
            세부단원 차시합({contentRows}) + 여유차시({slackNum}) ={" "}
            {contentRows + slackNum} 이(가) 대표분반 차시({repLength})와 다릅니다.
            차이를 확인하세요(강제는 아닙니다).
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-400">차시 {rowCount}개</span>
        <button
          type="button"
          onClick={() => save(false)}
          disabled={pending}
          className="rounded-full border border-white/25 bg-transparent px-4 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50"
        >
          {pending ? "저장 중…" : "일괄 저장"}
        </button>
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      {slackError && <p className="text-sm text-red-600">{slackError}</p>}

      <ul className="space-y-3">
        {pageItems.map((r) => (
          <SessionRow
            key={r.ordinal}
            row={r}
            meta={metaByOrdinal.get(r.ordinal)}
            unitByCode={unitByCode}
            onChange={(patch) => updateRow(r.ordinal, patch)}
            onToggleSlack={(on) => toggleSlack(r.ordinal, on)}
            slackPending={slackPending}
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
  onToggleSlack,
  slackPending,
}: {
  row: RowState;
  meta?: SubjectSessionView["ordinals"][number];
  unitByCode: Map<number, SessionUnit>;
  onChange: (patch: Partial<RowState>) => void;
  onToggleSlack: (on: boolean) => void;
  slackPending: boolean;
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
  // 여유차시(빈셀) = 단원코드·내용 둘 다 비어 있음. isSlackCell(domain) 동치.
  const isSlack = row.code.trim() === "" && row.content.trim() === "";

  return (
    <li
      className={`rounded-lg border p-4 ${
        isSlack ? "border-dashed border-amber-300 bg-amber-50/40" : "border-neutral-200"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-normal text-neutral-700">
          {row.ordinal}차시
        </span>
        {meta && (
          <span className="text-xs text-neutral-400">
            {meta.month}월 {meta.weekOfMonth}주차
          </span>
        )}
        {meta?.examLabel && (
          <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-normal text-red-600">
            {meta.examLabel} 시험
          </span>
        )}
        {isSlack && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-700">
            여유차시
          </span>
        )}
        <button
          type="button"
          onClick={() => onToggleSlack(!isSlack)}
          disabled={slackPending}
          className="ml-auto rounded-full border border-white/25 px-2 py-0.5 text-xs hover:bg-white/10 disabled:opacity-50"
          title={
            isSlack
              ? "여유차시를 해제하고 이후 내용을 앞으로 당깁니다."
              : "이 차시부터 끝까지 내용을 한 칸 뒤로 밀고 빈 여유차시로 만듭니다."
          }
        >
          {isSlack ? "여유차시 해제" : "여유차시로 등록"}
        </button>
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
      <div className="w-full max-w-md rounded-lg bg-card p-5 border border-neutral-200">
        <h3 className="text-base font-normal text-neutral-800">
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
            className="rounded-full border border-white/25 px-3 py-1.5 text-sm text-neutral-600 hover:bg-white/10 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-full border border-white/25 bg-transparent px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50"
          >
            네
          </button>
        </div>
      </div>
    </div>
  );
}
