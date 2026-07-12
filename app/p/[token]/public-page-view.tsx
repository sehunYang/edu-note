"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type {
  PublicPagePayload,
  PublicAttendance2D,
  PublicAttendanceRecord,
  PublicCounselSlot,
  PublicVacationSpan,
  PublicNotice,
} from "@/lib/public";
import {
  saveElectiveAction,
  reserveCounselAction,
  requestCounselCancelAction,
  saveStudentMemoAction,
  deleteStudentMemoAction,
  markNoticeReadAction,
} from "./actions";
import type { PublicStudentMemo } from "@/lib/public";
import type { EventKind } from "@/lib/domain/calendar-keywords";
import {
  EVENT_KIND_CHIP,
  VACATION_BAND_BG,
} from "@/lib/domain/event-kind-display";
import { Button } from "@/app/ui/button";

/** 캘린더 칸/모달에 표시할 학사일정 항목(제목 + 종류). 상담 예약은 "counsel"(green), 미분류는 null. */
interface DayEvent {
  title: string;
  eventKind: EventKind | "counsel" | null;
}

/**
 * 학사일정 칩 색상(오늘의학교 캘린더와 동일 팔레트). nullClass 로 호출부별
 * 기존 기본 배경(캘린더 칸 vs 모달 목록)을 그대로 유지한다.
 */
function eventChipClass(
  eventKind: EventKind | "counsel" | null,
  nullClass: string = "bg-neutral-200 text-neutral-700",
): string {
  if (eventKind === "counsel") return "bg-green-100 text-green-700";
  if (eventKind === null) return nullClass;
  return EVENT_KIND_CHIP[eventKind];
}

/** KST(UTC+9) 기준 오늘 날짜(YYYY-MM-DD). 12시간 고정이 아닌 날짜 경계로 산출. */
function kstToday(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
/** KST 기준 오늘의 요일(1=월 .. 7=일). 시간표 열 강조용. */
function kstWeekday(now: Date = new Date()): number {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dow = kst.getUTCDay(); // 0=일 .. 6=토
  return dow === 0 ? 7 : dow;
}
/** KST 기준 이번 주(월요일 시작) 월~금 날짜 "M/D" 맵. 시간표 요일 헤더 표기용. */
function kstWeekDates(now: Date = new Date()): Record<number, string> {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const isoDow = kstWeekday(now); // 1=월 .. 7=일
  const monday = new Date(kst.getTime() - (isoDow - 1) * 24 * 60 * 60 * 1000);
  const map: Record<number, string> = {};
  for (let w = 1; w <= 5; w++) {
    const d = new Date(monday.getTime() + (w - 1) * 24 * 60 * 60 * 1000);
    map[w] = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  }
  return map;
}

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
        <h1 className="text-2xl font-normal tracking-tight">
          {payload.studentName ? `${payload.studentName} 학생 안내 페이지` : "학생 안내 페이지"}
        </h1>
        <p className="mt-1 text-xs text-neutral-400">
          이 페이지의 링크는 외부에 공유하지 마세요.
        </p>
      </header>

      <Notices
        token={token}
        notices={payload.notices}
        commonNotice={payload.commonNotice}
      />
      <IndividualNotices token={token} notices={payload.individualNotices} />
      <CalendarSection
        token={token}
        todos={payload.weekTodos}
        memos={payload.studentMemos}
        vacationSpans={payload.vacationSpans}
      />
      <Timetable token={token} slots={payload.timetable} />
      <Meals meals={payload.meals} />
      <Attendance2DTable
        matrix={payload.attendance2D}
        records={payload.attendanceDetail}
      />
      <CounselSlots token={token} slots={payload.counselSlots} />

      {payload.personalMessage && (
        <section className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h2 className="text-sm font-normal text-blue-600">개별 메시지</h2>
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
      <h2 className="text-sm font-normal text-neutral-700">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

// ── 교사 한마디/개별 공지 게시일 메타(날짜 + New 배지) ──────────────────────
/**
 * 공지 게시일 라벨(KST "M월 D일"). postedAt = teacher_notes.updated_at → 수정 시 수정일 표시.
 * postedAt(ISO) 이 없거나 파싱 불가하면 null(레거시/누락 안전).
 */
function noticeDateLabel(postedAt: string | null): string | null {
  if (!postedAt) return null;
  const t = new Date(postedAt);
  if (Number.isNaN(t.getTime())) return null;
  const kst = new Date(t.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
}

/**
 * 공지 게시일 + New 배지(교사 한마디·개별 공지 공용). New 는 이 학생이 현재 게시본을
 * 아직 안 읽었을 때만(unread) 표시 — 열람하면 다음 방문부터 사라지고, 교사가 수정하면 재노출.
 */
function NoticeMeta({
  postedAt,
  unread,
}: {
  postedAt: string | null;
  unread: boolean;
}) {
  const label = noticeDateLabel(postedAt);
  if (!label && !unread) return null;
  return (
    <span className="flex items-center gap-1.5">
      {unread && (
        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-normal leading-none text-white">
          New
        </span>
      )}
      {label && <span className="text-[11px] text-neutral-400">{label}</span>}
    </span>
  );
}

/**
 * 현재 보고 있는 공지를 '읽음' 처리(v12). 미읽음(unread)이고 id 가 있는 공지가 화면에
 * 나타나면 토큰 스코프 액션으로 읽음 기록(fire-and-forget — revalidate 없이 다음 방문에 반영).
 * 세션 내 중복 호출은 ref 로 방지.
 */
function useMarkNoticeReadOnView(
  token: string,
  item: PublicNotice | undefined,
) {
  const firedRef = useRef<Set<string>>(new Set());
  const id = item?.id ?? null;
  const unread = item?.unread ?? false;
  useEffect(() => {
    if (!id || !unread || firedRef.current.has(id)) return;
    firedRef.current.add(id);
    void markNoticeReadAction(token, id);
  }, [token, id, unread]);
}

// ── 다중 교사 한마디(스와이프) ──────────────────────────────────────────────
function Notices({
  token,
  notices,
  commonNotice,
}: {
  token: string;
  notices: PublicNotice[];
  commonNotice: string | null;
}) {
  // notices 우선, 비면 commonNotice 단일 폴백(레거시 — 게시일·New 없음).
  const items: PublicNotice[] =
    notices.length > 0
      ? notices
      : commonNotice
        ? [{ id: null, body: commonNotice, postedAt: null, unread: false }]
        : [];
  const [idx, setIdx] = useState(0);
  const cur = items.length > 0 ? Math.min(idx, items.length - 1) : 0;
  const item = items[cur];
  useMarkNoticeReadOnView(token, item);
  if (items.length === 0) return null;
  return (
    <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-normal text-neutral-500">교사 한마디</h2>
        <div className="flex items-center gap-2">
          <NoticeMeta postedAt={item.postedAt} unread={item.unread} />
          {items.length > 1 && (
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Button
                type="button"
                onClick={() => setIdx((cur - 1 + items.length) % items.length)}
                className="px-2 py-0.5"
              >
                ‹
              </Button>
              <span>
                {cur + 1}/{items.length}
              </span>
              <Button
                type="button"
                onClick={() => setIdx((cur + 1) % items.length)}
                className="px-2 py-0.5"
              >
                ›
              </Button>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm">{item.body}</p>
    </section>
  );
}

// ── 개별 공지(이 학생 대상 — 전체 공지처럼 한 건씩 스와이프 분리, QC v6 ④) ────
function IndividualNotices({
  token,
  notices,
}: {
  token: string;
  notices: PublicNotice[];
}) {
  const [idx, setIdx] = useState(0);
  const cur = notices.length > 0 ? Math.min(idx, notices.length - 1) : 0;
  const item = notices[cur];
  useMarkNoticeReadOnView(token, item);
  if (notices.length === 0) return null;
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-normal text-amber-600">개별 공지</h2>
        <div className="flex items-center gap-2">
          <NoticeMeta postedAt={item.postedAt} unread={item.unread} />
          {notices.length > 1 && (
            <div className="flex items-center gap-2 text-xs text-amber-500">
              <button
                type="button"
                onClick={() => setIdx((cur - 1 + notices.length) % notices.length)}
                className="rounded border border-amber-300 px-2 py-0.5 hover:bg-white/10"
              >
                ‹
              </button>
              <span>
                {cur + 1}/{notices.length}
              </span>
              <button
                type="button"
                onClick={() => setIdx((cur + 1) % notices.length)}
                className="rounded border border-amber-300 px-2 py-0.5 hover:bg-white/10"
              >
                ›
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm">{item.body}</p>
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
  // QC v6 ⑤: 날짜 클릭 → 모달(그날 학사일정·개인 메모 CRUD).
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
          className="px-2 py-0.5"
        >
          ‹
        </Button>
        <span className="font-normal">
          {month.year}년 {month.month + 1}월
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
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => setSelectedDate(dateStr)}
              className={`min-h-[3.25rem] rounded border p-1 text-left transition hover:border-blue-400 ${cellBg}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-neutral-500">{d}</span>
                {dayMemos.length > 0 && (
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                )}
              </div>
              {events.map((e, j) => (
                <div
                  key={j}
                  title={e.title}
                  className={`mt-0.5 truncate rounded px-1 text-[10px] ${eventChipClass(e.eventKind)}`}
                >
                  {e.title}
                </div>
              ))}
            </button>
          );
        })}
      </div>
      {selectedDate && (
        <DayDetailModal
          token={token}
          date={selectedDate}
          events={byDate.get(selectedDate) ?? []}
          memos={memosByDate.get(selectedDate) ?? []}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </Card>
  );
}

/**
 * 학생 캘린더 날짜 상세 모달 (QC v6 ⑤). 그날 학사일정(읽기) + 개인 메모/일정 CRUD.
 * 교사 오늘의학교 DayDetailModal 과 동일 UX. 개인 메모는 본인 토큰 스코프 서버액션으로만
 * 쓰며, 타학생·교사에게 절대 보이지 않는다.
 */
function DayDetailModal({
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl bg-card p-5 border border-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-normal text-neutral-800">{date}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-white/10"
            aria-label="닫기"
          >
            ✕
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
                        className="px-2 py-0.5 text-xs"
                      >
                        저장
                      </Button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded border border-neutral-300 px-2 py-0.5 text-xs"
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
                        className="text-xs text-neutral-500 hover:underline"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => remove(m.id)}
                        className="text-xs text-red-500 hover:underline disabled:opacity-50"
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
            className="w-full py-1.5 text-sm"
          >
            일정 추가하기
          </Button>
        </div>
      </div>
    </div>
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
  // 오늘 요일 열 강조(KST 날짜 경계). 토·일이면 강조 없음(1~5 만 표시).
  const todayWeekday = useMemo(() => kstWeekday(), []);
  // 요일 헤더에 이번 주(월요일 시작) 날짜 병기 — 접속 시점 기준 자동 최신화.
  const weekDates = useMemo(() => kstWeekDates(), []);

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
                  className={`border border-neutral-200 py-1 font-normal ${
                    w === todayWeekday
                      ? "bg-blue-100 text-blue-700"
                      : "bg-neutral-50"
                  }`}
                >
                  <div>
                    {TT_WEEKDAY_LABEL[w]}
                    {w === todayWeekday && (
                      <span className="ml-1 rounded bg-blue-600 px-1 text-[9px] text-white align-middle">
                        오늘
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-[10px] ${
                      w === todayWeekday ? "text-blue-500" : "text-neutral-400"
                    }`}
                  >
                    {weekDates[w]}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TT_PERIODS.map((p) => (
              <tr key={p}>
                <th className="border border-neutral-200 bg-neutral-50 py-1 font-normal text-neutral-400">
                  {p}
                </th>
                {TT_WEEKDAYS.map((w) => {
                  const slot = byCell.get(`${w}::${p}`);
                  return (
                    <td
                      key={w}
                      className={`h-10 border border-neutral-200 align-middle ${
                        w === todayWeekday ? "bg-blue-50" : ""
                      }`}
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
    // 공통과목: 짙은 회색 텍스트
    return <span className="text-neutral-700">{slot.subjectName}</span>;
  }
  // 선택과목 칸: 매핑값 있으면 표시, 없으면 '선택과목' + 토글.
  // AC-6.1: 선택과목은 항상 파란 계열(공통과목 text-neutral-700 과 시각적 구분).
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
            ? "text-blue-700"
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
          <Button
            type="button"
            loading={pending}
            onClick={submit}
            className="w-full px-1 py-0.5 text-[11px]"
          >
            저장
          </Button>
          {err && <p className="text-[10px] text-red-600">{err}</p>}
        </div>
      )}
    </div>
  );
}

// ── 급식(당일) — 메뉴/영양/칼로리 표 (QC v6 ⑤: 영양 중앙·칼로리 마지막 열) ────
function Meals({ meals }: { meals: PublicPagePayload["meals"] }) {
  return (
    <Card title="오늘 급식">
      {meals.length === 0 ? (
        <p className="text-sm text-neutral-400">오늘 급식 정보가 없습니다.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className="border border-neutral-200 bg-neutral-50 px-2 py-1 font-normal">
                메뉴
              </th>
              <th className="w-40 border border-neutral-200 bg-neutral-50 px-2 py-1 font-normal">
                영양
              </th>
              <th className="w-20 border border-neutral-200 bg-neutral-50 px-2 py-1 font-normal">
                칼로리
              </th>
            </tr>
          </thead>
          <tbody>
            {meals.map((m, i) => (
              <tr key={i}>
                <td className="border border-neutral-200 px-2 py-1 align-top whitespace-pre-line">
                  {m.menu}
                </td>
                <td className="border border-neutral-200 px-2 py-1 align-top whitespace-pre-line text-xs text-neutral-600">
                  {m.ntrInfo ?? "-"}
                </td>
                <td className="border border-neutral-200 px-2 py-1 align-top text-neutral-600">
                  {m.calInfo ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
