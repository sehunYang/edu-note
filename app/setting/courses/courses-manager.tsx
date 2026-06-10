"use client";
import { useActionState } from "react";
import {
  saveEvalAction,
  bulkEnrollAction,
  materializeExamsAction,
  addSectionRoleAction,
  deleteSectionRoleAction,
  type SaveEvalState,
  type BulkEnrollState,
  type MaterializeExamsState,
} from "../actions";
import type { SectionRoleRow } from "@/lib/db/queries";

export interface SubjectView {
  subjectId: string;
  subjectName: string;
  exams: { semester: number; ordinal: number; date: string | null; enabled: boolean }[];
  sections: {
    id: string;
    label: string;
    enrollments: {
      enrollmentId: string;
      studentYearId: string;
      name: string;
      roles: SectionRoleRow[];
    }[];
  }[];
}

/**
 * C5 수업 관리 UI (AC-5.1~5.8). 시험일 파생 + 과목별 평가설정(100% 검증) + 분반별
 * 일괄등록·수강생 역할. 평가설정 실패(합≠100/미시행 비율)는 서버가 거부한다.
 */
export function CoursesManager({ subjects }: { subjects: SubjectView[] }) {
  const [matState, materialize, materializing] = useActionState<
    MaterializeExamsState,
    FormData
  >(materializeExamsAction, null);

  return (
    <div className="mt-5 space-y-5">
      <section className="rounded-lg border border-neutral-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-700">시험일 파생</h3>
            <p className="mt-1 text-xs text-neutral-400">
              학사일정(C3)에서 태깅한 시험 일정을 과목별 시험일로 반영합니다.
            </p>
          </div>
          <form action={materialize}>
            <button
              type="submit"
              disabled={materializing}
              className="rounded-md border border-neutral-800 bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              {materializing ? "반영 중…" : "시험일 반영"}
            </button>
          </form>
        </div>
        {matState && matState.ok && (
          <p className="mt-3 rounded border border-green-200 bg-green-50 p-2 text-xs text-green-800">
            ✅ 과목×시험 {matState.count}건 반영
          </p>
        )}
        {matState && !matState.ok && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {matState.message}
          </p>
        )}
      </section>

      {subjects.length === 0 ? (
        <p className="text-sm text-neutral-400">
          등록된 과목이 없습니다. 교사 설정에서 시간표를 동기화하세요.
        </p>
      ) : (
        subjects.map((s) => <SubjectCard key={s.subjectId} subject={s} />)
      )}
    </div>
  );
}

function SubjectCard({ subject }: { subject: SubjectView }) {
  const [evalState, save, saving] = useActionState<SaveEvalState, FormData>(
    saveEvalAction,
    null,
  );

  return (
    <section className="rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-800">
        {subject.subjectName}
      </h3>

      {/* 시험일 */}
      {subject.exams.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-500">
          {subject.exams.map((e) => (
            <span
              key={`${e.semester}-${e.ordinal}`}
              className={`rounded px-2 py-0.5 ${e.enabled ? "bg-neutral-100" : "bg-neutral-50 text-neutral-300 line-through"}`}
            >
              {e.semester}학기 {e.ordinal === 1 ? "중간" : "기말"} {e.date ?? "미정"}
            </span>
          ))}
        </div>
      )}

      {/* 평가설정 */}
      <form action={save} className="mt-3 space-y-2 rounded border border-neutral-100 p-3">
        <input type="hidden" name="subjectId" value={subject.subjectId} />
        <label className="block text-xs font-medium text-neutral-600">
          수행평가 (한 줄에 "이름:비율")
          <textarea
            name="performance"
            rows={2}
            placeholder={"실험보고서:30\n발표:20"}
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-xs"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1">
            <input type="checkbox" name="midEnabled" defaultChecked /> 중간지필
            <input
              name="jipilMid"
              type="number"
              defaultValue={0}
              className="w-16 rounded border border-neutral-300 px-1 py-0.5"
            />
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" name="finalEnabled" defaultChecked /> 기말지필
            <input
              name="jipilFinal"
              type="number"
              defaultValue={0}
              className="w-16 rounded border border-neutral-300 px-1 py-0.5"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded border border-green-600 bg-green-600 px-3 py-1 text-white hover:bg-green-700 disabled:opacity-40"
          >
            {saving ? "저장…" : "평가설정 저장"}
          </button>
          {evalState && evalState.ok && (
            <span className="text-green-700">✅ 저장됨</span>
          )}
          {evalState && !evalState.ok && (
            <span className="text-red-700">{evalState.message}</span>
          )}
        </div>
        <p className="text-[11px] text-neutral-400">
          수행 합 + 중간 + 기말 = 100 이어야 저장됩니다. 미시행 지필은 0.
        </p>
      </form>

      {/* 분반 */}
      <div className="mt-3 space-y-3">
        {subject.sections.map((sec) => (
          <SectionBlock key={sec.id} section={sec} />
        ))}
      </div>
    </section>
  );
}

function SectionBlock({
  section,
}: {
  section: SubjectView["sections"][number];
}) {
  const [enrollState, enroll, enrolling] = useActionState<
    BulkEnrollState,
    FormData
  >(bulkEnrollAction, null);

  return (
    <div className="rounded border border-neutral-200 p-3">
      <div className="text-xs font-semibold text-neutral-700">분반 {section.label}</div>

      <form action={enroll} className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <input type="hidden" name="sectionId" value={section.id} />
        <input
          name="grade"
          type="number"
          placeholder="학년"
          className="w-16 rounded border border-neutral-300 px-1 py-0.5"
        />
        <input
          name="classNo"
          type="number"
          placeholder="반(빈=전체)"
          className="w-24 rounded border border-neutral-300 px-1 py-0.5"
        />
        <button
          type="submit"
          disabled={enrolling}
          className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-neutral-50 disabled:opacity-40"
        >
          {enrolling ? "등록…" : "일괄 등록"}
        </button>
        {enrollState && enrollState.ok && (
          <span className="text-green-700">+{enrollState.count}명</span>
        )}
        {enrollState && !enrollState.ok && (
          <span className="text-red-700">{enrollState.message}</span>
        )}
      </form>

      <div className="mt-2 space-y-1">
        {section.enrollments.map((e) => (
          <div key={e.enrollmentId} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="w-20">{e.name}</span>
            {e.roles.map((r) => (
              <span
                key={r.id}
                className="flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5"
              >
                {r.title}
                <form action={deleteSectionRoleAction} className="inline">
                  <input type="hidden" name="roleId" value={r.id} />
                  <button className="text-neutral-400 hover:text-red-600">×</button>
                </form>
              </span>
            ))}
            <form action={addSectionRoleAction} className="flex items-center gap-1">
              <input type="hidden" name="enrollmentId" value={e.enrollmentId} />
              <input
                name="title"
                placeholder="역할"
                className="w-20 rounded border border-neutral-200 px-1 py-0.5"
              />
              <button className="rounded border border-neutral-300 px-1 py-0.5 hover:bg-neutral-50">
                +
              </button>
            </form>
          </div>
        ))}
        {section.enrollments.length === 0 && (
          <p className="text-xs text-neutral-400">수강생이 없습니다.</p>
        )}
      </div>
    </div>
  );
}
