"use client";
import { useActionState } from "react";
import {
  linkStudentsAction,
  resolveInheritanceAction,
  addClassRoleAction,
  deleteClassRoleAction,
  issuePublicLinkAction,
  type LinkStudentsState,
  type ResolveInheritanceState,
  type IssueLinkState,
} from "../actions";
import type { PendingLink, ClassRoleRow } from "@/lib/db/queries";

interface StudentRow {
  id: string;
  sid: string;
  name: string;
  grade: number;
  classNo: number;
  number: number;
  isHomeroom: boolean;
  roles: ClassRoleRow[];
}

/**
 * C4 학생 명단 UI (AC-4.1~4.6). 동명이인 매칭 실행 + 보류 큐 해소, 학급역할 CRUD,
 * 담임반 이모지(파생 true 만), 공개링크 발급(담임반만 — 서버가 재검증).
 */
export function StudentRoster({
  students,
  pending,
}: {
  students: StudentRow[];
  pending: PendingLink[];
}) {
  const [linkState, link, linking] = useActionState<LinkStudentsState, FormData>(
    linkStudentsAction,
    null,
  );

  return (
    <div className="mt-5 space-y-6">
      <section className="rounded-lg border border-neutral-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-700">
              동명이인 매칭
            </h3>
            <p className="mt-1 text-xs text-neutral-400">
              과거 연도와 이름을 대조해 유일하면 자동 상속, 동명이인이면 보류 큐로
              보냅니다.
            </p>
          </div>
          <form action={link}>
            <button
              type="submit"
              disabled={linking}
              className="rounded-md border border-neutral-800 bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              {linking ? "매칭 중…" : "매칭 실행"}
            </button>
          </form>
        </div>
        {linkState && linkState.ok && (
          <p className="mt-3 rounded border border-green-200 bg-green-50 p-2 text-xs text-green-800">
            ✅ 자동상속 {linkState.autoLinked} · 보류 {linkState.pending} · 신규{" "}
            {linkState.newPerson}
          </p>
        )}
        {linkState && !linkState.ok && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {linkState.message}
          </p>
        )}
      </section>

      {pending.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-amber-700">
            상속 보류 큐 ({pending.length})
          </h3>
          <div className="mt-2 space-y-2">
            {pending.map((p) => (
              <PendingRow key={p.yearLinkId} pending={p} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="text-sm font-semibold text-neutral-700">
          학생 ({students.length})
        </h3>
        {students.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">
            등록된 학생이 없습니다.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {students.map((s) => (
              <StudentCard key={s.id} student={s} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PendingRow({ pending }: { pending: PendingLink }) {
  const [state, action, busy] = useActionState<ResolveInheritanceState, FormData>(
    resolveInheritanceAction,
    null,
  );
  return (
    <form
      action={action}
      className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
    >
      <input type="hidden" name="yearLinkId" value={pending.yearLinkId} />
      <div className="font-medium">{pending.displayName} — 후보 선택</div>
      <div className="mt-2 space-y-1">
        {pending.candidates.map((c, i) => (
          <label key={c.personId} className="flex items-center gap-2 text-xs">
            <input
              type="radio"
              name="personId"
              value={c.personId}
              defaultChecked={i === 0}
            />
            {c.priorYear}학년도 · {c.priorSid} ({c.priorClassNo}반)
          </label>
        ))}
      </div>
      <button
        type="submit"
        disabled={busy}
        className="mt-2 rounded border border-amber-600 bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-700 disabled:opacity-40"
      >
        {busy ? "확정 중…" : "상속 확정"}
      </button>
      {state && !state.ok && (
        <span className="ml-2 text-xs text-red-700">{state.message}</span>
      )}
    </form>
  );
}

function StudentCard({ student }: { student: StudentRow }) {
  const [linkState, issue, issuing] = useActionState<IssueLinkState, FormData>(
    issuePublicLinkAction,
    null,
  );
  return (
    <div className="rounded border border-neutral-200 px-4 py-3 text-sm">
      <div className="flex items-center justify-between">
        <span>
          {student.isHomeroom && <span className="mr-1">🏠</span>}
          <strong>{student.name}</strong>{" "}
          <span className="text-xs text-neutral-400">
            {student.sid} ({student.grade}-{student.classNo}-{student.number})
          </span>
        </span>
        {student.isHomeroom && (
          <form action={issue}>
            <input type="hidden" name="studentYearId" value={student.id} />
            <button
              type="submit"
              disabled={issuing}
              className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-40"
            >
              {issuing ? "발급…" : "공개링크 발급"}
            </button>
          </form>
        )}
      </div>

      {linkState && linkState.ok && linkState.studentYearId === student.id && (
        <p className="mt-2 break-all rounded bg-neutral-50 p-2 text-xs text-neutral-600">
          /p/{linkState.token}
        </p>
      )}
      {linkState && !linkState.ok && (
        <p className="mt-2 text-xs text-red-700">{linkState.message}</p>
      )}

      {/* 학급역할 */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {student.roles.map((r) => (
          <span
            key={r.id}
            className="flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5 text-xs"
          >
            {r.roleName}
            <form action={deleteClassRoleAction} className="inline">
              <input type="hidden" name="roleId" value={r.id} />
              <button className="text-neutral-400 hover:text-red-600">×</button>
            </form>
          </span>
        ))}
        <form action={addClassRoleAction} className="flex items-center gap-1">
          <input type="hidden" name="studentYearId" value={student.id} />
          <input
            name="roleName"
            placeholder="역할 추가"
            className="w-24 rounded border border-neutral-200 px-2 py-0.5 text-xs"
          />
          <button className="rounded border border-neutral-300 px-1.5 py-0.5 text-xs hover:bg-neutral-50">
            +
          </button>
        </form>
      </div>
    </div>
  );
}
