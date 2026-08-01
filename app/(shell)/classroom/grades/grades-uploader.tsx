"use client";
import { useMemo, useState, useActionState, type ChangeEvent } from "react";
import {
  uploadPerformanceCsvAction,
  uploadJipilCsvAction,
  saveInlineGradesAction,
  type GradeUploadState,
} from "./actions";
import { performanceCsvExample, jipilCsvExample } from "@/lib/csv/grades";
import { downloadCsv } from "@/lib/ui/download-csv";
import { Button } from "@/app/ui/button";

/**
 * 성적 기록 클라이언트 업로더 (교실 2-2 단계4). 과목 선택 → 수행 항목별 업로드칸
 * + 지필 활성회차 업로드칸. 각 칸은 파일 선택→text→action. 예시 CSV는 Blob 다운로드.
 * 저장/스킵/경고/형식오류를 칸별로 표시. neutral Tailwind(plan-editor와 일관).
 */
export interface GradeRow {
  sid: string;
  name: string;
  jipilMid: number;
  jipilFinal: number;
  performanceByItem: Record<string, number>;
  total: number;
}

export interface SubjectGradeView {
  subjectId: string;
  subjectName: string;
  performanceItems: string[];
  jipilMidEnabled: boolean;
  jipilFinalEnabled: boolean;
  grades: GradeRow[];
}

/** UTF-8 우선, 실패 시 EUC-KR(한글 Excel) 로 디코딩(roster import-form 패턴). */
async function readCsvFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buf);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder("euc-kr").decode(buf);
    } catch {
      return new TextDecoder("utf-8").decode(buf);
    }
  }
}


export function GradesUploader({ subjects }: { subjects: SubjectGradeView[] }) {
  const [selectedId, setSelectedId] = useState(subjects[0]?.subjectId ?? "");
  const selected =
    subjects.find((s) => s.subjectId === selectedId) ?? subjects[0];

  if (!selected) return null;

  return (
    <div className="mt-6 space-y-5">
      <div className="flex items-center gap-2">
        <label className="text-sm text-neutral-600">과목</label>
        <select aria-label="과목"
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
      </div>

      {/* 수행평가 항목별 업로드 */}
      <section>
        <h3 className="text-sm font-normal text-neutral-700">수행평가</h3>
        {selected.performanceItems.length === 0 ? (
          <p className="mt-1 text-xs text-neutral-400">
            이 과목에 등록된 수행평가 항목이 없습니다. 세팅실에서 평가설정을
            등록하세요.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {selected.performanceItems.map((item) => (
              <PerformanceBox
                key={`${selected.subjectId}-${item}`}
                subjectId={selected.subjectId}
                itemName={item}
              />
            ))}
          </ul>
        )}
      </section>

      {/* 지필 활성회차 업로드 */}
      <section>
        <h3 className="text-sm font-normal text-neutral-700">지필평가</h3>
        {!selected.jipilMidEnabled && !selected.jipilFinalEnabled ? (
          <p className="mt-1 text-xs text-neutral-400">
            이 과목은 지필평가를 시행하지 않습니다.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {selected.jipilMidEnabled && (
              <JipilBox
                subjectId={selected.subjectId}
                ordinal={1}
                label="중간고사"
              />
            )}
            {selected.jipilFinalEnabled && (
              <JipilBox
                subjectId={selected.subjectId}
                ordinal={2}
                label="기말고사"
              />
            )}
          </ul>
        )}
      </section>

      {/* 환산 미리보기(요소별 분해) */}
      <GradePreview
        subjectId={selected.subjectId}
        rows={selected.grades}
        performanceItems={selected.performanceItems}
        midEnabled={selected.jipilMidEnabled}
        finalEnabled={selected.jipilFinalEnabled}
      />
    </div>
  );
}

function PerformanceBox({
  subjectId,
  itemName,
}: {
  subjectId: string;
  itemName: string;
}) {
  const [state, action, pending] = useActionState<GradeUploadState | null, FormData>(
    uploadPerformanceCsvAction,
    null,
  );
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCsv(await readCsvFile(file));
    e.target.value = "";
  }

  return (
    <li className="rounded-lg border border-neutral-200 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-normal text-neutral-700">{itemName}</span>
        <Button
          type="button"
          onClick={() =>
            downloadCsv(performanceCsvExample(), `수행_${itemName}_예시.csv`)
          }
          className="px-2 py-1 text-xs"
        >
          ⬇ 예시 다운로드
        </Button>
      </div>
      <form action={action} className="mt-2 space-y-2">
        <input type="hidden" name="subjectId" value={subjectId} />
        <input type="hidden" name="itemName" value={itemName} />
        <input type="hidden" name="csv" value={csv} />
        <div className="flex items-center gap-2">
          <label className="cursor-pointer rounded-full border border-white/25 bg-transparent px-2 py-1 text-xs hover:bg-white/10">
            📄 CSV 파일
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              className="hidden"
            />
          </label>
          {fileName && (
            <span className="text-xs text-neutral-500">{fileName}</span>
          )}
          <Button
            type="submit"
            disabled={pending || !csv}
            className="px-3 py-1 text-xs"
          >
            {pending ? "업로드 중…" : "업로드"}
          </Button>
        </div>
        <UploadResult state={state} />
      </form>
    </li>
  );
}

function JipilBox({
  subjectId,
  ordinal,
  label,
}: {
  subjectId: string;
  ordinal: 1 | 2;
  label: string;
}) {
  const [state, action, pending] = useActionState<GradeUploadState | null, FormData>(
    uploadJipilCsvAction,
    null,
  );
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCsv(await readCsvFile(file));
    e.target.value = "";
  }

  return (
    <li className="rounded-lg border border-neutral-200 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-normal text-neutral-700">{label}</span>
        <Button
          type="button"
          onClick={() => downloadCsv(jipilCsvExample(), `지필_${label}_예시.csv`)}
          className="px-2 py-1 text-xs"
        >
          ⬇ 예시 다운로드
        </Button>
      </div>
      <form action={action} className="mt-2 space-y-2">
        <input type="hidden" name="subjectId" value={subjectId} />
        <input type="hidden" name="ordinal" value={ordinal} />
        <input type="hidden" name="csv" value={csv} />
        <div className="flex items-center gap-2">
          <label className="cursor-pointer rounded-full border border-white/25 bg-transparent px-2 py-1 text-xs hover:bg-white/10">
            📄 CSV 파일
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              className="hidden"
            />
          </label>
          {fileName && (
            <span className="text-xs text-neutral-500">{fileName}</span>
          )}
          <Button
            type="submit"
            disabled={pending || !csv}
            className="px-3 py-1 text-xs"
          >
            {pending ? "업로드 중…" : "업로드"}
          </Button>
        </div>
        <UploadResult state={state} />
      </form>
    </li>
  );
}

function UploadResult({ state }: { state: GradeUploadState | null }) {
  if (!state) return null;
  if (!state.ok) {
    return (
      <p role="status" className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
        {state.message}
      </p>
    );
  }
  return (
    <div role="status" className="space-y-1 rounded border border-green-200 bg-green-50 p-2 text-xs">
      <p className="text-green-800">✅ 저장 {state.saved ?? 0}건</p>
      {state.skipped && state.skipped.length > 0 && (
        <details>
          <summary className="cursor-pointer text-amber-700">
            ⚠ 미매칭 학번 {state.skipped.length}건
          </summary>
          <ul className="mt-1 space-y-0.5 text-amber-800">
            {state.skipped.map((s) => (
              <li key={s.sid}>
                {s.sid}: {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      {state.warnings && state.warnings.length > 0 && (
        <details>
          <summary className="cursor-pointer text-amber-700">
            ⚠ 경고 {state.warnings.length}건
          </summary>
          <ul className="mt-1 space-y-0.5 text-amber-800">
            {state.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      {state.parseErrors && state.parseErrors.length > 0 && (
        <details>
          <summary className="cursor-pointer text-amber-700">
            ⚠ 형식오류 {state.parseErrors.length}행
          </summary>
          <ul className="mt-1 space-y-0.5 text-amber-800">
            {state.parseErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** 셀 키: `<sid>|jipil|<회차>` 또는 `<sid>|perf|<항목명>`. */
function cellKey(sid: string, kind: "jipil" | "perf", slot: string): string {
  return `${sid}|${kind}|${slot}`;
}

/**
 * 환산 미리보기 — 표에서 바로 편집 (사용성 개선 P2-12).
 *
 * 이전에는 읽기 전용이라 점수 한 칸을 고치려 해도 CSV 다운로드→편집→업로드
 * 왕복이 필요했다. 각 점수 칸을 입력 필드로 바꾸고, 바뀐 셀만 모아 한 번에
 * 저장한다. 합계는 입력에 맞춰 즉시 다시 계산해 보여준다(저장 전 확인용).
 * CSV 업로드는 대량 입력용으로 그대로 남는다.
 */
function GradePreview({
  subjectId,
  rows,
  performanceItems,
  midEnabled,
  finalEnabled,
}: {
  subjectId: string;
  rows: GradeRow[];
  performanceItems: string[];
  midEnabled: boolean;
  finalEnabled: boolean;
}) {
  const initial = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of rows) {
      map[cellKey(r.sid, "jipil", "1")] = String(r.jipilMid ?? "");
      map[cellKey(r.sid, "jipil", "2")] = String(r.jipilFinal ?? "");
      for (const item of performanceItems) {
        const v = r.performanceByItem[item];
        map[cellKey(r.sid, "perf", item)] = v == null ? "" : String(v);
      }
    }
    return map;
  }, [rows, performanceItems]);

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [state, formAction, pending] = useActionState(
    saveInlineGradesAction,
    null as GradeUploadState | null,
  );

  // 과목을 바꾸면 표가 통째로 갈리므로 편집 상태도 초기화한다.
  const [snapshot, setSnapshot] = useState(initial);
  if (snapshot !== initial) {
    setSnapshot(initial);
    setValues(initial);
  }

  const dirty = Object.keys(initial).filter(
    (k) => (values[k] ?? "") !== (initial[k] ?? ""),
  );

  const hasAny = rows.some((r) => r.total !== 0);
  if (rows.length === 0) {
    return (
      <p className="text-xs text-neutral-400">
        수강생이 없거나 아직 성적이 없습니다.
      </p>
    );
  }

  /** 입력값 기준 합계(저장 전 즉시 반영). */
  function liveTotal(r: GradeRow): number {
    let sum = 0;
    if (midEnabled) sum += Number(values[cellKey(r.sid, "jipil", "1")] || 0);
    if (finalEnabled) sum += Number(values[cellKey(r.sid, "jipil", "2")] || 0);
    for (const item of performanceItems) {
      sum += Number(values[cellKey(r.sid, "perf", item)] || 0);
    }
    return Math.round(sum * 10) / 10;
  }

  const edits = dirty.map((k) => {
    const [sid, kind, slot] = k.split("|");
    return kind === "jipil"
      ? { sid, kind: "jipil" as const, ordinal: (slot === "2" ? 2 : 1) as 1 | 2, value: values[k] }
      : { sid, kind: "performance" as const, itemName: slot, value: values[k] };
  });

  function Cell({ k, label }: { k: string; label: string }) {
    return (
      <input
        aria-label={label}
        inputMode="decimal"
        value={values[k] ?? ""}
        onChange={(e) => setValues((p) => ({ ...p, [k]: e.target.value }))}
        className={`w-16 rounded border px-1 py-0.5 text-right text-xs ${
          (values[k] ?? "") !== (initial[k] ?? "")
            ? "border-amber-400 bg-amber-500/10"
            : "border-neutral-300 bg-transparent"
        }`}
      />
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-normal text-neutral-700">
          환산 미리보기{!hasAny && " (입력된 성적 없음)"}
        </h3>
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="subjectId" value={subjectId} />
          <input type="hidden" name="edits" value={JSON.stringify(edits)} />
          <span role="status" className="text-xs text-neutral-500">
            {pending ? "저장 중…" : dirty.length > 0 ? `변경 ${dirty.length}칸` : ""}
          </span>
          <Button
            type="submit"
            variant="solid"
            disabled={pending || dirty.length === 0}
            className="px-3 py-1 text-xs disabled:opacity-40"
          >
            변경 저장
          </Button>
        </form>
      </div>
      <p className="mt-0.5 text-xs text-neutral-400">
        칸을 직접 고친 뒤 <strong>변경 저장</strong>을 누르세요. 대량 입력은 위의 CSV
        업로드를 쓰면 됩니다. 지필은 활성 회차별, 수행은 항목별로 분해됩니다.
      </p>
      {state && <UploadResult state={state} />}
      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="px-2 py-1">학번</th>
              <th className="px-2 py-1">이름</th>
              {midEnabled && <th className="px-2 py-1 text-right">지필중간</th>}
              {finalEnabled && <th className="px-2 py-1 text-right">지필기말</th>}
              {performanceItems.map((item) => (
                <th key={item} className="px-2 py-1 text-right">
                  {item}
                </th>
              ))}
              <th className="px-2 py-1 text-right">합계</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sid} className="border-b border-neutral-100">
                <td className="px-2 py-1">{r.sid}</td>
                <td className="px-2 py-1">{r.name}</td>
                {midEnabled && (
                  <td className="px-2 py-1 text-right">
                    <Cell
                      k={cellKey(r.sid, "jipil", "1")}
                      label={`${r.name} 지필중간`}
                    />
                  </td>
                )}
                {finalEnabled && (
                  <td className="px-2 py-1 text-right">
                    <Cell
                      k={cellKey(r.sid, "jipil", "2")}
                      label={`${r.name} 지필기말`}
                    />
                  </td>
                )}
                {performanceItems.map((item) => (
                  <td key={item} className="px-2 py-1 text-right">
                    <Cell
                      k={cellKey(r.sid, "perf", item)}
                      label={`${r.name} ${item}`}
                    />
                  </td>
                ))}
                <td className="px-2 py-1 text-right font-normal tabular-nums">
                  {liveTotal(r)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
