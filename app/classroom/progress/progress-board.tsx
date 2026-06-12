"use client";
import { useState, useTransition } from "react";
import {
  generateSessionsAction,
  setProgressStatusAction,
  saveDoneRecordAction,
  loadPlanForSessionAction,
} from "./actions";
import type { SessionStatus } from "@/lib/domain/types";

/**
 * 수업 진척도 클라이언트 보드 (교실 2-2 단계3, 전면 신규 — /sessions UI 미재사용).
 *
 * 상단: 금주∪연체 planned 차시 팝업 패널. 각 차시 예정/미진행/완료 토글.
 * 완료 시 인라인 폼(실제수업내용·핵심개념 칩·평가아이디어 + 계획 불러오기)을 펼친다.
 * neutral Tailwind, app/sessions/page.tsx 시각 밀도와 일관.
 */
export interface SessionRecordView {
  actualContent: string;
  keywords: string[];
  evalIdea: string;
  planOrdinal: number | null;
}

export interface SessionView {
  id: string;
  date: string;
  status: SessionStatus;
  record: SessionRecordView | null;
}

export interface SectionView {
  sectionId: string;
  label: string;
  subjectId: string;
  subjectName: string;
  sessions: SessionView[];
}

export interface PopupView {
  sessionId: string;
  sectionId: string;
  sectionLabel: string;
  subjectName: string;
  date: string;
  overdue: boolean;
}

export function ProgressBoard({
  year,
  semester,
  sections,
  popup,
  statusLabel,
}: {
  year: number;
  semester: 1 | 2;
  sections: SectionView[];
  popup: PopupView[];
  statusLabel: Record<string, string>;
}) {
  // 완료 폼이 열린 차시 id(인라인 토글).
  const [openDone, setOpenDone] = useState<string | null>(null);

  return (
    <div className="mt-6 space-y-8">
      {/* 차시 생성 */}
      <section className="rounded-lg border border-neutral-200 p-5">
        <p className="text-xs text-neutral-400">
          학기 전체(개학~학기말) 시간표·수업일 기준으로 차시를 생성합니다.
          완료·미진행 차시는 보존됩니다.
        </p>
        <form action={generateSessionsAction} className="mt-3">
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="semester" value={semester} />
          <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700">
            {semester}학기 차시 생성/정리
          </button>
        </form>
      </section>

      {/* 팝업: 금주∪연체 */}
      <section>
        <h3 className="border-b border-neutral-200 pb-2 font-semibold text-neutral-800">
          이번주 · 연체 예정 차시 ({popup.length})
        </h3>
        {popup.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">
            이번주·연체된 예정 차시가 없습니다.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {popup.map((p) => (
              <li
                key={p.sessionId}
                className="rounded-lg border border-neutral-200 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm">
                    <span className="w-24 text-neutral-500">{p.date}</span>
                    <span className="font-medium">{p.subjectName}</span>
                    <span className="text-neutral-400">{p.sectionLabel}</span>
                    {p.overdue && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                        연체
                      </span>
                    )}
                  </span>
                  <StatusButtons
                    sessionId={p.sessionId}
                    current="planned"
                    statusLabel={statusLabel}
                    onDoneClick={() =>
                      setOpenDone(openDone === p.sessionId ? null : p.sessionId)
                    }
                  />
                </div>
                {openDone === p.sessionId && (
                  <DoneForm
                    sessionId={p.sessionId}
                    record={null}
                    onClose={() => setOpenDone(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 분반별 전체 차시 */}
      <section>
        <h3 className="border-b border-neutral-200 pb-2 font-semibold text-neutral-800">
          분반별 차시
        </h3>
        {sections.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">
            이 학기에 등록된 분반이 없습니다. 먼저 세팅실에서 수업·시간표를 등록하세요.
          </p>
        ) : (
          <div className="mt-3 space-y-6">
            {sections.map((sec) => (
              <SectionBlock
                key={sec.sectionId}
                section={sec}
                statusLabel={statusLabel}
                openDone={openDone}
                setOpenDone={setOpenDone}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionBlock({
  section,
  statusLabel,
  openDone,
  setOpenDone,
}: {
  section: SectionView;
  statusLabel: Record<string, string>;
  openDone: string | null;
  setOpenDone: (id: string | null) => void;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
        <span className="font-medium">
          {section.subjectName}{" "}
          <span className="text-neutral-400">{section.label}</span>
        </span>
        <span className="text-xs text-neutral-400">
          차시 {section.sessions.length}개
        </span>
      </div>
      {section.sessions.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-400">차시가 없습니다.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {section.sessions.map((s) => (
            <li key={s.id}>
              <div className="flex flex-wrap items-center justify-between gap-2 py-1">
                <span className="flex items-center gap-3">
                  <span className="w-24 text-neutral-500">{s.date}</span>
                  <span className="w-12 text-xs text-neutral-400">
                    {statusLabel[s.status]}
                  </span>
                </span>
                <StatusButtons
                  sessionId={s.id}
                  current={s.status}
                  statusLabel={statusLabel}
                  onDoneClick={() =>
                    setOpenDone(openDone === s.id ? null : s.id)
                  }
                />
              </div>
              {openDone === s.id && (
                <DoneForm
                  sessionId={s.id}
                  record={s.record}
                  onClose={() => setOpenDone(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusButtons({
  sessionId,
  current,
  statusLabel,
  onDoneClick,
}: {
  sessionId: string;
  current: SessionStatus;
  statusLabel: Record<string, string>;
  onDoneClick: () => void;
}) {
  const [pending, startTransition] = useTransition();

  // 예정/미진행은 즉시 액션, 완료는 폼을 펼친다.
  function setStatus(status: SessionStatus) {
    const fd = new FormData();
    fd.set("sessionId", sessionId);
    fd.set("status", status);
    startTransition(() => {
      void setProgressStatusAction(fd);
    });
  }

  return (
    <span className="flex gap-1">
      {(["planned", "not_held"] as const).map((st) => (
        <button
          key={st}
          type="button"
          disabled={pending}
          onClick={() => setStatus(st)}
          className={`rounded border px-2 py-0.5 text-xs disabled:opacity-50 ${
            current === st
              ? "border-neutral-800 bg-neutral-800 text-white"
              : "border-neutral-300 hover:bg-neutral-50"
          }`}
        >
          {statusLabel[st]}
        </button>
      ))}
      <button
        type="button"
        onClick={onDoneClick}
        className={`rounded border px-2 py-0.5 text-xs ${
          current === "done"
            ? "border-neutral-800 bg-neutral-800 text-white"
            : "border-neutral-300 hover:bg-neutral-50"
        }`}
      >
        {statusLabel.done}
      </button>
    </span>
  );
}

function DoneForm({
  sessionId,
  record,
  onClose,
}: {
  sessionId: string;
  record: SessionRecordView | null;
  onClose: () => void;
}) {
  const [actualContent, setActualContent] = useState(record?.actualContent ?? "");
  const [keywords, setKeywords] = useState((record?.keywords ?? []).join(" "));
  const [evalIdea, setEvalIdea] = useState(record?.evalIdea ?? "");
  const [planOrdinal, setPlanOrdinal] = useState<string>(
    record?.planOrdinal != null ? String(record.planOrdinal) : "",
  );
  const [loadMsg, setLoadMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, startSave] = useTransition();

  // 계획 불러오기: 날짜순위 k 기본. 실제수업내용+핵심개념 prefill(편집 가능).
  async function loadPlan() {
    setLoading(true);
    setLoadMsg(null);
    try {
      const plan = await loadPlanForSessionAction(sessionId);
      if (!plan) {
        setLoadMsg("해당 차시에 매핑되는 계획이 없습니다.");
        return;
      }
      setActualContent(plan.content ?? "");
      setKeywords((plan.keywords ?? []).join(" "));
      setPlanOrdinal(String(plan.ordinal));
      setLoadMsg(`${plan.ordinal}차시 계획을 불러왔습니다.`);
    } finally {
      setLoading(false);
    }
  }

  function save() {
    const fd = new FormData();
    fd.set("sessionId", sessionId);
    fd.set("actualContent", actualContent);
    fd.set("keywords", keywords);
    fd.set("evalIdea", evalIdea);
    if (planOrdinal.trim() !== "") fd.set("planOrdinal", planOrdinal.trim());
    startSave(() => {
      void saveDoneRecordAction(fd).then(() => onClose());
    });
  }

  return (
    <div className="mt-2 rounded-lg border border-neutral-300 bg-neutral-50 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-neutral-700">완료 기록</span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-neutral-400 hover:text-neutral-700"
        >
          닫기
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs text-neutral-500">
          계획 차시(수동 재지정)
          <input
            type="number"
            min={1}
            value={planOrdinal}
            onChange={(e) => setPlanOrdinal(e.target.value)}
            placeholder="자동"
            className="ml-2 w-16 rounded border border-neutral-300 px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={loadPlan}
          disabled={loading}
          className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-white disabled:opacity-50"
        >
          {loading ? "불러오는 중…" : "계획 불러오기"}
        </button>
        {loadMsg && <span className="text-xs text-blue-600">{loadMsg}</span>}
      </div>

      <div className="mt-3 space-y-2">
        <textarea
          value={actualContent}
          onChange={(e) => setActualContent(e.target.value)}
          rows={3}
          placeholder="실제 수업내용"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="핵심개념(콤마/공백 구분, #는 자동 제거)"
          className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm"
        />
        {keywords.trim() !== "" && (
          <p className="text-xs text-blue-600">
            #
            {keywords
              .split(/[,\s]+/)
              .map((k) => k.replace(/^#/, "").trim())
              .filter((k) => k.length > 0)
              .join(" #")}
          </p>
        )}
        <textarea
          value={evalIdea}
          onChange={(e) => setEvalIdea(e.target.value)}
          rows={2}
          placeholder="평가 아이디어"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-2 rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {saving ? "저장 중…" : "완료 저장"}
      </button>
    </div>
  );
}
