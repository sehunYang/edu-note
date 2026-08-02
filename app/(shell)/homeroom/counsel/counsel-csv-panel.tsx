"use client";
import { useRef, useState, useTransition } from "react";
import { downloadCsv } from "@/lib/ui/download-csv";
import { importCounselCsvAction } from "./actions";
import { Button } from "@/app/ui/button";

interface Props {
  year: number;
  getCsvAction: (year: number) => Promise<string>;
}

/**
 * AC-9.5: 상담 코워크 CSV 내보내기 + 결과 업로드 패널.
 * downloadCsv 는 클라이언트 전용(Blob/document) → 클라이언트 컴포넌트로 분리.
 */
export function CounselCsvPanel({ year, getCsvAction }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    imported: number;
    errors: string[];
  } | null>(null);

  function handleExport() {
    startTransition(async () => {
      const csv = await getCsvAction(year);
      downloadCsv(csv, `상담기록_${year}.csv`);
    });
  }

  function handleImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await importCounselCsvAction(formData);
      setResult(res);
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <section className="mt-6 rounded-lg border border-neutral-200 p-5">
      <h2 className="mb-3 text-sm text-neutral-700">
        코워크 CSV
      </h2>
      <div className="flex flex-wrap gap-3">
        {/* 원천자료 내보내기 */}
        <Button
          onClick={handleExport}
          disabled={isPending}
          className="px-3 py-1.5 text-sm"
        >
          원천자료 내보내기
        </Button>

        {/* 결과 CSV 업로드 */}
        {/* flex-wrap + min-w-0: 파일 선택 칸은 "파일 선택" 버튼 + 파일명이 통째로
            고유 폭이라 폰에서 394px 였다. 줄바꿈이 없으면 이 줄이 화면(393)을
            넘겨 페이지 전체가 옆으로 밀린다(실측 문서 폭 439). */}
        <form
          onSubmit={handleImport}
          className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto"
        >
          <input aria-label="상담 결과 CSV 파일 선택"
            ref={fileRef}
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="w-full min-w-0 text-xs text-neutral-600 sm:w-auto"
          />
          <Button
            type="submit"
            disabled={isPending}
            className="px-3 py-1.5 text-sm"
          >
            결과 CSV 업로드
          </Button>
        </form>
      </div>

      {result && (
        <div className="mt-3 text-xs">
          {result.imported > 0 && (
            <p className="text-green-700">{result.imported}건 저장됨</p>
          )}
          {result.errors.length > 0 && (
            <ul className="mt-1 text-red-600">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
