"use client";
import { useState } from "react";
import {
  createTeacherNoteAction,
  updateTeacherNoteAction,
  deleteTeacherNoteAction,
} from "./actions";
import type { TeacherNoteRow } from "@/lib/db/queries";

/**
 * 다중 교사 한마디 관리 (QC v3 Part B AC-10.1). 목록(sortOrder 순) + 추가 + 인라인 수정 +
 * 삭제. 공개 페이지에서 스와이프로 노출될 여러 한마디를 관리한다.
 */
export function NotesManager({ notes }: { notes: TeacherNoteRow[] }) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <section className="mt-6 rounded-lg border border-neutral-200 p-5">
      <h2 className="text-sm font-semibold text-neutral-700">교사 한마디 (다중)</h2>
      <p className="mt-1 text-xs text-neutral-400">
        여러 개를 등록하면 공개 페이지에서 순서대로 노출됩니다.
      </p>

      <form action={createTeacherNoteAction} className="mt-3 flex gap-2">
        <input
          name="body"
          required
          placeholder="새 한마디"
          className="flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700">
          추가
        </button>
      </form>

      {notes.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">등록된 한마디가 없습니다.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-lg border border-neutral-200 p-3 text-sm"
            >
              {editing === n.id ? (
                <form
                  action={updateTeacherNoteAction}
                  onSubmit={() => setEditing(null)}
                  className="flex gap-2"
                >
                  <input type="hidden" name="id" value={n.id} />
                  <input
                    name="body"
                    defaultValue={n.body}
                    required
                    className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
                  />
                  <button className="text-xs text-neutral-700 hover:underline">
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="text-xs text-neutral-400 hover:underline"
                  >
                    취소
                  </button>
                </form>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span>{n.body}</span>
                  <span className="flex shrink-0 gap-3">
                    <button
                      type="button"
                      onClick={() => setEditing(n.id)}
                      className="text-xs text-neutral-500 hover:underline"
                    >
                      수정
                    </button>
                    <form action={deleteTeacherNoteAction} className="inline">
                      <input type="hidden" name="id" value={n.id} />
                      <button className="text-xs text-red-500 hover:underline">
                        삭제
                      </button>
                    </form>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
