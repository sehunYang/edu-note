"use client";
import { useState, useTransition } from "react";
import {
  generateSessionsAction,
  setProgressStatusAction,
} from "./actions";
import type { SessionStatus } from "@/lib/domain/types";
import { Paginator } from "@/lib/ui/paginator";
import { paginate } from "@/lib/db/pagination";
import { Button } from "@/app/ui/button";

/** 분반별 진척도 통계 뷰(서버 getSectionProgressStats 결과 미러). */
export interface StatView {
  sectionId: string;
  label: string;
  subjectName: string;
  plannedToToday: number;
  actualDone: number;
  examTargetTotal: number;
  targetRate: number;
  actualRate: number;
  color: "green" | "red";
  /** QC v5 c2(AC-2.2) — done 차시 마지막 도달 단원코드(빈셀 제외). 없으면 null. */
  lastDoneUnitCode: number | null;
  lastDoneUnitLabel: string | null;
  /** QC v5 c2(AC-2.4) — 지필 둘 다 미시행이면 false → 시험진도율 블록 생략. */
  showExamProgress: boolean;
}

/**
 * 수업 진척도 클라이언트 보드 (교실 2-2 단계3, QC v5 c2 재설계).
 *
 * 상단: 분반별 진도 현황(단원진도 자동 도출 + 지필 과목 시험진도율). 금주∪연체 planned
 * 차시 팝업. 각 차시 예정/미진행/완료 상태 토글(완료=즉시 status='done', 별도 수행체크
 * 입력 폼 없음 — 진도는 done 차시의 마지막 단원에서 자동 도출, AC-2.1/AC-2.2).
 */
export interface SessionView {
  id: string;
  date: string;
  status: SessionStatus;
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
  stats,
  statusLabel,
}: {
  year: number;
  semester: 1 | 2;
  sections: SectionView[];
  popup: PopupView[];
  stats: StatView[];
  statusLabel: Record<string, string>;
}) {
  return (
    <div className="mt-6 space-y-8">
      {/* 진도율 통계(AC-2.4~2.6) */}
      <StatsHeader stats={stats} />

      {/* 차시 생성 */}
      <section className="rounded-lg border border-neutral-200 p-5">
        <p className="text-xs text-neutral-400">
          학기 전체(개학~학기말) 시간표·수업일 기준으로 차시를 생성합니다.
          완료·미진행 차시는 보존됩니다.
        </p>
        <form action={generateSessionsAction} className="mt-3">
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="semester" value={semester} />
          <Button className="px-3 py-1.5 text-sm">
            {semester}학기 차시 생성/정리
          </Button>
        </form>
      </section>

      {/* 팝업: 금주∪연체 (QC v6 ② — 다른 컴포넌트처럼 페이지네이션) */}
      <PopupSection popup={popup} statusLabel={statusLabel} />

      {/* 분반별 전체 차시 */}
      <section>
        <h3 className="border-b border-neutral-200 pb-2 font-normal text-neutral-800">
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
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** 6자리 코드 표기(대2+중2+소2). */
function fmtCode(code: number): string {
  return String(code).padStart(6, "0");
}

/**
 * 금주∪연체 예정 차시 섹션 (QC v6 ② — AC: 분반별 차시(SectionBlock)와 동일하게
 * paginate()+<Paginator>로 페이지네이션, page size 20).
 */
function PopupSection({
  popup,
  statusLabel,
}: {
  popup: PopupView[];
  statusLabel: Record<string, string>;
}) {
  const [page, setPage] = useState(1);
  const { pageItems, totalPages, currentPage } = paginate(
    popup,
    page,
    SECTION_PAGE_SIZE,
  );
  return (
    <section>
      <h3 className="border-b border-neutral-200 pb-2 font-normal text-neutral-800">
        이번주 · 연체 예정 차시 ({popup.length})
      </h3>
      {popup.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">
          이번주·연체된 예정 차시가 없습니다.
        </p>
      ) : (
        <>
          <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {pageItems.map((p) => (
              <li
                key={p.sessionId}
                className="rounded-lg border border-neutral-200 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm">
                    <span className="w-24 text-neutral-500">{p.date}</span>
                    <span className="font-normal">{p.subjectName}</span>
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
                  />
                </div>
              </li>
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
  );
}

/**
 * 진도율 통계 헤더(분반별). 단원진도(마지막 도달 단원, AC-2.2)는 항상 표시하고,
 * 시험진도율(목표 vs 실제, 초록/빨강)은 지필 시행 과목(showExamProgress)만 표시한다(AC-2.4).
 */
function StatsHeader({ stats }: { stats: StatView[] }) {
  if (stats.length === 0) return null;
  const pct = (r: number) => `${Math.round(r * 100)}%`;
  // 목표는 "오늘까지 차시 ÷ 시험목표 차시"라 시험일이 지나면 100%를 넘어(475% 등)
  // 진도율로 읽히지 않는다. 표시는 100%로 상한을 두고, 초과분은 '시험 경과'로 알린다.
  const targetPct = (r: number) =>
    r > 1 ? "100% (시험 경과)" : `${Math.round(r * 100)}%`;
  return (
    <section className="rounded-lg border border-neutral-200 p-5">
      <h3 className="font-normal text-neutral-800">진도 현황(분반별)</h3>
      <p className="mt-1 text-xs text-neutral-400">
        단원진도 = 완료(done) 차시의 마지막 도달 단원(여유차시 제외, 자동 도출). 시험진도율은
        지필 시행 과목만 표시(목표 = 오늘까지 차시 ÷ 시험목표 차시, 2차시 이상 뒤지면 빨강).
      </p>
      <ul className="mt-3 space-y-2">
        {stats.map((st) => (
          <li
            key={st.sectionId}
            className={`flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm ${
              st.showExamProgress
                ? st.color === "red"
                  ? "border-red-200 bg-red-50"
                  : "border-green-200 bg-green-50"
                : "border-neutral-200 bg-neutral-50"
            }`}
          >
            <span className="font-normal">
              {st.subjectName}{" "}
              <span className="text-neutral-400">{st.label}</span>
            </span>
            <span className="flex flex-wrap items-center gap-3">
              <span className="text-neutral-600">
                단원진도{" "}
                {st.lastDoneUnitCode != null ? (
                  <span className="font-normal text-neutral-800">
                    {fmtCode(st.lastDoneUnitCode)}
                    {st.lastDoneUnitLabel && (
                      <span className="ml-1 text-xs text-neutral-500">
                        {st.lastDoneUnitLabel}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-neutral-400">진행 전</span>
                )}
              </span>
              {st.showExamProgress && (
                <>
                  <span className="text-neutral-600">
                    목표 {targetPct(st.targetRate)} · 실제{" "}
                    <span
                      className={
                        st.color === "red"
                          ? "font-normal text-red-600"
                          : "font-normal text-green-700"
                      }
                    >
                      {pct(st.actualRate)}
                    </span>
                  </span>
                  <span className="text-xs text-neutral-400">
                    ({st.actualDone}/{st.examTargetTotal}차시)
                  </span>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const SECTION_PAGE_SIZE = 20;

function SectionBlock({
  section,
  statusLabel,
}: {
  section: SectionView;
  statusLabel: Record<string, string>;
}) {
  const [page, setPage] = useState(1);
  const { pageItems, totalPages, currentPage } = paginate(
    section.sessions,
    page,
    SECTION_PAGE_SIZE,
  );
  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
        <span className="font-normal">
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
        <>
        {/* 분반 6개 × 20행이 그대로 펼쳐지면 페이지가 7,000px를 넘어 아래 분반이
            사실상 도달 불가였다. 블록 안에서만 스크롤시킨다. */}
        <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto pr-1 text-sm">
          {pageItems.map((s) => (
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
                />
              </div>
            </li>
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
    </div>
  );
}

/**
 * 차시 상태 토글(예정/미진행/완료). 세 상태 모두 즉시 status 변경(별도 수행체크 입력
 * 폼 없음 — AC-2.1). 완료(done) 차시의 마지막 단원이 진척도 헤더에 자동 도출된다.
 */
function StatusButtons({
  sessionId,
  current,
  statusLabel,
}: {
  sessionId: string;
  current: SessionStatus;
  statusLabel: Record<string, string>;
}) {
  const [pending, startTransition] = useTransition();
  // 낙관 상태: 서버 revalidate 전에도 방금 누른 상태가 선택돼 보이게 한다.
  // (금주·연체 목록은 current 를 planned 로 고정 전달하므로 이게 유일한 피드백)
  const [optimistic, setOptimistic] = useState<SessionStatus | null>(null);
  const active = optimistic ?? current;

  function setStatus(status: SessionStatus) {
    setOptimistic(status);
    const fd = new FormData();
    fd.set("sessionId", sessionId);
    fd.set("status", status);
    startTransition(() => {
      void setProgressStatusAction(fd);
    });
  }

  return (
    <span className="flex gap-1">
      {(["planned", "not_held", "done"] as const).map((st) => {
        const on = active === st;
        return (
          <button
            key={st}
            type="button"
            aria-pressed={on}
            disabled={pending}
            onClick={() => setStatus(st)}
            className={`rounded border px-2 py-0.5 text-xs transition-colors disabled:opacity-50 ${
              on
                ? "border-white bg-white font-normal text-black"
                : "border-white/25 text-neutral-500 hover:bg-white/10 hover:text-white"
            }`}
          >
            {statusLabel[st]}
          </button>
        );
      })}
    </span>
  );
}
