"use client";
import { useState, useTransition } from "react";
import { Paginator } from "@/lib/ui/paginator";
import { paginate } from "@/lib/db/pagination";
import {
  addBehaviorNoteAction,
  updateBehaviorNoteAction,
  deleteBehaviorNoteAction,
} from "./actions";

const PAGE_SIZE = 10;

/**
 * 행동특성 기록 클라이언트 (교실 2-2 단계5 인접보정). 담임반 학생 셀렉트 +
 * 날짜 입력(기본 당일 + 캘린더) + 추가, 최근 목록 행별 수정·삭제.
 * neutral Tailwind(observations-client 와 일관).
 */
export interface HomeroomStudent {
  id: string;
  sid: string;
  name: string;
}

export interface RecentBehaviorNote {
  id: string;
  studentLabel: string;
  notedOn: string;
  body: string;
  keywords: string[];
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BehaviorClient({
  students,
  recent,
  initialStudentId = "",
}: {
  students: HomeroomStudent[];
  recent: RecentBehaviorNote[];
  initialStudentId?: string;
}) {
  const [studentId, setStudentId] = useState(initialStudentId);
  const [notedOn, setNotedOn] = useState(todayStr());
  const [body, setBody] = useState("");
  const [keywords, setKeywords] = useState("");
  const [pending, startTransition] = useTransition();
  const [page, setPage] = useState(1);
  const { pageItems, totalPages, currentPage } = paginate(
    recent,
    page,
    PAGE_SIZE,
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!studentId || !body.trim()) return;
    const fd = new FormData();
    fd.set("studentYearId", studentId);
    fd.set("notedOn", notedOn);
    fd.set("body", body);
    fd.set("keywords", keywords);
    startTransition(async () => {
      await addBehaviorNoteAction(fd);
      setBody("");
      setKeywords("");
    });
  }

  return (
    <div className="mt-6 space-y-6">
      <form
        onSubmit={onSubmit}
        className="space-y-3 rounded-lg border border-neutral-200 p-5"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-neutral-600">
              학생 (담임반)
            </label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              <option value="">학생 선택</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sid} {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-neutral-600">기록일</label>
            <input
              type="date"
              value={notedOn}
              onChange={(e) => setNotedOn(e.target.value)}
              className="mt-1 block rounded border border-neutral-300 px-2 py-1 text-sm"
            />
          </div>
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={3}
          placeholder="행동특성(사실 위주)"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="키워드(콤마/공백 구분)"
          className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={pending || !studentId || !body.trim()}
          className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {pending ? "저장 중…" : "행특 저장"}
        </button>
      </form>

      <section>
        <h3 className="text-xs font-semibold text-neutral-500">
          최근 행특 {recent.length}
        </h3>
        <ul className="mt-2 space-y-2">
          {pageItems.map((b) => (
            <BehaviorRow key={b.id} note={b} />
          ))}
        </ul>
        <Paginator
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
          className="mt-3"
        />
      </section>
    </div>
  );
}

function BehaviorRow({ note }: { note: RecentBehaviorNote }) {
  const [editing, setEditing] = useState(false);
  const [notedOn, setNotedOn] = useState(note.notedOn);
  const [body, setBody] = useState(note.body);
  const [keywords, setKeywords] = useState(note.keywords.join(" "));
  const [pending, startTransition] = useTransition();

  function onSave() {
    if (!body.trim()) return;
    const fd = new FormData();
    fd.set("id", note.id);
    fd.set("notedOn", notedOn);
    fd.set("body", body);
    fd.set("keywords", keywords);
    startTransition(async () => {
      await updateBehaviorNoteAction(fd);
      setEditing(false);
    });
  }

  function onDelete() {
    if (!confirm("이 행동특성 기록을 삭제할까요?")) return;
    const fd = new FormData();
    fd.set("id", note.id);
    startTransition(async () => {
      await deleteBehaviorNoteAction(fd);
    });
  }

  if (editing) {
    return (
      <li className="rounded border border-neutral-200 p-3 text-sm">
        <input
          type="date"
          value={notedOn}
          onChange={(e) => setNotedOn(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 text-xs"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="키워드(콤마/공백 구분)"
          className="mt-2 w-full rounded border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="rounded bg-neutral-800 px-3 py-1 text-xs text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            저장
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
          >
            취소
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded border border-neutral-100 p-2 text-sm">
      <div className="flex justify-between text-xs text-neutral-400">
        <span>{note.studentLabel}</span>
        <span>{note.notedOn}</span>
      </div>
      <p className="mt-0.5 whitespace-pre-wrap text-neutral-700">{note.body}</p>
      {note.keywords.length > 0 && (
        <p className="mt-0.5 text-xs text-blue-600">#{note.keywords.join(" #")}</p>
      )}
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-neutral-500 hover:underline"
        >
          수정
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="text-xs text-red-500 hover:underline disabled:opacity-50"
        >
          삭제
        </button>
      </div>
    </li>
  );
}
