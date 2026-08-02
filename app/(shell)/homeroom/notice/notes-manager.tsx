"use client";
import { useState } from "react";
import { Paginator } from "@/lib/ui/paginator";
import { paginate } from "@/lib/db/pagination";
import {
  createAllTeacherNoteAction,
  bulkCreateIndividualNotesAction,
  updateTeacherNoteAction,
  deleteTeacherNoteAction,
  reorderTeacherNoteAction,
} from "./actions";
import type { TeacherNoteRow } from "@/lib/db/queries";
import { Button } from "@/app/ui/button";
import { ConfirmButton } from "@/app/ui/confirm-button";

/** 공개 페이지 대상 학생 옵션(학번 라벨). */
export interface NoteStudentOption {
  id: string;
  label: string;
}

const PAGE_SIZE = 10;

/**
 * 다중 교사 한마디 관리 (QC v4 US-5, AC-5.1~5.2). 목록(sortOrder 순) + 추가 + 인라인 수정 +
 * 삭제 + 순서변경(위/아래) + 대상(전체/특정학생) 다중 선택. 10개씩 페이지네이션.
 * 공개 페이지에서 스와이프로 노출될 여러 한마디를 관리한다.
 */
export function NotesManager({
  notes,
  students,
}: {
  notes: TeacherNoteRow[];
  students: NoteStudentOption[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { pageItems, totalPages, currentPage } = paginate(
    notes,
    page,
    PAGE_SIZE,
  );

  return (
    <section className="mt-6 rounded-lg border border-neutral-200 p-5">
      <h2 className="text-sm text-neutral-700">교사 한마디</h2>

      <div className="mt-3 grid gap-3 [&>*]:min-w-0 md:grid-cols-2">
        <AllNoticeForm />
        <IndividualNoticeForm students={students} />
      </div>

      {notes.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">등록된 한마디가 없습니다.</p>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {pageItems.map((n, i) => {
              const globalIdx = (currentPage - 1) * PAGE_SIZE + i;
              return (
                <li
                  key={n.id}
                  className="rounded-lg border border-neutral-200 p-3 text-sm"
                >
                  {editing === n.id ? (
                    <form
                      action={updateTeacherNoteAction}
                      onSubmit={() => setEditing(null)}
                      className="space-y-2"
                    >
                      <input type="hidden" name="id" value={n.id} />
                      <div className="flex flex-wrap gap-2">
                        <input aria-label="공지 내용"
                          name="body"
                          defaultValue={n.body}
                          required
                          className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
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
                      </div>
                      <TargetPicker
                        students={students}
                        defaultScope={n.targetScope}
                        defaultSelected={n.targetStudentYearIds}
                      />
                    </form>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="break-words">{n.body}</span>
                        <TargetBadge note={n} students={students} />
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <ReorderButtons
                          id={n.id}
                          isFirst={globalIdx === 0}
                          isLast={globalIdx === notes.length - 1}
                        />
                        <button
                          type="button"
                          onClick={() => setEditing(n.id)}
                          className="text-xs text-neutral-500 hover:underline"
                        >
                          수정
                        </button>
                        <form
                          action={deleteTeacherNoteAction}
                          className="inline"
                        >
                          <input type="hidden" name="id" value={n.id} />
                          <ConfirmButton
                            message="이 공지를 삭제할까요? 되돌릴 수 없습니다."
                            className="text-xs text-red-500 hover:underline"
                          >
                            삭제
                          </ConfirmButton>
                        </form>
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <Paginator
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
            className="mt-3"
          />
        </>
      )}
    </section>
  );
}

/** 전체 공지란 — 본문 1칸 + 추가. target_scope='all' 1건 생성(AC-5.2). */
function AllNoticeForm() {
  return (
    <form
      action={createAllTeacherNoteAction}
      className="rounded-lg border border-neutral-200 p-3"
    >
      <h3 className="text-xs text-neutral-700">전체 공지</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        <input aria-label="전체 공지 내용"
          name="body"
          required
          placeholder="전체 공지 내용"
          className="min-w-0 flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <Button className="px-3 py-1.5 text-sm">
          추가
        </Button>
      </div>
    </form>
  );
}

/**
 * 개별 공지란 — 학생 토글 멀티선택 + 공통 본문 + 추가(AC-5.3). 선택 학생 N명 각자에게
 * 별도 개별공지 N개 생성. 각 공지는 이후 목록에서 독립 수정/삭제 가능.
 */
function IndividualNoticeForm({ students }: { students: NoteStudentOption[] }) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <form
      action={bulkCreateIndividualNotesAction}
      className="rounded-lg border border-neutral-200 p-3"
    >
      <h3 className="text-xs text-neutral-700">개별 공지</h3>

      {selected.map((id) => (
        <input key={id} type="hidden" name="studentYearIds" value={id} />
      ))}

      <div className="mt-2 flex flex-wrap gap-2">
        <input aria-label="개별 공지 내용"
          name="body"
          required
          placeholder="개별 공지 내용"
          className="min-w-0 flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <Button
          disabled={selected.length === 0}
          className="px-3 py-1.5 text-sm disabled:opacity-40"
        >
          추가{selected.length > 0 && ` (${selected.length}명)`}
        </Button>
      </div>

      <div className="mt-2 rounded border border-neutral-100 bg-neutral-50 p-2">
        {students.length === 0 ? (
          <p className="text-xs text-neutral-400">담임반 학생이 없습니다.</p>
        ) : (
          <div className="flex max-h-32 flex-wrap gap-x-3 gap-y-1 overflow-y-auto">
            {students.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-1 text-xs text-neutral-700"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  onChange={() => toggle(s.id)}
                />
                {s.label}
              </label>
            ))}
          </div>
        )}
      </div>
    </form>
  );
}

/** 대상 범위 토글(전체/특정학생) + 특정학생 다중 선택 picker. */
function TargetPicker({
  students,
  defaultScope = "all",
  defaultSelected = [],
}: {
  students: NoteStudentOption[];
  defaultScope?: "all" | "individual";
  defaultSelected?: string[];
}) {
  const [scope, setScope] = useState<"all" | "individual">(defaultScope);

  return (
    <div className="rounded border border-neutral-100 bg-neutral-50 p-2">
      <div className="flex items-center gap-3 text-xs text-neutral-600">
        <span className="font-normal">대상</span>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="targetScope"
            value="all"
            checked={scope === "all"}
            onChange={() => setScope("all")}
          />
          전체
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="targetScope"
            value="individual"
            checked={scope === "individual"}
            onChange={() => setScope("individual")}
          />
          특정 학생
        </label>
      </div>
      {scope === "individual" && (
        <div className="mt-2">
          {students.length === 0 ? (
            <p className="text-xs text-neutral-400">담임반 학생이 없습니다.</p>
          ) : (
            <div className="flex max-h-32 flex-wrap gap-x-3 gap-y-1 overflow-y-auto">
              {students.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-1 text-xs text-neutral-700"
                >
                  <input
                    type="checkbox"
                    name="studentYearIds"
                    value={s.id}
                    defaultChecked={defaultSelected.includes(s.id)}
                  />
                  {s.label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 목록에서 대상 범위를 작은 배지로 표시. */
function TargetBadge({
  note,
  students,
}: {
  note: TeacherNoteRow;
  students: NoteStudentOption[];
}) {
  if (note.targetScope !== "individual") return null;
  const labels = note.targetStudentYearIds
    .map((id) => students.find((s) => s.id === id)?.label)
    .filter(Boolean);
  return (
    <span className="ml-2 inline-block rounded bg-neutral-200 px-1.5 py-0.5 text-[0.6875rem] text-neutral-600 xl:text-xs">
      특정 학생 {note.targetStudentYearIds.length}명
      {labels.length > 0 && `: ${labels.join(", ")}`}
    </span>
  );
}

/** 위/아래 순서 이동 버튼(경계는 비활성). */
function ReorderButtons({
  id,
  isFirst,
  isLast,
}: {
  id: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <span className="flex gap-1">
      <form action={reorderTeacherNoteAction} className="inline">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="direction" value="up" />
        <button
          disabled={isFirst}
          aria-label="위로"
          className="rounded border border-neutral-200 px-1.5 text-xs text-neutral-500 hover:bg-white/5 disabled:opacity-30"
        >
          ↑
        </button>
      </form>
      <form action={reorderTeacherNoteAction} className="inline">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="direction" value="down" />
        <button
          disabled={isLast}
          aria-label="아래로"
          className="rounded border border-neutral-200 px-1.5 text-xs text-neutral-500 hover:bg-white/5 disabled:opacity-30"
        >
          ↓
        </button>
      </form>
    </span>
  );
}
