"use client";
import { useMemo, useState } from "react";

/**
 * 오늘의 학교 학사일정 캘린더 (QC v4 AC-7.9). 다가오는 학사일정을 월간 캘린더로
 * 표시하고, 담임 학생 전체의 예정 상담 예약을 같은 칸에 오버레이한다.
 * 공개 페이지(public-page-view) 캘린더 패턴을 차용하되 상담 오버레이를 추가했다.
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

const WK = ["일", "월", "화", "수", "목", "금", "토"];

export function EventsCalendar({
  events,
  counsel,
}: {
  events: CalendarEventItem[];
  counsel: CalendarCounselItem[];
}) {
  const todayStr = useMemo(() => kstToday(), []);
  const [ty, tm] = useMemo(() => {
    const [y, m] = todayStr.split("-").map(Number);
    return [y, m - 1] as const;
  }, [todayStr]);
  const [month, setMonth] = useState(() => ({ year: ty, month: tm }));

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

  return (
    <section className="rounded-lg border border-neutral-200 p-4 md:col-span-2">
      <h2 className="text-sm font-semibold text-neutral-700">다가오는 학사일정 · 상담</h2>
      <div className="mb-2 mt-2 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-neutral-50"
        >
          ‹
        </button>
        <span className="font-medium">
          {month.year}년 {month.month + 1}월
        </span>
        <button
          type="button"
          onClick={() => shift(1)}
          className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-neutral-50"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-px text-center text-xs">
        {WK.map((w) => (
          <div key={w} className="py-1 font-medium text-neutral-400">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          const dateStr = ymd(new Date(month.year, month.month, d));
          const evs = eventsByDate.get(dateStr) ?? [];
          const cs = counselByDate.get(dateStr) ?? [];
          const isToday = dateStr === todayStr;
          return (
            <div
              key={dateStr}
              className={`min-h-[3.5rem] rounded border p-1 text-left ${
                isToday
                  ? "border-blue-400 bg-blue-50 font-semibold"
                  : "border-neutral-100"
              }`}
            >
              <div className="text-[11px] text-neutral-500">{d}</div>
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
            </div>
          );
        })}
      </div>
    </section>
  );
}
