"use client";
import { useState, useTransition } from "react";
import { Paginator } from "@/lib/ui/paginator";
import { paginate } from "@/lib/db/pagination";
import {
  exportBulkSourceAction,
  importBulkResultAction,
  saveExtraNoteAction,
  updateExtraNoteAction,
  deleteExtraNoteAction,
} from "./actions";
import { downloadCsv } from "@/lib/ui/download-csv";
import { bulkResultCsvExample } from "@/lib/setech";

const PAGE_SIZE = 10;

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
interface ExtraNoteRow {
  id: string;
  studentYearId: string;
  subjectId: string | null;
  body: string;
}

export function SetechBulkClient({
  semester,
  subjects,
  students,
  enrollmentBySubject,
  drafts,
  extraNotes,
}: {
  semester: number;
  subjects: SubjectOpt[];
  students: StudentOpt[];
  enrollmentBySubject: Record<string, string[]>;
  drafts: DraftRow[];
  extraNotes: ExtraNoteRow[];
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
  const [draftPage, setDraftPage] = useState(1);
  const {
    pageItems: draftPageItems,
    totalPages: draftTotalPages,
    currentPage: draftCurrentPage,
  } = paginate(drafts, draftPage, PAGE_SIZE);

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
        <h3 className="text-sm font-normal text-neutral-700">① 원천자료 내보내기</h3>
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
            className="rounded-full border border-white/25 bg-transparent px-3 py-1 text-sm text-white hover:bg-white/10 disabled:opacity-50"
          >
            원천 CSV 다운로드
          </button>
        </div>
      </section>

      {/* 결과 업로드 */}
      <section className="rounded-lg border border-neutral-200 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-normal text-neutral-700">
            ② 코워크 결과 CSV 업로드(학번+과목 매칭)
          </h3>
          <button
            type="button"
            onClick={() =>
              downloadCsv(bulkResultCsvExample(), "세특_업로드_예시.csv")
            }
            className="rounded-full border border-white/25 bg-transparent px-2 py-1 text-xs hover:bg-white/10"
          >
            ⬇ 예시 CSV 다운로드
          </button>
        </div>
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
                <p className="font-normal text-emerald-800">저장 {importResult.saved.length}</p>
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
                <p className="font-normal text-red-700">거부 {importResult.rejected.length}(바이트 초과·빈 내용)</p>
                {importResult.rejected.map((r, i) => (
                  <p key={i} className="text-red-600">
                    ⛔ {r.sid} {r.subject} — {r.reasons.join("; ")}
                  </p>
                ))}
              </div>
            )}
            {importResult.skipped.length > 0 && (
              <div className="rounded border border-neutral-200 bg-neutral-50 p-2">
                <p className="font-normal text-neutral-600">스킵 {importResult.skipped.length}(미매칭·형식오류)</p>
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

      {/* 학생×과목 추가입력 + 목록(CRUD) */}
      <ExtraNoteForm
        subjects={subjects}
        students={students}
        enrollmentBySubject={enrollmentBySubject}
        extraNotes={extraNotes}
      />

      {msg && <p className="text-xs text-neutral-500">{msg}</p>}

      {/* 저장된 초안 */}
      <section>
        <h3 className="text-sm font-normal text-neutral-700">저장된 초안 {drafts.length}</h3>
        {drafts.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">아직 저장된 세특 초안이 없습니다.</p>
        ) : (
          <>
            <ul className="mt-2 space-y-2">
              {draftPageItems.map((d) => {
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
            <Paginator
              currentPage={draftCurrentPage}
              totalPages={draftTotalPages}
              onPageChange={setDraftPage}
              className="mt-3"
            />
          </>
        )}
      </section>
    </div>
  );
}

/** 학생×과목 추가 입력(자율 탐구 등) + 저장 목록(수정/삭제). */
function ExtraNoteForm({
  subjects,
  students,
  enrollmentBySubject,
  extraNotes,
}: {
  subjects: SubjectOpt[];
  students: StudentOpt[];
  enrollmentBySubject: Record<string, string[]>;
  extraNotes: ExtraNoteRow[];
}) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [studentYearId, setStudentYearId] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, startTransition] = useTransition();
  const [page, setPage] = useState(1);
  const { pageItems, totalPages, currentPage } = paginate(
    extraNotes,
    page,
    PAGE_SIZE,
  );

  // AC-4.2 과목 선택 시 그 과목 수강생만 드롭다운.
  const enrolledIds = new Set(enrollmentBySubject[subjectId] ?? []);
  const filteredStudents = students.filter((s) => enrolledIds.has(s.id));
  const effectiveStudentId =
    studentYearId && enrolledIds.has(studentYearId)
      ? studentYearId
      : (filteredStudents[0]?.id ?? "");

  const labelById = new Map(students.map((s) => [s.id, s.label]));
  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));

  function onSave() {
    setMsg("");
    startTransition(async () => {
      const r = await saveExtraNoteAction({
        studentYearId: effectiveStudentId,
        subjectId: subjectId || null,
        body,
      });
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
      <h3 className="text-sm font-normal text-neutral-700">학생 추가 입력(자율 탐구 등)</h3>
      <p className="mt-1 text-xs text-neutral-400">
        세특 원천자료에 합류합니다. 과목을 고르면 그 과목 수강생만 표시됩니다. 점수가
        아닌 활동 서술을 기입하세요.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value);
            setStudentYearId("");
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
          value={effectiveStudentId}
          onChange={(e) => setStudentYearId(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          {filteredStudents.length === 0 ? (
            <option value="">수강생 없음</option>
          ) : (
            filteredStudents.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))
          )}
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
        disabled={pending || !effectiveStudentId || !body.trim()}
        className="mt-2 rounded-full border border-white/25 bg-transparent px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50"
      >
        추가 입력 저장
      </button>
      {msg && <p className="mt-1 text-xs text-neutral-500">{msg}</p>}

      {/* AC-4.3 저장된 추가 입력 목록(수정/삭제) */}
      <div className="mt-4 border-t border-neutral-100 pt-3">
        <h4 className="text-xs font-normal text-neutral-600">
          저장된 추가 입력 {extraNotes.length}
        </h4>
        {extraNotes.length === 0 ? (
          <p className="mt-1 text-xs text-neutral-400">아직 추가 입력이 없습니다.</p>
        ) : (
          <>
            <ul className="mt-2 space-y-2">
              {pageItems.map((n) => (
                <ExtraNoteItem
                  key={n.id}
                  note={n}
                  studentLabel={labelById.get(n.studentYearId) ?? "—"}
                  subjectName={
                    n.subjectId ? (subjectNameById.get(n.subjectId) ?? "—") : "공통"
                  }
                />
              ))}
            </ul>
            <Paginator
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
              className="mt-3"
            />
          </>
        )}
      </div>
    </section>
  );
}

/** 추가 입력 1행(인라인 수정·삭제). */
function ExtraNoteItem({
  note,
  studentLabel,
  subjectName,
}: {
  note: ExtraNoteRow;
  studentLabel: string;
  subjectName: string;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const [pending, startTransition] = useTransition();

  function onUpdate() {
    startTransition(async () => {
      const r = await updateExtraNoteAction({ id: note.id, body });
      if (r.ok) setEditing(false);
    });
  }
  function onDelete() {
    startTransition(async () => {
      await deleteExtraNoteAction({ id: note.id });
    });
  }

  return (
    <li className="rounded border border-neutral-200 p-2 text-sm">
      <div className="flex items-center justify-between text-xs text-neutral-400">
        <span>
          {studentLabel} · {subjectName}
        </span>
        <span className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={onUpdate}
                disabled={pending || !body.trim()}
                className="text-emerald-600 hover:underline disabled:opacity-50"
              >
                저장
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setBody(note.body);
                }}
                className="text-neutral-400 hover:underline"
              >
                취소
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="text-neutral-500 hover:underline"
              >
                수정
              </button>
              <button
                onClick={onDelete}
                disabled={pending}
                className="text-red-500 hover:underline disabled:opacity-50"
              >
                삭제
              </button>
            </>
          )}
        </span>
      </div>
      {editing ? (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-neutral-700">{note.body}</p>
      )}
    </li>
  );
}
