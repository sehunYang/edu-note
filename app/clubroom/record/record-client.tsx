"use client";
import { useMemo, useState, useTransition } from "react";
import { byteLength } from "@/lib/domain/byte-count";
import { saveRecordDraftAction } from "./actions";
import { Button } from "@/app/ui/button";

interface SourceRow {
  studentYearId: string;
  label: string;
  club: string[];
}
interface DraftRow {
  id: string;
  studentYearId: string;
  content: string;
  byteCount: number;
  byteLimit: number;
}

/**
 * 생기부 작성 클라이언트 (QC v5 c9 D.6). 부원 선택 → 원천자료(공통+개별) 표시 →
 * 본문 편집(실시간 byte 표시) → 초안 저장. 저장된 초안 목록을 함께 노출한다.
 */
export function RecordClient({
  byteLimit,
  sources,
  drafts,
}: {
  byteLimit: number;
  sources: SourceRow[];
  drafts: DraftRow[];
}) {
  const [selectedId, setSelectedId] = useState<string>(
    sources[0]?.studentYearId ?? "",
  );
  const [content, setContent] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [pending, startTransition] = useTransition();

  const current = sources.find((s) => s.studentYearId === selectedId) ?? null;
  const byteCount = useMemo(() => byteLength(content), [content]);
  const over = byteCount > byteLimit;
  const labelById = new Map(sources.map((s) => [s.studentYearId, s.label]));

  function selectStudent(id: string) {
    setSelectedId(id);
    setMsg("");
    const src = sources.find((s) => s.studentYearId === id);
    setContent(src ? src.club.join("\n") : "");
  }

  function onSave() {
    if (!selectedId || !content.trim() || over) return;
    setMsg("");
    startTransition(async () => {
      const r = await saveRecordDraftAction({
        studentYearId: selectedId,
        content,
      });
      setMsg(
        r.ok
          ? `저장 완료 (${r.byteCount}/${r.byteLimit} byte)`
          : r.message,
      );
    });
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap gap-2">
        {sources.map((s) => (
          <button
            key={s.studentYearId}
            onClick={() => selectStudent(s.studentYearId)}
            className={`rounded border px-3 py-1.5 text-sm ${
              s.studentYearId === selectedId
                ? "border-neutral-800 border border-white/25 bg-transparent text-white"
                : "border-white/25 text-neutral-700 hover:bg-white/10"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {current && (
        <section className="rounded-lg border border-neutral-200 p-4">
          <h3 className="text-sm font-normal text-neutral-700">
            원천자료 — {current.label}
          </h3>
          {current.club.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400">
              수집된 활동 원천이 없습니다.
            </p>
          ) : (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-600">
              {current.club.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-lg border border-neutral-200 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-normal text-neutral-700">생기부 본문</h3>
          <span
            className={`text-xs ${over ? "text-red-500" : "text-neutral-400"}`}
          >
            {byteCount}/{byteLimit} byte
          </span>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          placeholder="원천자료를 참고해 생기부 본문을 작성하세요."
        />
        <Button
          onClick={onSave}
          disabled={pending || over || !content.trim()}
          className="mt-2 px-3 py-1.5 text-sm"
        >
          초안 저장
        </Button>
        {msg && <p className="mt-2 text-xs text-neutral-500">{msg}</p>}
      </section>

      <section>
        <h3 className="text-sm font-normal text-neutral-700">
          저장된 초안 {drafts.length}
        </h3>
        {drafts.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">
            아직 저장된 초안이 없습니다.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="rounded-lg border border-neutral-200 p-3 text-sm"
              >
                <div className="flex justify-between text-xs text-neutral-400">
                  <span>{labelById.get(d.studentYearId) ?? "—"}</span>
                  <span>
                    {d.byteCount}/{d.byteLimit} byte
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-neutral-700">
                  {d.content}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
