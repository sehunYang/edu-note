"use client";
import { useState, useTransition } from "react";
import {
  buildPromptAction,
  saveDraftAction,
  type SaveDraftActionResult,
} from "./actions";
import type { SpecialNoteType } from "@/lib/domain/types";

interface Option {
  id: string;
  label: string;
}

const TYPE_OPTIONS: { value: SpecialNoteType; label: string }[] = [
  { value: "subject", label: "교과 세특" },
  { value: "autonomy", label: "자율활동" },
  { value: "career", label: "진로활동" },
  { value: "club", label: "동아리활동" },
  { value: "behavior", label: "행동특성 및 종합의견" },
];

/**
 * 세특 내보내기 워크플로 (계획 §4 C). ① 프롬프트 번들 생성·복사 →
 * (코워크에서 생성) → ② 결과 붙여넣기 → 검수 → 저장.
 */
export function SetechForm({
  students,
  subjects,
}: {
  students: Option[];
  subjects: Option[];
}) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [noteType, setNoteType] = useState<SpecialNoteType>("subject");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [studentName, setStudentName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [content, setContent] = useState("");
  const [save, setSave] = useState<SaveDraftActionResult | null>(null);
  const [msg, setMsg] = useState("");
  const [pending, startTransition] = useTransition();

  const subjectArg = noteType === "subject" ? subjectId : null;

  function onBuild() {
    setMsg("");
    setSave(null);
    startTransition(async () => {
      const r = await buildPromptAction({ studentYearId: studentId, noteType, subjectId: subjectArg });
      if (r.ok) {
        setPrompt(r.prompt);
        setStudentName(r.studentName);
        setMsg(`원천 자료 ${r.sourceCount}건으로 프롬프트를 생성했습니다.`);
      } else {
        setPrompt("");
        setMsg(r.message);
      }
    });
  }

  function onCopy() {
    navigator.clipboard?.writeText(prompt).then(
      () => setMsg("프롬프트를 클립보드에 복사했습니다. 코워크에 붙여넣으세요."),
      () => setMsg("복사 실패 — 텍스트를 직접 선택해 복사하세요."),
    );
  }

  function onSave() {
    setMsg("");
    startTransition(async () => {
      const r = await saveDraftAction({
        studentYearId: studentId,
        noteType,
        subjectId: subjectArg,
        content,
        studentName,
      });
      setSave(r);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={noteType}
          onChange={(e) => setNoteType(e.target.value as SpecialNoteType)}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {noteType === "subject" && subjects.length > 0 && (
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={onBuild}
          disabled={pending || !studentId}
          className="rounded-full border border-white/25 bg-transparent px-3 py-1 text-sm text-white hover:bg-white/10 disabled:opacity-50"
        >
          ① 프롬프트 생성
        </button>
      </div>

      {msg && <p className="text-xs text-neutral-500">{msg}</p>}

      {prompt && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-normal text-neutral-600">
              코워크 붙여넣기용 프롬프트
            </label>
            <button
              onClick={onCopy}
              className="rounded-full border border-white/25 px-2 py-0.5 text-xs hover:bg-white/10"
            >
              복사
            </button>
          </div>
          <textarea
            readOnly
            value={prompt}
            rows={8}
            className="w-full rounded border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-xs"
          />
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs font-normal text-neutral-600">
          ② 코워크 결과 붙여넣기 → 검수 후 저장
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="코워크(Claude Code)에서 생성된 세특 본문을 붙여넣으세요."
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          onClick={onSave}
          disabled={pending || !content.trim() || !studentId}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          검수 후 저장
        </button>
      </div>

      {save && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            save.ok ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"
          }`}
        >
          {save.ok ? (
            <p className="font-normal text-emerald-800">
              저장됨 · {save.byteCount} / {save.byteLimit} byte
            </p>
          ) : (
            <p className="font-normal text-red-700">{save.message}</p>
          )}
          {save.warnings.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs">
              {save.warnings.map((w, i) => (
                <li key={i} className={w.blocking ? "text-red-600" : "text-amber-700"}>
                  {w.blocking ? "⛔" : "⚠"} {w.message}
                  {w.match ? ` — “${w.match}”` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
