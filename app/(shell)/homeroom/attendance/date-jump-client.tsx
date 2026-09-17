"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatYmd, monthGrid, ymdWeekday } from "@/lib/domain/ymd";
import { kstDateString } from "@/lib/domain/kst";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 오늘 입력 날짜 선택 — 달력에서 날짜를 누르면 즉시 그 날짜의 출결로 이동한다.
 *
 * 브라우저 기본 날짜 입력(type=date)을 쓰지 않는 이유: Chrome 은 달력 팝업에서 월만
 * 넘겨도(‹ › 버튼, 월 세그먼트 방향키) "같은 날짜의 다음 달"을 값으로 확정하고
 * change 를 발화한다(Playwright 실측: 월 세그먼트 ArrowUp → change:2026-10-17).
 * 값이 바뀌는 즉시 이동하는 이 화면에서는 달을 넘기려는 순간 페이지가 바뀌고
 * 팝업이 닫혀, 두 달 전으로는 갈 수가 없었다. 그래서 "보는 달"과 "고른 날"을
 * 분리한 달력을 직접 그린다 — 월 이동은 보는 달만 바꾸고, 날짜 클릭만 이동한다.
 */
export function AttendanceDateJump({ date }: { date: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => monthOf(date));
  const rootRef = useRef<HTMLDivElement>(null);
  const today = kstDateString();

  // 바깥 클릭·Esc 로 닫기.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle() {
    // 열 때마다 고른 날의 달부터 보여준다(지난번에 넘겨 둔 달이 남지 않게).
    if (!open) setView(monthOf(date));
    setOpen(!open);
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      const m = v.month + delta;
      if (m < 1) return { year: v.year - 1, month: 12 };
      if (m > 12) return { year: v.year + 1, month: 1 };
      return { year: v.year, month: m };
    });
  }

  function go(d: string) {
    setOpen(false);
    router.push(`/homeroom/attendance?view=today&date=${d}`);
  }

  return (
    <div ref={rootRef} className="relative mt-4 flex items-center gap-2 text-sm">
      <span className="text-neutral-500">날짜</span>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        className="rounded border border-neutral-300 px-2 py-1 hover:bg-white/10"
      >
        {date} ({WEEKDAYS[ymdWeekday(date)]})
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="날짜 선택"
          className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border border-neutral-300 bg-[var(--background)] p-3 shadow-lg"
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="이전 달"
              onClick={() => shiftMonth(-1)}
              className="rounded px-2 py-0.5 hover:bg-white/10"
            >
              ‹
            </button>
            <span>
              {view.year}년 {view.month}월
            </span>
            <button
              type="button"
              aria-label="다음 달"
              onClick={() => shiftMonth(1)}
              className="rounded px-2 py-0.5 hover:bg-white/10"
            >
              ›
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-px text-center text-xs">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1 text-neutral-400">
                {w}
              </div>
            ))}
            {monthGrid(view.year, view.month).map((d, i) => {
              if (d === null) return <div key={`e${i}`} />;
              const ymd = formatYmd(view.year, view.month, d);
              const selected = ymd === date;
              const isToday = ymd === today;
              return (
                <button
                  key={ymd}
                  type="button"
                  onClick={() => go(ymd)}
                  aria-current={selected ? "date" : undefined}
                  className={`rounded py-1 ${
                    selected
                      ? "bg-white text-black hover:bg-white/90"
                      : isToday
                        ? "border border-white/40 hover:bg-white/10"
                        : "hover:bg-white/10"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div className="mt-2 text-right">
            <button
              type="button"
              onClick={() => go(today)}
              className="text-xs text-neutral-500 hover:underline"
            >
              오늘
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function monthOf(ymd: string): { year: number; month: number } {
  return { year: Number(ymd.slice(0, 4)), month: Number(ymd.slice(5, 7)) };
}
