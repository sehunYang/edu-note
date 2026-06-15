"use client";
import { useActionState, useMemo, useState } from "react";
import {
  saveLessonUnitAction,
  deleteLessonUnitAction,
  saveExamTargetAction,
  type PlanActionState,
} from "../actions";
import { sixDigitCode } from "@/lib/domain/lesson-unit";

/**
 * 학기 계획 클라이언트 에디터 (QC v4 US-2). 과목 선택 → 세부단원 트리 편집 +
 * 시험별 목표진도 범위 토글. 단원/시험목표 저장은 서버액션(useActionState).
 * neutral Tailwind 스타일(기존 plan-editor 일관).
 */
export interface SemesterUnit {
  id: string;
  majorNo: number;
  midNo: number;
  minorNo: number;
  majorName: string;
  midName: string;
  minorName: string;
  keywords: string[];
  minOrdinals: number;
}

export interface SemesterExamTarget {
  examOrdinal: number;
  fromCode: number | null;
  toCode: number | null;
}

export interface SubjectSemesterView {
  subjectId: string;
  subjectName: string;
  /** 세팅실에서 체크된 시험 차수(1/2). */
  examOrdinals: number[];
  units: SemesterUnit[];
  examTargets: SemesterExamTarget[];
}

const INIT: PlanActionState = { ok: true };

function code6(u: { majorNo: number; midNo: number; minorNo: number }): string {
  return String(sixDigitCode(u)).padStart(6, "0");
}

export function SemesterEditor({ subjects }: { subjects: SubjectSemesterView[] }) {
  const [selectedId, setSelectedId] = useState(subjects[0]?.subjectId ?? "");
  const selected =
    subjects.find((s) => s.subjectId === selectedId) ?? subjects[0];

  const sortedUnits = useMemo(() => {
    return [...(selected?.units ?? [])].sort(
      (a, b) => sixDigitCode(a) - sixDigitCode(b),
    );
  }, [selected]);

  if (!selected) return null;

  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-center gap-2">
        <label className="text-sm text-neutral-600">과목</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          {subjects.map((s) => (
            <option key={s.subjectId} value={s.subjectId}>
              {s.subjectName}
            </option>
          ))}
        </select>
        <span className="text-xs text-neutral-400">단원 {sortedUnits.length}개</span>
      </div>

      <section>
        <h3 className="text-sm font-semibold text-neutral-700">세부 단원</h3>
        <p className="mt-1 text-xs text-neutral-400">
          6자리 코드 = 대단원(2)·중단원(2)·소단원(2). 차시 계획에서 이 코드로 단원을
          자동 채웁니다.
        </p>
        <ul className="mt-3 space-y-3">
          {sortedUnits.map((u) => (
            <UnitRow key={u.id} subjectId={selected.subjectId} unit={u} />
          ))}
        </ul>
        <UnitRow subjectId={selected.subjectId} />
      </section>

      <ExamTargetsSection subject={selected} units={sortedUnits} />
    </div>
  );
}

function UnitRow({
  subjectId,
  unit,
}: {
  subjectId: string;
  unit?: SemesterUnit;
}) {
  const [saveState, saveAction] = useActionState(saveLessonUnitAction, INIT);
  const [deleteState, deleteAction] = useActionState(
    deleteLessonUnitAction,
    INIT,
  );
  const isNew = !unit;

  return (
    <li className="rounded-lg border border-neutral-200 p-4">
      {unit && (
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-mono text-blue-600">{code6(unit)}</span>
          <form action={deleteAction}>
            <input type="hidden" name="subjectId" value={subjectId} />
            <input type="hidden" name="unitId" value={unit.id} />
            <button className="text-xs text-neutral-400 hover:text-red-600">
              삭제
            </button>
          </form>
        </div>
      )}
      <form action={saveAction} className="space-y-2">
        <input type="hidden" name="subjectId" value={subjectId} />
        <div className="grid grid-cols-3 gap-2">
          <NumName
            label="대단원"
            noName="majorNo"
            nameName="majorName"
            noVal={unit?.majorNo}
            nameVal={unit?.majorName}
          />
          <NumName
            label="중단원"
            noName="midNo"
            nameName="midName"
            noVal={unit?.midNo}
            nameVal={unit?.midName}
          />
          <NumName
            label="소단원"
            noName="minorNo"
            nameName="minorName"
            noVal={unit?.minorNo}
            nameVal={unit?.minorName}
          />
        </div>
        <input
          name="keywords"
          defaultValue={(unit?.keywords ?? []).join(" ")}
          placeholder="핵심개념(콤마/공백 구분, #는 자동 제거)"
          className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-500">최소 차시</label>
          <input
            type="number"
            name="minOrdinals"
            min={1}
            defaultValue={unit?.minOrdinals ?? 1}
            className="w-20 rounded border border-neutral-300 px-2 py-1 text-sm"
          />
          <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700">
            {isNew ? "단원 추가" : "저장"}
          </button>
        </div>
        {!saveState.ok && saveState.error && (
          <p className="text-xs text-red-600">{saveState.error}</p>
        )}
        {!deleteState.ok && deleteState.error && (
          <p className="text-xs text-red-600">{deleteState.error}</p>
        )}
      </form>
    </li>
  );
}

function NumName({
  label,
  noName,
  nameName,
  noVal,
  nameVal,
}: {
  label: string;
  noName: string;
  nameName: string;
  noVal?: number;
  nameVal?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-xs text-neutral-500">{label}</span>
        <input
          type="number"
          name={noName}
          min={0}
          max={99}
          defaultValue={noVal ?? ""}
          placeholder="번호"
          className="w-14 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <input
        name={nameName}
        defaultValue={nameVal ?? ""}
        placeholder={`${label}명`}
        className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
      />
    </div>
  );
}

function ExamTargetsSection({
  subject,
  units,
}: {
  subject: SubjectSemesterView;
  units: SemesterUnit[];
}) {
  if (subject.examOrdinals.length === 0) {
    return (
      <section>
        <h3 className="text-sm font-semibold text-neutral-700">시험별 목표 진도</h3>
        <p className="mt-1 text-xs text-neutral-400">
          세팅실 학사일정에 등록된 시험(1차/2차)이 없습니다. 시험을 등록하면 목표
          진도 범위를 지정할 수 있습니다.
        </p>
      </section>
    );
  }
  return (
    <section>
      <h3 className="text-sm font-semibold text-neutral-700">시험별 목표 진도</h3>
      <p className="mt-1 text-xs text-neutral-400">
        시험까지 진행할 소단원 범위(어디~어디)를 지정합니다.
      </p>
      <ul className="mt-3 space-y-3">
        {subject.examOrdinals.map((ord) => (
          <ExamTargetRow
            key={ord}
            subjectId={subject.subjectId}
            examOrdinal={ord}
            existing={subject.examTargets.find((t) => t.examOrdinal === ord)}
            units={units}
          />
        ))}
      </ul>
    </section>
  );
}

function ExamTargetRow({
  subjectId,
  examOrdinal,
  existing,
  units,
}: {
  subjectId: string;
  examOrdinal: number;
  existing?: SemesterExamTarget;
  units: SemesterUnit[];
}) {
  const [state, action] = useActionState(saveExamTargetAction, INIT);
  return (
    <li className="rounded-lg border border-neutral-200 p-4">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="subjectId" value={subjectId} />
        <input type="hidden" name="examOrdinal" value={examOrdinal} />
        <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
          {examOrdinal}차 시험
        </span>
        <UnitSelect
          name="fromCode"
          label="시작 단원"
          units={units}
          value={existing?.fromCode ?? null}
        />
        <span className="text-neutral-400">~</span>
        <UnitSelect
          name="toCode"
          label="종료 단원"
          units={units}
          value={existing?.toCode ?? null}
        />
        <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700">
          저장
        </button>
        {!state.ok && state.error && (
          <p className="w-full text-xs text-red-600">{state.error}</p>
        )}
      </form>
    </li>
  );
}

function UnitSelect({
  name,
  label,
  units,
  value,
}: {
  name: string;
  label: string;
  units: SemesterUnit[];
  value: number | null;
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-neutral-500">
      {label}
      <select
        name={name}
        defaultValue={value === null ? "" : String(value)}
        className="rounded border border-neutral-300 px-2 py-1 text-sm"
      >
        <option value="">(미지정)</option>
        {units.map((u) => (
          <option key={u.id} value={sixDigitCode(u)}>
            {code6(u)} {u.minorName}
          </option>
        ))}
      </select>
    </label>
  );
}
