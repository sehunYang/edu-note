"use client";
import { useEffect, useState, useTransition } from "react";
import {
  addObservationAction,
  updateObservationAction,
  deleteObservationAction,
  loadSectionStudentsAction,
  loadStudentSectionsAction,
} from "./actions";

/**
 * 교과 관찰 클라이언트 (교실 2-2 단계5). 분반 필수 + 두 필터 모드:
 *  - 학생 선택 → 수강 분반 자동매칭(복수면 토글), loadStudentSectionsAction.
 *  - 분반 선택 → 학생 명단을 그 분반으로 필터, loadSectionStudentsAction.
 * 날짜 입력(기본 당일 + 캘린더), 관찰 추가(분반 필수), 최근 목록 행별 수정·삭제.
 * neutral Tailwind(grades-uploader 와 일관).
 */
export interface StudentOption {
  id: string;
  sid: string;
  name: string;
}

export interface SectionOption {
  sectionId: string;
  label: string;
  subjectName: string;
}

export interface RecentObservation {
  id: string;
  studentLabel: string;
  sectionLabel: string;
  observedOn: string;
  body: string;
  keywords: string[];
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ObservationsClient({
  semester,
  students,
  sections,
  recent,
  initialStudentId = "",
  initialSectionId = "",
}: {
  semester: 1 | 2;
  students: StudentOption[];
  sections: SectionOption[];
  recent: RecentObservation[];
  initialStudentId?: string;
  initialSectionId?: string;
}) {
  const [studentId, setStudentId] = useState(initialStudentId);
  const [sectionId, setSectionId] = useState(initialSectionId);
  // 분반→학생 필터 결과(빈 배열=전체 표시). 학생→수강분반 자동매칭 후보.
  const [filteredStudents, setFilteredStudents] = useState<StudentOption[] | null>(
    null,
  );
  const [matchedSections, setMatchedSections] = useState<SectionOption[] | null>(
    null,
  );
  const [observedOn, setObservedOn] = useState(todayStr());
  const [body, setBody] = useState("");
  const [keywords, setKeywords] = useState("");
  const [pending, startTransition] = useTransition();

  // 넛지 사전선택 딥링크(AC-7.3): 분반이 미리 지정되면 그 분반 학생으로 명단을 좁힌다.
  // 진입 시 1회만(빈 의존성) — 이후 사용자 조작은 onPickSection 가 담당.
  useEffect(() => {
    if (!initialSectionId) return;
    loadSectionStudentsAction(initialSectionId).then((rows) =>
      setFilteredStudents(rows.map((r) => ({ id: r.id, sid: r.sid, name: r.name }))),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const studentList = filteredStudents ?? students;

  // 학생 선택 → 수강 분반 자동매칭(복수면 토글로 선택).
  async function onPickStudent(id: string) {
    setStudentId(id);
    if (!id) {
      setMatchedSections(null);
      return;
    }
    const secs = await loadStudentSectionsAction(id, semester);
    const mapped: SectionOption[] = secs.map((s) => ({
      sectionId: s.sectionId,
      label: s.label,
      subjectName: s.subjectName,
    }));
    setMatchedSections(mapped);
    // 후보가 하나면 자동 선택, 여럿이면 교사가 토글.
    setSectionId(mapped.length === 1 ? mapped[0].sectionId : "");
  }

  // 분반 선택 → 학생 명단을 그 분반으로 필터.
  async function onPickSection(id: string) {
    setSectionId(id);
    if (!id) {
      setFilteredStudents(null);
      return;
    }
    const rows = await loadSectionStudentsAction(id);
    setFilteredStudents(rows.map((r) => ({ id: r.id, sid: r.sid, name: r.name })));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!studentId || !sectionId || !body.trim()) return;
    const fd = new FormData();
    fd.set("studentYearId", studentId);
    fd.set("sectionId", sectionId);
    fd.set("observedOn", observedOn);
    fd.set("body", body);
    fd.set("keywords", keywords);
    startTransition(async () => {
      await addObservationAction(fd);
      setBody("");
      setKeywords("");
    });
  }

  // 자동매칭 후보(토글): 복수일 때만 노출.
  const sectionToggle = matchedSections && matchedSections.length > 0
    ? matchedSections
    : null;

  return (
    <div className="mt-6 space-y-6">
      <form
        onSubmit={onSubmit}
        className="space-y-3 rounded-lg border border-neutral-200 p-5"
      >
        <div className="grid gap-3 md:grid-cols-2">
          {/* 학생 선택 */}
          <div>
            <label className="text-xs font-semibold text-neutral-600">학생</label>
            <select
              value={studentId}
              onChange={(e) => onPickStudent(e.target.value)}
              required
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              <option value="">학생 선택</option>
              {studentList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sid} {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* 분반 선택 */}
          <div>
            <label className="text-xs font-semibold text-neutral-600">
              분반 (필수)
            </label>
            <select
              value={sectionId}
              onChange={(e) => onPickSection(e.target.value)}
              required
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              <option value="">분반 선택</option>
              {sections.map((s) => (
                <option key={s.sectionId} value={s.sectionId}>
                  {s.subjectName} {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 자동매칭 토글(학생의 수강 분반이 복수일 때) */}
        {sectionToggle && sectionToggle.length > 1 && (
          <div className="rounded border border-blue-100 bg-blue-50/50 p-2">
            <p className="text-xs text-neutral-500">
              이 학생의 수강 분반(자동매칭) — 하나를 선택하세요.
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {sectionToggle.map((s) => (
                <button
                  key={s.sectionId}
                  type="button"
                  onClick={() => setSectionId(s.sectionId)}
                  className={`rounded px-2 py-1 text-xs ${
                    sectionId === s.sectionId
                      ? "bg-neutral-800 text-white"
                      : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  {s.subjectName} {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-neutral-600">관찰일</label>
          <input
            type="date"
            value={observedOn}
            onChange={(e) => setObservedOn(e.target.value)}
            className="mt-1 block rounded border border-neutral-300 px-2 py-1 text-sm"
          />
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={3}
          placeholder="관찰 내용(사실 위주)"
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
          disabled={pending || !studentId || !sectionId || !body.trim()}
          className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {pending ? "저장 중…" : "관찰 저장"}
        </button>
      </form>

      {/* 최근 관찰 */}
      <section>
        <h3 className="text-xs font-semibold text-neutral-500">
          최근 관찰 {recent.length}
        </h3>
        <ul className="mt-2 space-y-2">
          {recent.map((o) => (
            <ObservationRow key={o.id} obs={o} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function ObservationRow({ obs }: { obs: RecentObservation }) {
  const [editing, setEditing] = useState(false);
  const [observedOn, setObservedOn] = useState(obs.observedOn);
  const [body, setBody] = useState(obs.body);
  const [keywords, setKeywords] = useState(obs.keywords.join(" "));
  const [pending, startTransition] = useTransition();

  function onSave() {
    if (!body.trim()) return;
    const fd = new FormData();
    fd.set("id", obs.id);
    fd.set("observedOn", observedOn);
    fd.set("body", body);
    fd.set("keywords", keywords);
    startTransition(async () => {
      await updateObservationAction(fd);
      setEditing(false);
    });
  }

  function onDelete() {
    if (!confirm("이 관찰 기록을 삭제할까요?")) return;
    const fd = new FormData();
    fd.set("id", obs.id);
    startTransition(async () => {
      await deleteObservationAction(fd);
    });
  }

  if (editing) {
    return (
      <li className="rounded border border-neutral-200 p-3 text-sm">
        <input
          type="date"
          value={observedOn}
          onChange={(e) => setObservedOn(e.target.value)}
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
        <span>{obs.studentLabel}</span>
        <span>
          {obs.sectionLabel ? `${obs.sectionLabel} · ` : ""}
          {obs.observedOn}
        </span>
      </div>
      <p className="mt-0.5 whitespace-pre-wrap text-neutral-700">{obs.body}</p>
      {obs.keywords.length > 0 && (
        <p className="mt-0.5 text-xs text-blue-600">#{obs.keywords.join(" #")}</p>
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
