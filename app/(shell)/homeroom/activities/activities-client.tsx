"use client";
import { useState, useTransition } from "react";
import { Paginator } from "@/lib/ui/paginator";
import { paginate } from "@/lib/db/pagination";
import {
  bulkSaveActivityAction,
  updateActivityAction,
  deleteActivityAction,
} from "./actions";
import type { ActivityTag } from "@/lib/domain/types";
import { Button } from "@/app/ui/button";

const PAGE_SIZE = 10;

/**
 * 자율·진로활동 클라이언트 (US-B11).
 *
 * 두 섹션:
 * A) 학사일정 자율/진로 활동 — 날짜별 이벤트 선택 후 특기내역 기입(일괄저장)
 * B) 자유 탐구/활동 — 학사일정 무관. 공통/개별 토글 + 자율/진로 토글.
 *
 * 일괄 저장: 체크된 학생 × body × tag → bulkSaveActivityAction
 * 저장 내역 목록: 수정·삭제 인라인.
 */

export interface HomeroomStudent {
  id: string;
  sid: string;
  name: string;
}

export interface SelfActivityEvent {
  id: string;
  date: string;
  title: string;
  eventKind: string;
}

export interface ActivityEntry {
  id: string;
  studentYearId: string;
  studentLabel: string;
  tag: ActivityTag;
  placement: string;
  body: string;
  createdAt: Date;
}

// ── 태그 라벨 ──
const TAG_LABELS: Record<ActivityTag, string> = {
  autonomy: "자율",
  career: "진로",
  both: "자율+진로",
};

// ── 공통 멀티체크 학생 선택 ──
function StudentCheckList({
  students,
  selected,
  onChange,
}: {
  students: HomeroomStudent[];
  selected: Set<string>;
  onChange: (id: string, checked: boolean) => void;
}) {
  const allChecked = students.length > 0 && students.every((s) => selected.has(s.id));
  function toggleAll(checked: boolean) {
    for (const s of students) onChange(s.id, checked);
  }
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-xs font-normal text-neutral-600">
        <input
          type="checkbox"
          checked={allChecked}
          onChange={(e) => toggleAll(e.target.checked)}
          className="rounded"
        />
        전체 선택
      </label>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
        {students.map((s) => (
          <label key={s.id} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={selected.has(s.id)}
              onChange={(e) => onChange(s.id, e.target.checked)}
              className="rounded"
            />
            <span className="text-neutral-700">
              {s.sid} {s.name}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── 활동 기입 행(수정·삭제) ──
function ActivityRow({
  entry,
  nameById,
}: {
  entry: ActivityEntry;
  nameById: Map<string, string>;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(entry.body);
  const [tag, setTag] = useState<ActivityTag>(entry.tag);
  const [pending, startTransition] = useTransition();

  function onSave() {
    if (!body.trim()) return;
    const fd = new FormData();
    fd.set("id", entry.id);
    fd.set("body", body);
    fd.set("tag", tag);
    startTransition(async () => {
      await updateActivityAction(fd);
      setEditing(false);
    });
  }

  function onDelete() {
    if (!confirm("이 활동 기입을 삭제할까요?")) return;
    const fd = new FormData();
    fd.set("id", entry.id);
    startTransition(async () => {
      await deleteActivityAction(fd);
    });
  }

  const label = nameById.get(entry.studentYearId) ?? "—";

  if (editing) {
    return (
      <li className="rounded border border-neutral-200 p-3 text-sm">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-normal">{label}</span>
          <select aria-label="활동 구분"
            value={tag}
            onChange={(e) => setTag(e.target.value as ActivityTag)}
            className="rounded border border-neutral-300 px-2 py-0.5 text-xs"
          >
            <option value="autonomy">자율</option>
            <option value="career">진로</option>
            <option value="both">자율+진로</option>
          </select>
        </div>
        <textarea aria-label="활동 내용"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            onClick={onSave}
            disabled={pending || !body.trim()}
            className="px-3 py-1 text-xs"
          >
            저장
          </Button>
          <Button
            type="button"
            onClick={() => setEditing(false)}
            className="px-3 py-1 text-xs"
          >
            취소
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded border border-neutral-100 p-2 text-sm">
      <div className="flex justify-between text-xs text-neutral-400">
        <span>{label}</span>
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
          {TAG_LABELS[entry.tag]}
        </span>
      </div>
      <p className="mt-0.5 whitespace-pre-wrap text-neutral-700">{entry.body}</p>
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

// ── 학사일정 활동 섹션(A) ──
function ScheduledActivitySection({
  events,
  students,
}: {
  events: SelfActivityEvent[];
  students: HomeroomStudent[];
}) {
  const [eventId, setEventId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");
  const [tag, setTag] = useState<ActivityTag>("autonomy");
  const [pending, startTransition] = useTransition();

  function toggleStudent(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!eventId || selected.size === 0 || !body.trim()) return;
    const fd = new FormData();
    fd.set("studentYearIds", [...selected].join(","));
    fd.set("body", body);
    fd.set("tag", tag);
    startTransition(async () => {
      await bulkSaveActivityAction(fd);
      setBody("");
      setSelected(new Set());
    });
  }

  const selectedEvent = events.find((e) => e.id === eventId);

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-5">
      <h2 className="text-sm font-normal text-neutral-700">학사일정 자율·진로 활동</h2>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="text-xs font-normal text-neutral-600">활동 일정</label>
          <select aria-label="활동 일정"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            required
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          >
            <option value="">일정 선택</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.date} {ev.title}
              </option>
            ))}
          </select>
        </div>

        {selectedEvent && (
          <>
            <div>
              <label className="text-xs font-normal text-neutral-600">
                활동 분류
              </label>
              <div className="mt-1 flex gap-3">
                {(["autonomy", "career", "both"] as ActivityTag[]).map((t) => (
                  <label key={t} className="flex items-center gap-1 text-sm">
                    <input
                      type="radio"
                      name="sched-tag"
                      value={t}
                      checked={tag === t}
                      onChange={() => setTag(t)}
                    />
                    {TAG_LABELS[t]}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-normal text-neutral-600">
                대상 학생 (복수 선택)
              </label>
              <div className="mt-1">
                <StudentCheckList
                  students={students}
                  selected={selected}
                  onChange={toggleStudent}
                />
              </div>
            </div>

            <textarea aria-label="특기 내역을 입력하세요"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={3}
              placeholder="특기 내역을 입력하세요"
              className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />

            <Button
              type="submit"
              disabled={pending || selected.size === 0 || !body.trim()}
              className="px-3 py-1.5 text-sm"
            >
              {pending ? "저장 중…" : `일괄 저장 (${selected.size}명)`}
            </Button>
          </>
        )}
      </form>
    </section>
  );
}

// ── 자유 탐구/활동 섹션(B) ──
function FreeActivitySection({ students }: { students: HomeroomStudent[] }) {
  const [mode, setMode] = useState<"common" | "individual">("common");
  const [tag, setTag] = useState<ActivityTag>("autonomy");
  const [commonBody, setCommonBody] = useState("");
  // 개별 입력: studentYearId → body
  const [individualBodies, setIndividualBodies] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function onSubmitCommon(e: React.FormEvent) {
    e.preventDefault();
    if (!commonBody.trim()) return;
    const fd = new FormData();
    fd.set("studentYearIds", students.map((s) => s.id).join(","));
    fd.set("body", commonBody);
    fd.set("tag", tag);
    startTransition(async () => {
      await bulkSaveActivityAction(fd);
      setCommonBody("");
    });
  }

  function onSubmitIndividual(studentYearId: string) {
    const body = (individualBodies[studentYearId] ?? "").trim();
    if (!body) return;
    const fd = new FormData();
    fd.set("studentYearIds", studentYearId);
    fd.set("body", body);
    fd.set("tag", tag);
    startTransition(async () => {
      await bulkSaveActivityAction(fd);
      setIndividualBodies((prev) => ({ ...prev, [studentYearId]: "" }));
    });
  }

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-5">
      <h2 className="text-sm font-normal text-neutral-700">자유 탐구/활동</h2>

      <div className="flex flex-wrap gap-4">
        {/* 공통/개별 토글 */}
        <div className="flex items-center gap-3 text-sm">
          <span className="text-xs font-normal text-neutral-600">기입 방식</span>
          {(["common", "individual"] as const).map((m) => (
            <label key={m} className="flex items-center gap-1">
              <input
                type="radio"
                name="free-mode"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
              />
              {m === "common" ? "공통 기입(전체)" : "학생별 개별 기입"}
            </label>
          ))}
        </div>

        {/* 자율/진로 토글 */}
        <div className="flex items-center gap-3 text-sm">
          <span className="text-xs font-normal text-neutral-600">활동 분류</span>
          {(["autonomy", "career", "both"] as ActivityTag[]).map((t) => (
            <label key={t} className="flex items-center gap-1">
              <input
                type="radio"
                name="free-tag"
                value={t}
                checked={tag === t}
                onChange={() => setTag(t)}
              />
              {TAG_LABELS[t]}
            </label>
          ))}
        </div>
      </div>

      {mode === "common" ? (
        <form onSubmit={onSubmitCommon} className="space-y-2">
          <textarea aria-label="전체 학생에게 공통으로 기입할 활동 내역"
            value={commonBody}
            onChange={(e) => setCommonBody(e.target.value)}
            required
            rows={3}
            placeholder="전체 학생에게 공통으로 기입할 활동 내역"
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <Button
            type="submit"
            disabled={pending || !commonBody.trim()}
            className="px-3 py-1.5 text-sm"
          >
            {pending ? "저장 중…" : `공통 저장 (${students.length}명)`}
          </Button>
        </form>
      ) : (
        <div className="space-y-2">
          {students.map((s) => (
            <div key={s.id} className="flex items-start gap-2">
              <span className="w-20 shrink-0 pt-2 text-xs text-neutral-600">
                {s.sid} {s.name}
              </span>
              <textarea aria-label="활동 내역"
                value={individualBodies[s.id] ?? ""}
                onChange={(e) =>
                  setIndividualBodies((prev) => ({
                    ...prev,
                    [s.id]: e.target.value,
                  }))
                }
                rows={2}
                placeholder="활동 내역"
                className="flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm"
              />
              <Button
                type="button"
                onClick={() => onSubmitIndividual(s.id)}
                disabled={pending || !(individualBodies[s.id] ?? "").trim()}
                className="shrink-0 px-2 py-1.5 text-xs"
              >
                저장
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── 메인 클라이언트 컴포넌트 ──
export function ActivitiesClient({
  students,
  events,
  entries,
}: {
  students: HomeroomStudent[];
  events: SelfActivityEvent[];
  entries: ActivityEntry[];
}) {
  const nameById = new Map(students.map((s) => [s.id, `${s.sid} ${s.name}`]));
  const [page, setPage] = useState(1);
  const { pageItems, totalPages, currentPage } = paginate(
    entries,
    page,
    PAGE_SIZE,
  );

  return (
    <div className="mt-6 space-y-6">
      <ScheduledActivitySection events={events} students={students} />
      <FreeActivitySection students={students} />

      <section>
        <h2 className="text-xs font-normal text-neutral-500">
          저장 내역 {entries.length}건
        </h2>
        {entries.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">아직 저장된 활동 기입이 없습니다.</p>
        ) : (
          <>
            <ul className="mt-2 space-y-2">
              {pageItems.map((e) => (
                <ActivityRow key={e.id} entry={e} nameById={nameById} />
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
      </section>
    </div>
  );
}
