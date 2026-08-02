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
import type { GoogleEventDisplayItem } from "@/lib/domain/google-event";
import type { EventKind, VacationSpan } from "@/lib/domain/calendar-keywords";
import {
  EVENT_KIND_CHIP,
  VACATION_BAND_BG,
} from "@/lib/domain/event-kind-display";
import { Button } from "@/app/ui/button";
import { ConfirmButton } from "@/app/ui/confirm-button";
import { CalendarLegend } from "./calendar-legend";

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
  eventKind: EventKind; // 종류별 고유 색상
}
export interface CalendarCounselItem {
  date: string; // YYYY-MM-DD
  studentLabel: string;
}
/** 캘린더 칸에 표시할 이벤트(제목+종류). */
interface DayEvent {
  title: string;
  eventKind: EventKind;
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
  googleEvents: initialGoogleEvents = [],
  googleSyncError = null,
  vacationSpans: initialVacationSpans = [],
}: {
  events: CalendarEventItem[];
  counsel: CalendarCounselItem[];
  memos?: TodayMemoRow[];
  /** 구글 캘린더 → 읽기 전용 표시(우리가 push한 항목은 서버에서 이미 제외됨). */
  googleEvents?: GoogleEventDisplayItem[];
  googleSyncError?: string | null;
  /** 방학 구간 — 구간 내 모든 날(주말 포함)을 배경 밴드로 음영. */
  vacationSpans?: VacationSpan[];
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
  const [googleEvents, setGoogleEvents] =
    useState<GoogleEventDisplayItem[]>(initialGoogleEvents);
  const [vacationSpans, setVacationSpans] =
    useState<VacationSpan[]>(initialVacationSpans);
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
      setGoogleEvents(data.googleEvents);
      setVacationSpans(data.vacationSpans);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month.year, month.month]);

  // 날짜 클릭 모달 상태.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, DayEvent[]>();
    for (const e of events) {
      const arr = map.get(e.date) ?? [];
      arr.push({ title: e.title, eventKind: e.eventKind });
      map.set(e.date, arr);
    }
    return map;
  }, [events]);

  /** 방학 구간(양끝 포함) 안의 날짜인지 — 주말 포함 밴드 음영용. */
  const isVacationDate = useMemo(() => {
    return (dateStr: string) =>
      vacationSpans.some((s) => s.start <= dateStr && dateStr <= s.end);
  }, [vacationSpans]);

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

  const googleEventsByDate = useMemo(() => {
    const map = new Map<string, GoogleEventDisplayItem[]>();
    for (const g of googleEvents) {
      const arr = map.get(g.date) ?? [];
      arr.push(g);
      map.set(g.date, arr);
    }
    return map;
  }, [googleEvents]);

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
      <h2 className="text-sm text-neutral-700">학사일정 · 상담 · 메모</h2>
      {googleSyncError && (
        <p className="mt-1 text-xs text-red-600">
          ⚠ 구글 동기화 오류 — 세팅실 프로필에서 확인하세요.
        </p>
      )}
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
      <CalendarLegend />
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
          const gEvents = googleEventsByDate.get(dateStr) ?? [];
          const isToday = dateStr === todayStr;
          const isVac = isVacationDate(dateStr);
          // 배경: 오늘 > 방학 밴드 > 기본. 방학 구간은 주말 포함 연속 음영.
          const cellBg = isToday
            ? "border-blue-400 bg-blue-50 font-normal"
            : isVac
              ? `border-amber-200 ${VACATION_BAND_BG}`
              : "border-neutral-100";
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => setSelectedDate(dateStr)}
              className={`min-h-[3.5rem] rounded border p-1 text-left transition hover:border-blue-300 hover:bg-blue-50/40 ${cellBg}`}
            >
              {/* desktop-scale D-4: 이 축소 크기들은 390px 폰에서 7열 셀이 약
                  50px 였기 때문에 정해진 값이다. 데스크톱에서는 본문이 1296px 라
                  셀이 약 180px — 3.6배 넓은데 글자는 그대로여서 화면에서 가장
                  작은 텍스트로 남았다. xl(≥1280, 루트 배율이 시작되는 지점)에서만
                  한 단계 올린다. 모바일 값은 건드리지 않는다. */}
              <div className="flex items-center justify-between">
                <span className="text-[0.6875rem] text-neutral-500 xl:text-xs">{d}</span>
                {memoCount > 0 && (
                  <span className="rounded-full bg-purple-100 px-1 text-[0.5625rem] text-purple-700 xl:text-[0.6875rem]">
                    메모 {memoCount}
                  </span>
                )}
              </div>
              {evs.map((e, j) => (
                <div
                  key={`ev${j}`}
                  title={e.title}
                  className={`mt-0.5 truncate rounded px-1 text-[0.625rem] xl:text-xs ${EVENT_KIND_CHIP[e.eventKind]}`}
                >
                  {e.title}
                </div>
              ))}
              {cs.map((label, j) => (
                <div
                  key={`cs${j}`}
                  title={`상담: ${label}`}
                  className="mt-0.5 truncate rounded bg-green-100 px-1 text-[0.625rem] text-green-700 xl:text-xs"
                >
                  상담 {label}
                </div>
              ))}
              {gEvents.map((g, j) => (
                <div
                  key={`ge${j}`}
                  title={`구글: ${g.title}`}
                  className="mt-0.5 truncate rounded bg-blue-100 px-1 text-[0.625rem] text-blue-700 xl:text-xs"
                >
                  G {g.title}
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
          googleEvents={googleEventsByDate.get(selectedDate) ?? []}
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
  googleEvents = [],
  onClose,
  onMemosChanged,
}: {
  date: string;
  events: DayEvent[];
  counsel: string[];
  /** 구글 캘린더 읽기 전용 표시(수정·삭제 불가 — 편집은 구글에서). */
  googleEvents?: GoogleEventDisplayItem[];
  onClose: () => void;
  onMemosChanged: () => void;
}) {
  const [memos, setMemos] = useState<TodayMemoRow[]>([]);
  const [draft, setDraft] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
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
      const rows = await createMemoAction(date, content, startTime || undefined, endTime || undefined);
      setMemos(rows);
      setDraft("");
      setStartTime("");
      setEndTime("");
      onMemosChanged();
    });
  }
  function saveEdit() {
    if (!editId) return;
    const content = editText.trim();
    if (!content) return;
    startTransition(async () => {
      const rows = await updateMemoAction(
        editId,
        date,
        content,
        editStartTime || undefined,
        editEndTime || undefined,
      );
      setMemos(rows);
      setEditId(null);
      setEditText("");
      setEditStartTime("");
      setEditEndTime("");
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
          <h2 className="text-base text-neutral-800">{date}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-white/10 hover:text-neutral-600"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {(events.length > 0 || counsel.length > 0 || googleEvents.length > 0) && (
          <div className="mt-3 space-y-1 text-sm">
            {events.map((e, i) => (
              <div
                key={`ev${i}`}
                className={`rounded px-2 py-1 ${EVENT_KIND_CHIP[e.eventKind]}`}
              >
                {e.title}
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
            {googleEvents.map((g, i) => (
              <div
                key={`ge${i}`}
                className="rounded bg-blue-50 px-2 py-1 text-blue-700"
                title="구글 캘린더 일정(읽기 전용) — 수정·삭제는 구글에서 해주세요."
              >
                구글: {g.title}
                {g.startTime && (
                  <span className="ml-1 text-xs text-blue-500">
                    {g.endTime ? `${g.startTime}–${g.endTime}` : `${g.startTime}~`}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <h3 className="text-xs text-neutral-500">메모</h3>
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
                      <div className="min-w-0 flex-1 space-y-1">
                        <input aria-label="메모 내용"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full rounded border border-neutral-300 px-1.5 py-0.5 text-sm"
                        />
                        <div className="flex items-center gap-1 text-xs">
                          <input aria-label="시작 시간"
                            type="time"
                            value={editStartTime}
                            onChange={(e) => setEditStartTime(e.target.value)}
                            className="rounded border border-neutral-300 px-1 py-0.5"
                          />
                          <span className="text-neutral-400">~</span>
                          <input aria-label="종료 시간"
                            type="time"
                            value={editEndTime}
                            onChange={(e) => setEditEndTime(e.target.value)}
                            className="rounded border border-neutral-300 px-1 py-0.5"
                          />
                        </div>
                      </div>
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
                        {m.startTime && (
                          <span className="ml-1.5 text-xs text-neutral-400">
                            {m.endTime ? `${m.startTime}–${m.endTime}` : `${m.startTime}~`}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditId(m.id);
                            setEditText(m.content);
                            setEditStartTime(m.startTime ?? "");
                            setEditEndTime(m.endTime ?? "");
                          }}
                          className="rounded px-1 text-xs text-neutral-500 hover:bg-white/10"
                        >
                          수정
                        </button>
                        <ConfirmButton
                          type="button"
                          message="이 메모를 삭제할까요? 되돌릴 수 없습니다."
                          onClick={() => remove(m.id)}
                          disabled={pending}
                          className="rounded px-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50"
                        >
                          삭제
                        </ConfirmButton>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 space-y-1.5">
            <div className="flex gap-2">
              <input aria-label="일정/메모 입력"
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
            <div className="flex items-center gap-1 text-xs text-neutral-500">
              <span>시간(선택, 비우면 종일)</span>
              <input aria-label="시작 시간"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="rounded border border-neutral-300 px-1 py-0.5"
              />
              <span className="text-neutral-400">~</span>
              <input aria-label="종료 시간"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="rounded border border-neutral-300 px-1 py-0.5"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
