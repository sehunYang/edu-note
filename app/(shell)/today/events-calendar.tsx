"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  fetchCalendarRange,
  listMemosForDate,
  createMemoAction,
  updateMemoAction,
  deleteMemoAction,
} from "./actions";
import type { TodayMemoRow } from "@/lib/db/queries";
import { Button } from "@/app/ui/button";

/**
 * 오늘의 학교 학사일정 캘린더 (QC v5 c7 B.3/B.4). 다가오는 학사일정을 월간 캘린더로
 * 표시하고, 담임 학생 전체의 예정 상담 예약을 같은 칸에 오버레이한다.
 *
 * B.3: 월 네비게이션 시 해당 월 범위로 events/counsel/메모를 서버에서 재조회한다
 * (today+30 고정 폐기 — 과거 달도 당시 학사일정·상담 노출). kstToday 기준 today
 * 강조 필터는 유지.
 * B.4: 날짜 클릭 → 모달로 그날 학사일정·상담·메모 표시 + "일정 추가하기" 메모 CRUD.
 * 메모는 오늘의학교 전용(공개 페이지/타 캘린더에는 노출하지 않음).
 */
export interface CalendarEventItem {
  date: string; // YYYY-MM-DD
  title: string;
}
export interface CalendarCounselItem {
  date: string; // YYYY-MM-DD
  studentLabel: string;
}

function kstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
/** 월(year, 0-based month)의 [first, last] 날짜 문자열. */
function monthRange(year: number, month: number): [string, string] {
  const first = ymd(new Date(year, month, 1));
  const last = ymd(new Date(year, month + 1, 0));
  return [first, last];
}

const WK = ["일", "월", "화", "수", "목", "금", "토"];

export function EventsCalendar({
  events: initialEvents,
  counsel: initialCounsel,
  memos: initialMemos = [],
}: {
  events: CalendarEventItem[];
  counsel: CalendarCounselItem[];
  memos?: TodayMemoRow[];
}) {
  const todayStr = useMemo(() => kstToday(), []);
  const [ty, tm] = useMemo(() => {
    const [y, m] = todayStr.split("-").map(Number);
    return [y, m - 1] as const;
  }, [todayStr]);
  const [month, setMonth] = useState(() => ({ year: ty, month: tm }));

  // 현재 표시 중인 월의 데이터(초기엔 서버 props, 월 이동 시 재조회로 교체).
  const [events, setEvents] = useState<CalendarEventItem[]>(initialEvents);
  const [counsel, setCounsel] = useState<CalendarCounselItem[]>(initialCounsel);
  const [memos, setMemos] = useState<TodayMemoRow[]>(initialMemos);
  const [loading, startLoad] = useTransition();

  // 초기 월(=오늘 월)은 props 를 그대로 쓰고, 그 이후 월 변경 시에만 재조회한다.
  const [isInitial, setIsInitial] = useState(true);
  useEffect(() => {
    if (isInitial) {
      setIsInitial(false);
      return;
    }
    const [from, to] = monthRange(month.year, month.month);
    startLoad(async () => {
      const data = await fetchCalendarRange(from, to);
      setEvents(data.events);
      setCounsel(data.counsel);
      setMemos(data.memos);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month.year, month.month]);

  // 날짜 클릭 모달 상태.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of events) {
      const arr = map.get(e.date) ?? [];
      arr.push(e.title);
      map.set(e.date, arr);
    }
    return map;
  }, [events]);

  const counselByDate = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of counsel) {
      const arr = map.get(c.date) ?? [];
      arr.push(c.studentLabel);
      map.set(c.date, arr);
    }
    return map;
  }, [counsel]);

  const memoCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of memos) map.set(m.date, (map.get(m.date) ?? 0) + 1);
    return map;
  }, [memos]);

  const first = new Date(month.year, month.month, 1);
  const startWeekday = first.getDay();
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

  /** 모달에서 메모를 갱신한 뒤, 캘린더 칸 마커 동기화를 위해 월 메모를 재조회. */
  function refreshMonthMemos() {
    const [from, to] = monthRange(month.year, month.month);
    startLoad(async () => {
      const data = await fetchCalendarRange(from, to);
      setMemos(data.memos);
    });
  }

  return (
    <section className="rounded-lg border border-neutral-200 p-4 md:col-span-2">
      <h2 className="text-sm font-normal text-neutral-700">학사일정 · 상담 · 메모</h2>
      <div className="mb-2 mt-2 flex items-center justify-between text-sm">
        <Button
          type="button"
          onClick={() => shift(-1)}
          className="px-2 py-0.5"
        >
          ‹
        </Button>
        <span className="font-normal">
          {month.year}년 {month.month + 1}월
          {loading && <span className="ml-2 text-xs text-neutral-400">불러오는 중…</span>}
        </span>
        <Button
          type="button"
          onClick={() => shift(1)}
          className="px-2 py-0.5"
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
          const evs = eventsByDate.get(dateStr) ?? [];
          const cs = counselByDate.get(dateStr) ?? [];
          const memoCount = memoCountByDate.get(dateStr) ?? 0;
          const isToday = dateStr === todayStr;
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => setSelectedDate(dateStr)}
              className={`min-h-[3.5rem] rounded border p-1 text-left transition hover:border-blue-300 hover:bg-blue-50/40 ${
                isToday
                  ? "border-blue-400 bg-blue-50 font-normal"
                  : "border-neutral-100"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-neutral-500">{d}</span>
                {memoCount > 0 && (
                  <span className="rounded-full bg-purple-100 px-1 text-[9px] text-purple-700">
                    메모 {memoCount}
                  </span>
                )}
              </div>
              {evs.map((title, j) => (
                <div
                  key={`ev${j}`}
                  title={title}
                  className="mt-0.5 truncate rounded bg-neutral-200 px-1 text-[10px] text-neutral-700"
                >
                  {title}
                </div>
              ))}
              {cs.map((label, j) => (
                <div
                  key={`cs${j}`}
                  title={`상담: ${label}`}
                  className="mt-0.5 truncate rounded bg-green-100 px-1 text-[10px] text-green-700"
                >
                  상담 {label}
                </div>
              ))}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <DayDetailModal
          date={selectedDate}
          events={eventsByDate.get(selectedDate) ?? []}
          counsel={counselByDate.get(selectedDate) ?? []}
          onClose={() => setSelectedDate(null)}
          onMemosChanged={refreshMonthMemos}
        />
      )}
    </section>
  );
}

/**
 * 날짜 상세 모달(B.4). 그날 학사일정·상담을 읽기 표시 + 메모 CRUD("일정 추가하기").
 * 메모는 모달 진입 시 서버에서 해당 날짜분만 조회한다(일자별 다건).
 */
function DayDetailModal({
  date,
  events,
  counsel,
  onClose,
  onMemosChanged,
}: {
  date: string;
  events: string[];
  counsel: string[];
  onClose: () => void;
  onMemosChanged: () => void;
}) {
  const [memos, setMemos] = useState<TodayMemoRow[]>([]);
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      setMemos(await listMemosForDate(date));
    });
  }, [date]);

  function add() {
    const content = draft.trim();
    if (!content) return;
    startTransition(async () => {
      const rows = await createMemoAction(date, content);
      setMemos(rows);
      setDraft("");
      onMemosChanged();
    });
  }
  function saveEdit() {
    if (!editId) return;
    const content = editText.trim();
    if (!content) return;
    startTransition(async () => {
      const rows = await updateMemoAction(editId, date, content);
      setMemos(rows);
      setEditId(null);
      setEditText("");
      onMemosChanged();
    });
  }
  function remove(id: string) {
    startTransition(async () => {
      const rows = await deleteMemoAction(id, date);
      setMemos(rows);
      onMemosChanged();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in-up items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md animate-scale-in rounded-xl bg-card p-6 border border-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-normal text-neutral-800">{date}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-white/10 hover:text-neutral-600"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {(events.length > 0 || counsel.length > 0) && (
          <div className="mt-3 space-y-1 text-sm">
            {events.map((t, i) => (
              <div
                key={`ev${i}`}
                className="rounded bg-neutral-100 px-2 py-1 text-neutral-700"
              >
                {t}
              </div>
            ))}
            {counsel.map((c, i) => (
              <div
                key={`cs${i}`}
                className="rounded bg-green-50 px-2 py-1 text-green-700"
              >
                상담 {c}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <h3 className="text-xs font-normal text-neutral-500">메모</h3>
          {memos.length === 0 ? (
            <p className="mt-1 text-xs text-neutral-400">메모가 없습니다.</p>
          ) : (
            <ul className="mt-1 space-y-1.5 text-sm">
              {memos.map((m) => (
                <li
                  key={m.id}
                  className="flex items-start justify-between gap-2 rounded border border-neutral-200 px-2 py-1.5"
                >
                  {editId === m.id ? (
                    <>
                      <input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="min-w-0 flex-1 rounded border border-neutral-300 px-1.5 py-0.5 text-sm"
                      />
                      <Button
                        type="button"
                        onClick={saveEdit}
                        disabled={pending}
                        className="shrink-0 px-2 py-0.5 text-xs"
                      >
                        저장
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 whitespace-pre-line break-words">
                        {m.content}
                      </span>
                      <span className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditId(m.id);
                            setEditText(m.content);
                          }}
                          className="rounded px-1 text-xs text-neutral-500 hover:bg-white/10"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(m.id)}
                          disabled={pending}
                          className="rounded px-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50"
                        >
                          삭제
                        </button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              placeholder="일정/메모 입력"
              className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
            />
            <Button
              type="button"
              onClick={add}
              disabled={pending || !draft.trim()}
              className="shrink-0 px-3 py-1 text-sm"
            >
              일정 추가하기
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
