"use client";
import { useMemo, useState, useTransition } from "react";
import type {
  PublicPagePayload,
  PublicAttendance2D,
  PublicCounselSlot,
} from "@/lib/public";
import { saveElectiveAction, reserveCounselAction } from "./actions";

/**
 * 공개 학생 안내 페이지 클라이언트 뷰 (QC v3 Part B, US-B13, AC-12.1~12.8).
 *
 * 모든 데이터는 allowlist DTO(get_public_page → parsePublicPagePayload) 로 사전집계된 값.
 * 쓰기(선택과목 자가매핑·상담신청)는 토큰 스코프 서버액션으로만 수행한다.
 */
export function PublicPageView({
  token,
  payload,
}: {
  token: string;
  payload: PublicPagePayload;
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10 space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          {payload.studentName ? `${payload.studentName} 학생 안내 페이지` : "학생 안내 페이지"}
        </h1>
        <p className="mt-1 text-xs text-neutral-400">
          이 페이지의 링크는 외부에 공유하지 마세요.
        </p>
      </header>

      <Notices notices={payload.notices} commonNotice={payload.commonNotice} />
      <CalendarSection todos={payload.weekTodos} />
      <Timetable token={token} slots={payload.timetable} />
      <Meals meals={payload.meals} />
      <Attendance2DTable matrix={payload.attendance2D} />
      <CounselSlots token={token} slots={payload.counselSlots} />

      {payload.personalMessage && (
        <section className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h2 className="text-sm font-semibold text-blue-600">개별 메시지</h2>
          <p className="mt-1 whitespace-pre-line text-sm">
            {payload.personalMessage}
          </p>
        </section>
      )}
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold text-neutral-700">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

// ── 다중 교사 한마디(스와이프) ──────────────────────────────────────────────
function Notices({
  notices,
  commonNotice,
}: {
  notices: string[];
  commonNotice: string | null;
}) {
  // notices 우선, 비면 commonNotice 단일 폴백.
  const items = notices.length > 0 ? notices : commonNotice ? [commonNotice] : [];
  const [idx, setIdx] = useState(0);
  if (items.length === 0) return null;
  const cur = Math.min(idx, items.length - 1);
  return (
    <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-500">교사 한마디</h2>
        {items.length > 1 && (
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <button
              type="button"
              onClick={() => setIdx((cur - 1 + items.length) % items.length)}
              className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-white"
            >
              ‹
            </button>
            <span>
              {cur + 1}/{items.length}
            </span>
            <button
              type="button"
              onClick={() => setIdx((cur + 1) % items.length)}
              className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-white"
            >
              ›
            </button>
          </div>
        )}
      </div>
      <p className="mt-2 whitespace-pre-line text-sm">{items[cur]}</p>
    </section>
  );
}

// ── 일정 안내(월간 달력 + 네비) ─────────────────────────────────────────────
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function CalendarSection({
  todos,
}: {
  todos: PublicPagePayload["weekTodos"];
}) {
  const today = useMemo(() => new Date(), []);
  const todayStr = ymd(today);
  const [month, setMonth] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(), // 0-based
  }));

  // 날짜(YYYY-MM-DD) → 제목 목록.
  const byDate = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const t of todos) {
      const key = t.at.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(t.title);
      map.set(key, arr);
    }
    return map;
  }, [todos]);

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
          const events = byDate.get(dateStr) ?? [];
          const isToday = dateStr === todayStr;
          return (
            <div
              key={dateStr}
              className={`min-h-[3.25rem] rounded border p-1 text-left ${
                isToday
                  ? "border-blue-400 bg-blue-50 font-semibold"
                  : "border-neutral-100"
              }`}
            >
              <div className="text-[11px] text-neutral-500">{d}</div>
              {events.map((title, j) => (
                <div
                  key={j}
                  title={title}
                  className="mt-0.5 truncate rounded bg-neutral-200 px-1 text-[10px] text-neutral-700"
                >
                  {title}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── 시간표(월~금 × 1~7교시) ─────────────────────────────────────────────────
const TT_WEEKDAYS = [1, 2, 3, 4, 5];
const TT_WEEKDAY_LABEL: Record<number, string> = {
  1: "월",
  2: "화",
  3: "수",
  4: "목",
  5: "금",
};
const TT_PERIODS = [1, 2, 3, 4, 5, 6, 7];

function Timetable({
  token,
  slots,
}: {
  token: string;
  slots: PublicPagePayload["timetable"];
}) {
  const byCell = useMemo(() => {
    const map = new Map<string, PublicPagePayload["timetable"][number]>();
    for (const s of slots) map.set(`${s.weekday}::${s.period}`, s);
    return map;
  }, [slots]);

  return (
    <Card title="시간표">
      {slots.length === 0 ? (
        <p className="text-sm text-neutral-400">등록된 시간표가 없습니다.</p>
      ) : (
        <table className="w-full table-fixed border-collapse text-center text-xs">
          <thead>
            <tr>
              <th className="w-8 border border-neutral-200 bg-neutral-50 py-1" />
              {TT_WEEKDAYS.map((w) => (
                <th
                  key={w}
                  className="border border-neutral-200 bg-neutral-50 py-1 font-medium"
                >
                  {TT_WEEKDAY_LABEL[w]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TT_PERIODS.map((p) => (
              <tr key={p}>
                <th className="border border-neutral-200 bg-neutral-50 py-1 font-medium text-neutral-400">
                  {p}
                </th>
                {TT_WEEKDAYS.map((w) => {
                  const slot = byCell.get(`${w}::${p}`);
                  return (
                    <td
                      key={w}
                      className="h-10 border border-neutral-200 align-middle"
                    >
                      {slot ? (
                        <TimetableCell token={token} slot={slot} />
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function TimetableCell({
  token,
  slot,
}: {
  token: string;
  slot: PublicPagePayload["timetable"][number];
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(slot.electiveMapped ?? "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (slot.isFixed) {
    return <span>{slot.subjectName}</span>;
  }
  // 선택과목 칸: 매핑값 있으면 표시, 없으면 '선택과목' + 토글.
  const label = slot.electiveMapped ?? "선택과목";

  function submit() {
    const subject = value.trim();
    if (!subject) return;
    setErr(null);
    start(async () => {
      const res = await saveElectiveAction(token, slot.weekday, slot.period, subject);
      if (res.ok) setOpen(false);
      else setErr(res.message);
    });
  }

  return (
    <div className="px-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full truncate rounded px-1 py-0.5 ${
          slot.electiveMapped
            ? "text-neutral-700"
            : "text-blue-600 underline decoration-dotted"
        }`}
        title="선택과목 지정"
      >
        {label}
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="과목명"
            className="w-full rounded border border-neutral-300 px-1 py-0.5 text-[11px]"
          />
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="w-full rounded bg-neutral-900 px-1 py-0.5 text-[11px] text-white disabled:opacity-50"
          >
            {pending ? "저장…" : "저장"}
          </button>
          {err && <p className="text-[10px] text-red-600">{err}</p>}
        </div>
      )}
    </div>
  );
}

// ── 급식(당일) ──────────────────────────────────────────────────────────────
function Meals({ meals }: { meals: PublicPagePayload["meals"] }) {
  return (
    <Card title="오늘 급식">
      {meals.length === 0 ? (
        <p className="text-sm text-neutral-400">오늘 급식 정보가 없습니다.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {meals.map((m, i) => (
            <li key={i} className="whitespace-pre-line">
              {m.menu}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── 출결 2D(성격×사유) ──────────────────────────────────────────────────────
const KIND_ROWS: [keyof PublicAttendance2D, string][] = [
  ["late", "지각"],
  ["earlyLeave", "조퇴"],
  ["absentPeriod", "결과"],
  ["absent", "결석"],
];
const REASON_COLS: [
  keyof PublicAttendance2D["late"],
  string,
][] = [
  ["accepted", "인정"],
  ["illness", "질병"],
  ["unaccepted", "미인정"],
  ["etc", "기타"],
];

function Attendance2DTable({ matrix }: { matrix: PublicAttendance2D }) {
  return (
    <Card title="출결">
      <table className="w-full border-collapse text-center text-sm">
        <thead>
          <tr>
            <th className="border border-neutral-200 bg-neutral-50 px-2 py-1" />
            {REASON_COLS.map(([, label]) => (
              <th
                key={label}
                className="border border-neutral-200 bg-neutral-50 px-2 py-1 font-medium"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {KIND_ROWS.map(([kind, kindLabel]) => (
            <tr key={kind}>
              <th className="border border-neutral-200 bg-neutral-50 px-2 py-1 font-medium text-neutral-500">
                {kindLabel}
              </th>
              {REASON_COLS.map(([reason]) => (
                <td key={reason} className="border border-neutral-200 px-2 py-1">
                  {matrix[kind][reason]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ── 상담 신청 ───────────────────────────────────────────────────────────────
function CounselSlots({
  token,
  slots,
}: {
  token: string;
  slots: PublicCounselSlot[];
}) {
  return (
    <Card title="상담 신청">
      {slots.length === 0 ? (
        <p className="text-sm text-neutral-400">신청 가능한 상담 일정이 없습니다.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {slots.map((s) => (
            <CounselSlotRow key={s.date} token={token} slot={s} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function CounselSlotRow({
  token,
  slot,
}: {
  token: string;
  slot: PublicCounselSlot;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function reserve() {
    setErr(null);
    start(async () => {
      const res = await reserveCounselAction(token, slot.date);
      if (!res.ok) setErr(res.message);
    });
  }

  return (
    <li className="flex items-center justify-between gap-2 rounded border border-neutral-100 px-3 py-2">
      <span>
        {slot.date}{" "}
        <span className="text-xs text-neutral-400">잔여 {slot.remaining}</span>
      </span>
      {slot.reserved ? (
        <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
          신청됨
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {err && <span className="text-[11px] text-red-600">{err}</span>}
          <button
            type="button"
            disabled={pending || slot.remaining <= 0}
            onClick={reserve}
            className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-50 disabled:opacity-40"
          >
            {pending ? "신청…" : "신청"}
          </button>
        </span>
      )}
    </li>
  );
}
