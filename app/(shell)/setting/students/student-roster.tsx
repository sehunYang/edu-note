"use client";
import { useActionState, useMemo, useState } from "react";
import { Paginator } from "@/lib/ui/paginator";
import { paginate } from "@/lib/db/pagination";
import {
  linkStudentsAction,
  resolveInheritanceAction,
  addClassRoleAction,
  deleteClassRoleAction,
  issuePublicLinkAction,
  deleteStudentAction,
  updateStudentAttrsAction,
  type LinkStudentsState,
  type ResolveInheritanceState,
  type IssueLinkState,
  type DeleteStudentState,
  type UpdateStudentState,
} from "../actions";
import type { PendingLink, ClassRoleRow } from "@/lib/db/queries";
import { Button } from "@/app/ui/button";

interface StudentRow {
  id: string;
  sid: string;
  name: string;
  grade: number;
  classNo: number;
  number: number;
  phone: string | null;
  career: string | null;
  isHomeroom: boolean;
  roles: ClassRoleRow[];
  subjects: string[]; // 수강중인수업(학기 구분 과목명)
  priorSids: string[]; // 과거 학번("연도 학번")
  activeToken: string | null; // 활성(미폐기) 공개 토큰 — 새로고침에도 영속 표시(AC-12.9)
}

const PAGE_SIZE = 20;

/**
 * QC v2 학생 명단 모체 데이터 UI (AC-C1~C7). 전 속성 표시·인라인 수정(이름/연락처/희망진로)·
 * 하드삭제·공개링크 복사·필터(학년/반/번호+이름). 동명이인 매칭·학급역할 CRUD 는 C4 유지.
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

  const [fGrade, setFGrade] = useState("");
  const [fClass, setFClass] = useState("");
  const [fNumber, setFNumber] = useState("");
  const [fName, setFName] = useState("");
  // 필터 변경 시 1페이지로 리셋(현재 페이지가 사라져 빈 화면이 되는 것 방지).
  const [page, setPage] = useState(1);
  function setFilter(setter: (v: string) => void, v: string) {
    setter(v);
    setPage(1);
  }

  const grades = useMemo(
    () => [...new Set(students.map((s) => s.grade))].sort((a, b) => a - b),
    [students],
  );
  const classes = useMemo(
    () => [...new Set(students.map((s) => s.classNo))].sort((a, b) => a - b),
    [students],
  );

  const filtered = students.filter((s) => {
    if (fGrade && String(s.grade) !== fGrade) return false;
    if (fClass && String(s.classNo) !== fClass) return false;
    if (fNumber && String(s.number) !== fNumber) return false;
    if (fName && !s.name.includes(fName.trim())) return false;
    return true;
  });

  // 필터링된 명단에 페이지네이션(20개씩)을 적용한다.
  const { pageItems, totalPages, currentPage } = paginate(
    filtered,
    page,
    PAGE_SIZE,
  );

  return (
    <div className="mt-5 space-y-6">
      <section className="rounded-lg border border-neutral-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm text-neutral-700">
              동명이인 매칭
            </h3>
            <p className="mt-1 text-xs text-neutral-400">
              과거 연도와 이름을 대조해 유일하면 자동 상속, 동명이인이면 보류 큐로
              보냅니다.
            </p>
          </div>
          <form action={link}>
            <Button
              type="submit"
              disabled={linking}
              className="px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {linking ? "매칭 중…" : "매칭 실행"}
            </Button>
          </form>
        </div>
        {linkState && linkState.ok && (
          <p role="status" className="mt-3 rounded border border-green-200 bg-green-50 p-2 text-xs text-green-800">
            ✅ 자동상속 {linkState.autoLinked} · 보류 {linkState.pending} · 신규{" "}
            {linkState.newPerson}
          </p>
        )}
        {linkState && !linkState.ok && (
          <p role="status" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {linkState.message}
          </p>
        )}
      </section>

      {pending.length > 0 && (
        <section>
          <h3 className="text-sm text-amber-700">
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm text-neutral-700">
            학생 ({filtered.length}/{students.length})
          </h3>
          {/* 필터(client-side, AC-C6) */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <select aria-label="학년 필터"
              value={fGrade}
              onChange={(e) => setFilter(setFGrade, e.target.value)}
              className="rounded border border-neutral-300 px-1.5 py-0.5"
            >
              <option value="">학년</option>
              {grades.map((g) => (
                <option key={g} value={g}>
                  {g}학년
                </option>
              ))}
            </select>
            <select aria-label="반 필터"
              value={fClass}
              onChange={(e) => setFilter(setFClass, e.target.value)}
              className="rounded border border-neutral-300 px-1.5 py-0.5"
            >
              <option value="">반</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}반
                </option>
              ))}
            </select>
            <input aria-label="번호"
              value={fNumber}
              onChange={(e) => setFilter(setFNumber, e.target.value)}
              placeholder="번호"
              className="w-14 rounded border border-neutral-300 px-1.5 py-0.5"
            />
            <input aria-label="이름 검색"
              value={fName}
              onChange={(e) => setFilter(setFName, e.target.value)}
              placeholder="이름 검색"
              className="w-28 rounded border border-neutral-300 px-1.5 py-0.5"
            />
          </div>
        </div>
        {students.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">
            등록된 학생이 없습니다.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {pageItems.map((s) => (
              <StudentCard key={s.id} student={s} />
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-neutral-400">
                필터에 해당하는 학생이 없습니다.
              </p>
            )}
            <Paginator
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
              className="mt-3"
            />
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
      <div className="font-normal">{pending.displayName} — 후보 선택</div>
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
  const [delState, del, deleting] = useActionState<DeleteStudentState, FormData>(
    deleteStudentAction,
    null,
  );
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyLink(token: string) {
    const url = `${window.location.origin}/p/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  /** 값이 있는 속성만. 빈 칸은 그리지 않는다(D-9). */
  const facts: { label: string; value: string }[] = [
    student.phone ? { label: "연락처", value: student.phone } : null,
    student.career ? { label: "희망진로", value: student.career } : null,
    student.priorSids.length > 0
      ? { label: "과거학번", value: student.priorSids.join(", ") }
      : null,
    student.subjects.length > 0
      ? { label: "수강", value: student.subjects.join(", ") }
      : null,
  ].filter((f): f is { label: string; value: string } => f !== null);

  return (
    <div className="rounded border border-neutral-200 px-3 py-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <span>
          {student.isHomeroom && <span className="mr-1">🏠</span>}
          <strong>{student.name}</strong>{" "}
          <span className="text-xs text-neutral-400">
            {student.sid} ({student.grade}-{student.classNo}-{student.number})
          </span>
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            onClick={() => setEditing((v) => !v)}
            className="px-2 py-1 text-xs"
          >
            {editing ? "닫기" : "수정"}
          </Button>
          {student.isHomeroom && (
            <form action={issue}>
              <input type="hidden" name="studentYearId" value={student.id} />
              <Button
                type="submit"
                disabled={issuing}
                className="px-2 py-1 text-xs disabled:opacity-40"
              >
                {issuing
                  ? "발급…"
                  : student.activeToken
                    ? "공개링크 재발급"
                    : "공개링크 발급"}
              </Button>
            </form>
          )}
          {/* 하드삭제(AC-C3) — 우측 상단 빨간 X */}
          <form
            action={del}
            onSubmit={(e) => {
              if (!confirm(`${student.name} 학적을 삭제합니다. 계속할까요?`)) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="studentYearId" value={student.id} />
            <Button
              variant="destructive"
              type="submit"
              disabled={deleting}
              title="학적 삭제"
              className="px-2 py-1 text-xs disabled:opacity-40"
            >
              ✕
            </Button>
          </form>
        </div>
      </div>

      {delState && !delState.ok && (
        <p className="mt-1 text-xs text-red-700">{delState.message}</p>
      )}

      {/* 속성 표시(AC-C1).

          밀도 개선 D-9: 이전에는 연락처·희망진로·과거학번·수강중인수업 네 칸을
          값이 없어도 항상 그렸다. 실측 118명 전원이 대부분 미입력이라 화면에
          "—" 가 400개 넘게 깔렸고, 학생 한 명이 74px·한 페이지가 3,654px 였다.
          빈 칸은 정보가 아니라 잡음이다(밀도 칼럼: 데이터를 없애는 게 아니라
          드러낼 것을 골라 드러내라). 값이 있는 항목만 한 줄로 잇고, 전부
          비었으면 줄 자체를 그리지 않는다 — 채워진 학생은 오히려 눈에 띈다. */}
      {facts.length > 0 && (
        <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-neutral-600">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="inline text-neutral-400">{f.label} </dt>
              <dd className="inline">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* 인라인 수정(AC-C2) — 이름/연락처/희망진로 */}
      {editing && (
        <InlineEdit student={student} onDone={() => setEditing(false)} />
      )}

      {/* AC-12.9: 새로 발급한 토큰(우선) 또는 영속 활성 토큰을 항상 표시. */}
      {(() => {
        const shown =
          linkState && linkState.ok && linkState.studentYearId === student.id
            ? linkState.token
            : student.activeToken;
        if (!shown) return null;
        return (
          <div className="mt-2 flex items-center gap-2">
            <p className="break-all rounded bg-neutral-50 p-2 text-xs text-neutral-600">
              /p/{shown}
            </p>
            <Button
              onClick={() => copyLink(shown)}
              className="px-2 py-1 text-xs"
            >
              {copied ? "복사됨" : "복사"}
            </Button>
          </div>
        );
      })()}
      {linkState && !linkState.ok && (
        <p className="mt-2 text-xs text-red-700">{linkState.message}</p>
      )}

      {/* 학급역할 — 칩은 값이 있을 때만, 추가 폼은 "수정"을 눌렀을 때만(D-9).
          이전에는 역할이 하나도 없는 학생에게도 "역할 추가" 입력칸이 카드마다
          한 줄씩 붙어, 명단 한 페이지에 쓰이지 않는 입력칸이 20개 있었다. */}
      {(student.roles.length > 0 || editing) && (
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
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
        {editing && (
          <form action={addClassRoleAction} className="flex items-center gap-1">
            <input type="hidden" name="studentYearId" value={student.id} />
            <input aria-label="역할 추가"
              name="roleName"
              placeholder="역할 추가"
              className="w-24 rounded border border-neutral-200 px-2 py-0.5 text-xs"
            />
            <Button className="px-1.5 py-0.5 text-xs">
              +
            </Button>
          </form>
        )}
      </div>
      )}
    </div>
  );
}

function InlineEdit({
  student,
  onDone,
}: {
  student: StudentRow;
  onDone: () => void;
}) {
  const [state, action, busy] = useActionState<UpdateStudentState, FormData>(
    updateStudentAttrsAction,
    null,
  );
  return (
    <form
      action={(fd) => {
        action(fd);
        onDone();
      }}
      className="mt-2 flex flex-wrap items-center gap-2 rounded border border-neutral-100 bg-neutral-50 p-2 text-xs"
    >
      <input type="hidden" name="studentYearId" value={student.id} />
      <label className="flex items-center gap-1">
        이름
        <input
          name="name"
          defaultValue={student.name}
          className="w-24 rounded border border-neutral-300 px-1.5 py-0.5"
        />
      </label>
      <label className="flex items-center gap-1">
        연락처
        <input
          name="phone"
          defaultValue={student.phone ?? ""}
          className="w-36 rounded border border-neutral-300 px-1.5 py-0.5"
        />
      </label>
      <label className="flex items-center gap-1">
        희망진로
        <input
          name="career"
          defaultValue={student.career ?? ""}
          className="w-28 rounded border border-neutral-300 px-1.5 py-0.5"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded border border-green-600 bg-green-600 px-2 py-0.5 text-white hover:bg-green-500 disabled:opacity-40"
      >
        {busy ? "저장…" : "저장"}
      </button>
      {state && !state.ok && <span role="status" className="text-red-700">{state.message}</span>}
    </form>
  );
}
