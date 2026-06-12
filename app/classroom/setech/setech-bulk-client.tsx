"use client";
import { useState, useTransition } from "react";
import {
  exportBulkSourceAction,
  importBulkResultAction,
  saveExtraNoteAction,
} from "./actions";
import { downloadCsv } from "@/lib/ui/download-csv";

interface SubjectOpt {
  id: string;
  name: string;
  sections: { id: string; label: string }[];
}
interface StudentOpt {
  id: string;
  label: string;
}
interface DraftRow {
  id: string;
  studentYearId: string;
  content: string;
  byteCount: number;
  byteLimit: number;
}

export function SetechBulkClient({
  semester,
  subjects,
  students,
  drafts,
}: {
  semester: number;
  subjects: SubjectOpt[];
  students: StudentOpt[];
  drafts: DraftRow[];
}) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [sectionId, setSectionId] = useState("");
  const [msg, setMsg] = useState("");
  const [importResult, setImportResult] = useState<{
    saved: { sid: string; subject: string; warnings: string[] }[];
    rejected: { sid: string; subject: string; reasons: string[] }[];
    skipped: { sid: string; subject: string; reason: string }[];
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const subject = subjects.find((s) => s.id === subjectId);

  function onExport() {
    setMsg("");
    startTransition(async () => {
      const r = await exportBulkSourceAction({
        subjectId,
        subjectName: subject?.name ?? "",
        sectionId: sectionId || null,
      });
      if (r.ok) {
        downloadCsv(r.csv, `세특원천_${subject?.name ?? ""}_${semester}학기.csv`);
        setMsg(`${r.count}명 원천자료를 내보냈습니다(점수 제외). 코워크에서 세특본문 열을 채워 다시 올리세요.`);
      } else {
        setMsg(r.message);
      }
    });
  }

  function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg("");
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const csv = String(reader.result ?? "");
      startTransition(async () => {
        const r = await importBulkResultAction({ semester, csv });
        if (r.ok) {
          setImportResult({
            saved: r.result.saved.map((s) => ({ sid: s.sid, subject: s.subject, warnings: s.warnings })),
            rejected: r.result.rejected,
            skipped: r.skipped,
          });
          setMsg(`저장 ${r.result.saved.length} · 거부 ${r.result.rejected.length} · 스킵 ${r.skipped.length}`);
        } else {
          setMsg(r.message);
        }
      });
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  return (
    <div className="mt-5 space-y-6">
      {/* 과목·분반 선택 + 내보내기 */}
      <section className="rounded-lg border border-neutral-200 p-4">
        <h3 className="text-sm font-semibold text-neutral-700">① 원천자료 내보내기</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setSectionId("");
            }}
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          >
            <option value="">전체 분반</option>
            {subject?.sections.map((sec) => (
              <option key={sec.id} value={sec.id}>
                {sec.label}
              </option>
            ))}
          </select>
          <button
            onClick={onExport}
            disabled={pending || !subjectId}
            className="rounded bg-neutral-800 px-3 py-1 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            원천 CSV 다운로드
          </button>
        </div>
      </section>

      {/* 결과 업로드 */}
      <section className="rounded-lg border border-neutral-200 p-4">
        <h3 className="text-sm font-semibold text-neutral-700">
          ② 코워크 결과 CSV 업로드(학번+과목 매칭)
        </h3>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={onImport}
          disabled={pending}
          className="mt-3 block text-sm"
        />
        {importResult && (
          <div className="mt-3 space-y-2 text-xs">
            {importResult.saved.length > 0 && (
              <div className="rounded border border-emerald-200 bg-emerald-50 p-2">
                <p className="font-medium text-emerald-800">저장 {importResult.saved.length}</p>
                {importResult.saved
                  .filter((s) => s.warnings.length > 0)
                  .map((s, i) => (
                    <p key={i} className="text-amber-700">
                      ⚠ {s.sid} {s.subject} — {s.warnings.join("; ")}
                    </p>
                  ))}
              </div>
            )}
            {importResult.rejected.length > 0 && (
              <div className="rounded border border-red-200 bg-red-50 p-2">
                <p className="font-medium text-red-700">거부 {importResult.rejected.length}(바이트 초과·빈 내용)</p>
                {importResult.rejected.map((r, i) => (
                  <p key={i} className="text-red-600">
                    ⛔ {r.sid} {r.subject} — {r.reasons.join("; ")}
                  </p>
                ))}
              </div>
            )}
            {importResult.skipped.length > 0 && (
              <div className="rounded border border-neutral-200 bg-neutral-50 p-2">
                <p className="font-medium text-neutral-600">스킵 {importResult.skipped.length}(미매칭·형식오류)</p>
                {importResult.skipped.map((s, i) => (
                  <p key={i} className="text-neutral-500">
                    {s.sid} {s.subject} — {s.reason}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 학생×과목 추가입력 */}
      <ExtraNoteForm subjects={subjects} students={students} />

      {msg && <p className="text-xs text-neutral-500">{msg}</p>}

      {/* 저장된 초안 */}
      <section>
        <h3 className="text-sm font-semibold text-neutral-700">저장된 초안 {drafts.length}</h3>
        {drafts.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">아직 저장된 세특 초안이 없습니다.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {drafts.map((d) => {
              const st = students.find((s) => s.id === d.studentYearId);
              return (
                <li key={d.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
                  <div className="flex justify-between text-xs text-neutral-400">
                    <span>{st?.label ?? "—"}</span>
                    <span>
                      {d.byteCount}/{d.byteLimit} byte
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-neutral-700">{d.content}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** 학생×과목 추가 입력(자율 탐구 등). */
function ExtraNoteForm({
  subjects,
  students,
}: {
  subjects: SubjectOpt[];
  students: StudentOpt[];
}) {
  const [studentYearId, setStudentYearId] = useState(students[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, startTransition] = useTransition();

  function onSave() {
    setMsg("");
    startTransition(async () => {
      const r = await saveExtraNoteAction({ studentYearId, subjectId: subjectId || null, body });
      if (r.ok) {
        setBody("");
        setMsg("추가 입력을 저장했습니다.");
      } else {
        setMsg(r.message ?? "저장 실패");
      }
    });
  }

  return (
    <section className="rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-700">학생 추가 입력(자율 탐구 등)</h3>
      <p className="mt-1 text-xs text-neutral-400">세특 원천자료에 합류합니다. 점수가 아닌 활동 서술을 기입하세요.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={studentYearId}
          onChange={(e) => setStudentYearId(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="자율 탐구 등 추가 내역(사실 위주)"
        className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
      />
      <button
        onClick={onSave}
        disabled={pending || !studentYearId || !body.trim()}
        className="mt-2 rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        추가 입력 저장
      </button>
      {msg && <p className="mt-1 text-xs text-neutral-500">{msg}</p>}
    </section>
  );
}
