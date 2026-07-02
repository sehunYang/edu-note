"use client";
import { useActionState, useMemo, useState } from "react";
import {
  saveLessonUnitAction,
  deleteLessonUnitAction,
  saveExamTargetAction,
  saveExamSegmentPlanAction,
  type PlanActionState,
} from "../actions";
import { sixDigitCode } from "@/lib/domain/lesson-unit";
import { computeUnitOrdinalSum } from "@/lib/domain/lesson-plan";

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

export interface SemesterSegmentPlan {
  examOrdinal: number;
  plannedPeriods: number;
  slackPeriods: number;
}

export interface SubjectSemesterView {
  subjectId: string;
  subjectName: string;
  /** 세팅실에서 체크된 시험 차수(1/2). */
  examOrdinals: number[];
  /** 대표분반 차시 수(주당 시수 최대 분반 기준). 구간 차시 계획 참고용. */
  repLength: number;
  units: SemesterUnit[];
  examTargets: SemesterExamTarget[];
  segmentPlans: SemesterSegmentPlan[];
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

  // AC-1.2 — 세부단원 최소차시 합 = 차시계획 총 차시 수.
  const totalOrdinals = useMemo(
    () => computeUnitOrdinalSum(sortedUnits),
    [sortedUnits],
  );

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
        <span className="ml-auto rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
          총 차시 수 = <span className="font-normal">{totalOrdinals}</span>
          <span className="ml-1 text-neutral-400">(세부단원 최소차시 합)</span>
        </span>
      </div>

      <ExamSegmentSection subject={selected} />

      <section>
        <h3 className="text-sm font-normal text-neutral-700">세부 단원</h3>
        <p className="mt-1 text-xs text-neutral-400">
          6자리 코드 = 대단원(2)·중단원(2)·소단원(2). 차시 계획에서 이 코드로 단원을
          자동 채웁니다.
        </p>
        <ul className="mt-3 space-y-3">
          {sortedUnits.map((u) => (
            <UnitRow
              key={u.id}
              subjectId={selected.subjectId}
              unit={u}
              existingUnits={sortedUnits}
            />
          ))}
        </ul>
        <UnitRow subjectId={selected.subjectId} existingUnits={sortedUnits} />
      </section>

      <ExamTargetsSection subject={selected} units={sortedUnits} />
    </div>
  );
}

function ExamSegmentSection({ subject }: { subject: SubjectSemesterView }) {
  if (subject.examOrdinals.length === 0) {
    return (
      <section>
        <h3 className="text-sm font-normal text-neutral-700">
          시험 구간 차시 계획
        </h3>
        <p className="mt-1 text-xs text-neutral-400">
          세팅실 학사일정에 등록된 시험(1차/2차)이 없습니다. 시험을 등록하면 구간별
          진행 차시·여유 차시를 계획할 수 있습니다.
        </p>
      </section>
    );
  }
  return (
    <section>
      <h3 className="text-sm font-normal text-neutral-700">
        시험 구간 차시 계획
      </h3>
      <p className="mt-1 text-xs text-neutral-400">
        시험 구간(1회=중간 전 / 2회=기말 전)별로 진행할 차시 수와 여유 차시 수를
        입력합니다. 대표분반 차시{" "}
        <span className="font-normal text-neutral-600">{subject.repLength}</span>개를
        참고하세요.
      </p>
      <ul className="mt-3 space-y-3">
        {subject.examOrdinals.map((ord) => (
          <ExamSegmentRow
            key={ord}
            subjectId={subject.subjectId}
            examOrdinal={ord}
            existing={subject.segmentPlans.find((p) => p.examOrdinal === ord)}
          />
        ))}
      </ul>
    </section>
  );
}

function ExamSegmentRow({
  subjectId,
  examOrdinal,
  existing,
}: {
  subjectId: string;
  examOrdinal: number;
  existing?: SemesterSegmentPlan;
}) {
  const [state, action] = useActionState(saveExamSegmentPlanAction, INIT);
  return (
    <li className="rounded-lg border border-neutral-200 p-4">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="subjectId" value={subjectId} />
        <input type="hidden" name="examOrdinal" value={examOrdinal} />
        <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-normal text-red-600">
          {examOrdinal === 1 ? "중간 전(1회)" : "기말 전(2회)"}
        </span>
        <label className="flex items-center gap-1 text-xs text-neutral-500">
          진행 차시
          <input
            type="number"
            name="plannedPeriods"
            min={0}
            defaultValue={existing?.plannedPeriods ?? 0}
            className="w-20 rounded border border-neutral-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-neutral-500">
          여유 차시
          <input
            type="number"
            name="slackPeriods"
            min={0}
            defaultValue={existing?.slackPeriods ?? 0}
            className="w-20 rounded border border-neutral-300 px-2 py-1 text-sm"
          />
        </label>
        <button className="rounded-full border border-white/25 bg-transparent px-3 py-1.5 text-sm text-white hover:bg-white/10">
          저장
        </button>
        {!state.ok && state.error && (
          <p className="w-full text-xs text-red-600">{state.error}</p>
        )}
      </form>
    </li>
  );
}

function UnitRow({
  subjectId,
  unit,
  existingUnits,
}: {
  subjectId: string;
  unit?: SemesterUnit;
  existingUnits: SemesterUnit[];
}) {
  const [saveState, saveAction] = useActionState(saveLessonUnitAction, INIT);
  const [deleteState, deleteAction] = useActionState(
    deleteLessonUnitAction,
    INIT,
  );
  const isNew = !unit;

  // AC-1.1 단원명 자동채움: 대/중단원 번호를 입력하면 기존 단원에서 같은
  // majorNo→majorName, (majorNo,midNo)→midName 을 찾아 prefill 한다(소단원명은 수동).
  const [majorNo, setMajorNo] = useState<string>(
    unit?.majorNo != null ? String(unit.majorNo) : "",
  );
  const [midNo, setMidNo] = useState<string>(
    unit?.midNo != null ? String(unit.midNo) : "",
  );
  const [majorName, setMajorName] = useState(unit?.majorName ?? "");
  const [midName, setMidName] = useState(unit?.midName ?? "");
  // 자동채움 여부(사용자가 직접 고친 뒤에는 덮어쓰지 않기 위해, 채움 출처를 표시).
  const [majorAuto, setMajorAuto] = useState(false);
  const [midAuto, setMidAuto] = useState(false);

  const majorNameByNo = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of existingUnits) if (!m.has(u.majorNo)) m.set(u.majorNo, u.majorName);
    return m;
  }, [existingUnits]);
  const midNameByNo = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of existingUnits) {
      const key = `${u.majorNo}-${u.midNo}`;
      if (!m.has(key)) m.set(key, u.midName);
    }
    return m;
  }, [existingUnits]);

  function onMajorNoChange(v: string) {
    setMajorNo(v);
    const n = Number(v);
    const found = v !== "" && Number.isInteger(n) ? majorNameByNo.get(n) : undefined;
    // 비어있거나 직전 자동채움 값이면 prefill(사용자 수동입력은 보존).
    if (found != null && (majorName === "" || majorAuto)) {
      setMajorName(found);
      setMajorAuto(true);
    }
  }
  function onMidNoChange(v: string) {
    setMidNo(v);
    const mn = Number(majorNo);
    const md = Number(v);
    const found =
      v !== "" && Number.isInteger(mn) && Number.isInteger(md)
        ? midNameByNo.get(`${mn}-${md}`)
        : undefined;
    if (found != null && (midName === "" || midAuto)) {
      setMidName(found);
      setMidAuto(true);
    }
  }

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
            noVal={majorNo}
            nameVal={majorName}
            onNoChange={onMajorNoChange}
            onNameChange={(v) => {
              setMajorName(v);
              setMajorAuto(false);
            }}
          />
          <NumName
            label="중단원"
            noName="midNo"
            nameName="midName"
            noVal={midNo}
            nameVal={midName}
            onNoChange={onMidNoChange}
            onNameChange={(v) => {
              setMidName(v);
              setMidAuto(false);
            }}
          />
          <NumName
            label="소단원"
            noName="minorNo"
            nameName="minorName"
            noVal={unit?.minorNo != null ? String(unit.minorNo) : ""}
            nameVal={unit?.minorName ?? ""}
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
          <button className="rounded-full border border-white/25 bg-transparent px-3 py-1.5 text-sm text-white hover:bg-white/10">
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
  onNoChange,
  onNameChange,
}: {
  label: string;
  noName: string;
  nameName: string;
  noVal?: string;
  nameVal?: string;
  /** 제공되면 controlled(자동채움), 미제공이면 uncontrolled(defaultValue). */
  onNoChange?: (v: string) => void;
  onNameChange?: (v: string) => void;
}) {
  const controlled = onNoChange != null && onNameChange != null;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-xs text-neutral-500">{label}</span>
        {controlled ? (
          <input
            type="number"
            name={noName}
            min={0}
            max={99}
            value={noVal ?? ""}
            onChange={(e) => onNoChange?.(e.target.value)}
            placeholder="번호"
            className="w-14 rounded border border-neutral-300 px-2 py-1 text-sm"
          />
        ) : (
          <input
            type="number"
            name={noName}
            min={0}
            max={99}
            defaultValue={noVal ?? ""}
            placeholder="번호"
            className="w-14 rounded border border-neutral-300 px-2 py-1 text-sm"
          />
        )}
      </div>
      {controlled ? (
        <input
          name={nameName}
          value={nameVal ?? ""}
          onChange={(e) => onNameChange?.(e.target.value)}
          placeholder={`${label}명`}
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      ) : (
        <input
          name={nameName}
          defaultValue={nameVal ?? ""}
          placeholder={`${label}명`}
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      )}
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
        <h3 className="text-sm font-normal text-neutral-700">시험별 목표 진도</h3>
        <p className="mt-1 text-xs text-neutral-400">
          세팅실 학사일정에 등록된 시험(1차/2차)이 없습니다. 시험을 등록하면 목표
          진도 범위를 지정할 수 있습니다.
        </p>
      </section>
    );
  }
  return (
    <section>
      <h3 className="text-sm font-normal text-neutral-700">시험별 목표 진도</h3>
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
  // AC-1.4 — 저장된 범위를 상시 표시하는 배지(저장 상태 시각 인지). existing 은
  // 저장 후 revalidate 로 갱신되므로 서버 저장값을 그대로 반영한다.
  const codeLabel = (code: number | null): string | null => {
    if (code == null) return null;
    const u = units.find((x) => sixDigitCode(x) === code);
    return u ? `${code6(u)} ${u.minorName}` : String(code).padStart(6, "0");
  };
  const fromLabel = codeLabel(existing?.fromCode ?? null);
  const toLabel = codeLabel(existing?.toCode ?? null);
  const hasSaved = fromLabel != null || toLabel != null;

  return (
    <li className="rounded-lg border border-neutral-200 p-4">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="subjectId" value={subjectId} />
        <input type="hidden" name="examOrdinal" value={examOrdinal} />
        <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-normal text-red-600">
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
        <button className="rounded-full border border-white/25 bg-transparent px-3 py-1.5 text-sm text-white hover:bg-white/10">
          저장
        </button>
        {!state.ok && state.error && (
          <p className="w-full text-xs text-red-600">{state.error}</p>
        )}
      </form>
      <div className="mt-2 text-xs">
        {hasSaved ? (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 font-normal text-emerald-700">
            저장됨: {fromLabel ?? "(미지정)"} ~ {toLabel ?? "(미지정)"}
          </span>
        ) : (
          <span className="text-neutral-400">아직 저장된 목표 진도가 없습니다.</span>
        )}
      </div>
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
