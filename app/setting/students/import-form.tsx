"use client";
import { useRef, useState, useActionState, type ChangeEvent } from "react";
import { importRosterAction, type ImportState } from "./import-actions";
import { Button } from "@/app/ui/button";

/**
 * CSV 임포트 폼 (C4 세팅실). 붙여넣기 + 파일 업로드 지원. 한글 Excel CSV(EUC-KR)는
 * UTF-8 우선 시도 후 실패 시 EUC-KR 로 디코딩해 textarea 에 채운다(서버는 csv 만 읽음).
 */
export function ImportForm({ defaultYear }: { defaultYear: number }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(
    importRosterAction,
    null,
  );
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCsv(await readCsvFile(file));
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-2">
          <label className="text-neutral-600">학년도</label>
          <input
            name="year"
            type="number"
            defaultValue={defaultYear}
            className="w-24 rounded border border-neutral-300 px-2 py-1"
          />
        </div>
        <label className="cursor-pointer rounded-full border border-white/25 bg-transparent px-3 py-1.5 text-sm hover:bg-white/10">
          📄 CSV 파일 선택
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="hidden"
          />
        </label>
        {fileName && <span className="text-xs text-neutral-500">{fileName}</span>}
        <Button
          type="button"
          onClick={downloadCsvExample}
          className="px-3 py-1.5 text-sm"
        >
          ⬇ CSV 예시 다운로드
        </Button>
      </div>

      <textarea
        name="csv"
        rows={5}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder={"여기에 붙여넣거나 위에서 CSV 파일을 선택하세요.\n학번,이름,연락처\n10101,홍길동,010-1234-5678"}
        className="w-full rounded border border-neutral-300 p-2 font-mono text-sm"
      />

      <Button
        type="submit"
        disabled={pending}
        className="px-4 py-2 text-sm font-normal disabled:opacity-60"
      >
        {pending ? "임포트 중…" : "명단 임포트"}
      </Button>

      {state && state.ok && (
        <div className="rounded border border-green-200 bg-green-50 p-3 text-sm">
          ✅ 신규 {state.created}명 · 갱신 {state.updated}명
          {state.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-amber-700">
                ⚠ 오류 {state.errors.length}행 (클릭)
              </summary>
              <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
                {state.errors.map((e) => (
                  <li key={e.rowNumber}>
                    {e.rowNumber}행: {e.errors.map((x) => x.message).join(", ")}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {state && !state.ok && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {state.message}
        </p>
      )}
    </form>
  );
}

/** CSV 예시 템플릿 다운로드(AC-C4). 헤더: 학번·이름·연락처·역할·희망진로. 필수=학번·이름. */
function downloadCsvExample(): void {
  const sample =
    "학번,이름,연락처,역할,희망진로\n" +
    "10101,홍길동,010-1234-5678,반장,교사\n" +
    "10102,김영희,,환경부장,간호사\n";
  // 한글 Excel 호환을 위해 UTF-8 BOM 부착.
  const blob = new Blob(["﻿" + sample], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "학생명단_예시.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/** 파일을 UTF-8 우선, 실패 시 EUC-KR(한글 Excel) 로 디코딩. */
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
