"use client";
import { useMemo, useState, useTransition } from "react";
import type { PublicPagePayload, PublicVacationSpan, PublicStudentMemo } from "@/lib/public";
import { saveStudentMemoAction, deleteStudentMemoAction } from "../actions";
import type { EventKind } from "@/lib/domain/calendar-keywords";
import { VACATION_BAND_BG } from "@/lib/domain/event-kind-display";
import { Button } from "@/app/ui/button";
import { kstToday, ymd, Card, type DayEvent, eventChipClass } from "../_shared";

/**
 * 점 마커 색상 — 캘린더 칸 이벤트 칩(eventChipClass)과 동일 hue 계열의 solid dot.
 * 신규 hue 도입 금지(스펙 R4) — EVENT_KIND_CHIP 배경색과 같은 계열만 사용.
 */
function eventDotClass(eventKind: EventKind | "counsel" | null): string {
  switch (eventKind) {
    case "exam":
      return "bg-red-400";
    case "mock_exam":
      return "bg-rose-400";
    case "vacation":
      return "bg-amber-400";
    case "holiday":
      return "bg-orange-400";
    case "club":
      return "bg-violet-400";
    case "self_activity":
      return "bg-cyan-400";
    case "career_activity":
      return "bg-teal-400";
    case "counsel":
      return "bg-green-400";
    default:
      return "bg-neutral-400";
  }
}

// ── 일정 안내(월간 달력 + 네비 + 인라인 날짜 상세) ─────────────────────────
function ScheduleTab({
  token,
  todos,
  memos,
  vacationSpans,
}: {
  token: string;
  todos: PublicPagePayload["weekTodos"];
  memos: PublicStudentMemo[];
  /** 방학 구간 — 구간 내 모든 날(주말 포함)을 배경 밴드로 음영(오늘의학교와 동일). */
  vacationSpans: PublicVacationSpan[];
}) {
  // 오늘 강조는 KST 날짜 경계 기준(12시간 고정 아님 — 날짜가 바뀌면 자동 갱신).
  const todayStr = useMemo(() => kstToday(), []);
  const [ty, tm] = useMemo(() => {
    const [y, m] = todayStr.split("-").map(Number);
    return [y, m - 1] as const; // month 0-based
  }, [todayStr]);
  const [month, setMonth] = useState(() => ({
    year: ty,
    month: tm,
  }));
  // 날짜 클릭 → 그날 학사일정·개인 메모 CRUD 를 grid 바로 아래 인라인으로 펼침.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 날짜(YYYY-MM-DD) → 학사일정 항목(제목+종류) 목록.
  const byDate = useMemo(() => {
    const map = new Map<string, DayEvent[]>();
    for (const t of todos) {
      const key = t.at.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push({ title: t.title, eventKind: t.eventKind });
      map.set(key, arr);
    }
    return map;
  }, [todos]);

  /** 방학 구간(양끝 포함) 안의 날짜인지 — 주말 포함 밴드 음영용(오늘의학교와 동일 규칙). */
  const isVacationDate = useMemo(() => {
    return (dateStr: string) =>
      vacationSpans.some((s) => s.start <= dateStr && dateStr <= s.end);
  }, [vacationSpans]);

  // 날짜 → 개인 메모 목록(본인 토큰 스코프).
  const memosByDate = useMemo(() => {
    const map = new Map<string, PublicStudentMemo[]>();
    for (const m of memos) {
      const arr = map.get(m.date) ?? [];
      arr.push(m);
      map.set(m.date, arr);
    }
    return map;
  }, [memos]);

  const first = new Date(month.year, month.month, 1);
  const startWeekday = first.getDay(); // 0=일
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function shift(delta: number) {
    setMonth((m) => {
      const nm = m.month + delta;
      const year = m.year + Math.floor(nm / 12);
      const mm = ((nm % 12) + 12) % 12;
      return { year, month: mm };
    });
  }

  const WK = ["일", "월", "화", "수", "목", "금", "토"];

  return (
    <Card title="일정 안내">
      <div className="mb-2 flex items-center justify-between text-sm">
        <Button
          type="button"
          onClick={() => shift(-1)}
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
        >
          ‹
        </Button>
        <span className="font-normal">
          {month.year}년 {month.month + 1}월
        </span>
        <Button
          type="button"
          onClick={() => shift(1)}
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
        >
          ›
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-px text-center text-xs">
        {WK.map((w) => (
          <div key={w} className="py-1 font-normal text-neutral-400">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          const dateStr = ymd(new Date(month.year, month.month, d));
          const events = byDate.get(dateStr) ?? [];
          const dayMemos = memosByDate.get(dateStr) ?? [];
          const isToday = dateStr === todayStr;
          const isVac = isVacationDate(dateStr);
          // 배경: 오늘 > 방학 밴드 > 기본(오늘의학교와 동일 우선순위).
          const cellBg = isToday
            ? "border-blue-400 bg-blue-50 font-normal"
            : isVac
              ? `border-amber-200 ${VACATION_BAND_BG}`
              : "border-neutral-100";
          // 점 마커: 종류별 1개씩(최대 3개) — 칩 대신 단순화(스펙 R6).
          const dotKinds = Array.from(new Set(events.map((e) => e.eventKind))).slice(0, 3);
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => setSelectedDate(dateStr)}
              className={`min-h-[3.25rem] rounded border p-1 text-left transition hover:border-blue-400 ${cellBg}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500">{d}</span>
                {dayMemos.length > 0 && (
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                )}
              </div>
              {dotKinds.length > 0 && (
                <div className="mt-1 flex items-center justify-center gap-0.5">
                  {dotKinds.map((k, j) => (
                    <span
                      key={j}
                      title={events.find((e) => e.eventKind === k)?.title}
                      className={`h-1.5 w-1.5 rounded-full ${eventDotClass(k)}`}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 인라인 날짜 상세(모달 대체) — 항상 마운트, .accordion-open 만 토글해야 expand 모핑이 재생된다. */}
      <div className={`accordion mt-3 ${selectedDate ? "accordion-open" : ""}`}>
        <div key={selectedDate ?? "none"}>
          {selectedDate && (
            <DayDetailPanel
              token={token}
              date={selectedDate}
              events={byDate.get(selectedDate) ?? []}
              memos={memosByDate.get(selectedDate) ?? []}
              onClose={() => setSelectedDate(null)}
            />
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * 학생 캘린더 날짜 상세 인라인 패널(모달 대체). 그날 학사일정(읽기) + 개인 메모/일정 CRUD.
 * 개인 메모는 본인 토큰 스코프 서버액션으로만 쓰며, 타학생·교사에게 절대 보이지 않는다.
 */
function DayDetailPanel({
  token,
  date,
  events,
  memos,
  onClose,
}: {
  token: string;
  date: string;
  events: DayEvent[];
  memos: PublicStudentMemo[];
  onClose: () => void;
}) {
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function add() {
    const text = body.trim();
    if (!text) return;
    setErr(null);
    start(async () => {
      const res = await saveStudentMemoAction(token, date, text);
      if (res.ok) setBody("");
      else setErr(res.message);
    });
  }

  function saveEdit(id: string) {
    const text = editBody.trim();
    if (!text) return;
    setErr(null);
    start(async () => {
      const res = await saveStudentMemoAction(token, date, text, id);
      if (res.ok) setEditingId(null);
      else setErr(res.message);
    });
  }

  function remove(id: string) {
    setErr(null);
    start(async () => {
      const res = await deleteStudentMemoAction(token, id);
      if (!res.ok) setErr(res.message);
    });
  }

  return (
    <div className="rounded-xl border border-hairline bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-normal text-neutral-800">{date}</h3>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] inline-flex items-center px-2 text-xs text-neutral-400 hover:underline"
        >
          닫기
        </button>
      </div>

      {events.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-normal text-neutral-500">학사일정</h4>
          <ul className="mt-1 space-y-1 text-sm">
            {events.map((e, i) => (
              <li
                key={i}
                className={`rounded px-2 py-1 ${eventChipClass(e.eventKind, "bg-neutral-100 text-neutral-700")}`}
              >
                {e.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3">
        <h4 className="text-xs font-normal text-neutral-500">내 메모/일정</h4>
        <ul className="mt-1 space-y-1.5">
          {memos.length === 0 && (
            <li className="text-xs text-neutral-400">등록한 메모가 없습니다.</li>
          )}
          {memos.map((m) => (
            <li key={m.id} className="rounded border border-neutral-200 px-2 py-1.5 text-sm">
              {editingId === m.id ? (
                <div className="space-y-1">
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={2}
                    className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      loading={pending}
                      onClick={() => saveEdit(m.id)}
                      className="min-h-[44px] px-3 text-xs"
                    >
                      저장
                    </Button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="min-h-[44px] inline-flex items-center rounded border border-neutral-300 px-3 text-xs"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <p className="whitespace-pre-line">{m.body}</p>
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(m.id);
                        setEditBody(m.body);
                      }}
                      className="min-h-[44px] inline-flex items-center px-1 text-xs text-neutral-500 hover:underline"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(m.id)}
                      className="min-h-[44px] inline-flex items-center px-1 text-xs text-red-500 hover:underline disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 space-y-1">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="메모/일정 추가"
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        {err && <p className="text-xs text-red-600">{err}</p>}
        <Button
          type="button"
          loading={pending}
          disabled={!body.trim()}
          onClick={add}
          className="w-full min-h-[44px] text-sm"
        >
          일정 추가하기
        </Button>
      </div>
    </div>
  );
}

export { ScheduleTab };
