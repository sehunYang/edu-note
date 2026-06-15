import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { activeSemester } from "@/lib/domain/school-year";
import {
  getTeacherTimetable,
  getUpcomingEvents,
  getMealsInRange,
  listSectionsWithProgress,
  collectNudges,
  listPendingReportTiers,
  listHomeroomUpcomingReservations,
  listTeacherNotes,
  listNoticeEvents,
} from "@/lib/db/queries";
import { TodayNudgeModal } from "./nudge-modal";
import { EventsCalendar } from "./events-calendar";
import { NoticeWidget } from "./notice-widget";

export const dynamic = "force-dynamic";

/** KST 기준 오늘(yyyy-mm-dd)과 요일(1=월..7=일). */
function kstToday(): { date: string; weekday: number } {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const date = kst.toISOString().slice(0, 10);
  const jsDay = kst.getUTCDay(); // 0=일..6=토
  return { date, weekday: jsDay === 0 ? 7 : jsDay };
}

interface MealItem {
  mealType: string;
  menu: string[];
  calInfo: string | null;
  ntrInfo: string | null;
}
function readMeals(payload: unknown): MealItem[] {
  if (payload && typeof payload === "object" && "meals" in payload) {
    const m = (payload as { meals?: unknown }).meals;
    if (Array.isArray(m)) {
      return m.map((x) => {
        const o = (x ?? {}) as Record<string, unknown>;
        return {
          mealType: typeof o.mealType === "string" ? o.mealType : "",
          menu: Array.isArray(o.menu) ? (o.menu as string[]) : [],
          calInfo: typeof o.calInfo === "string" ? o.calInfo : null,
          ntrInfo: typeof o.ntrInfo === "string" ? o.ntrInfo : null,
        };
      });
    }
  }
  return [];
}

// 교시별 표준 수업 시간(AC-7.7 시간 표기). 학교별 차이는 있으나 일반 중·고 기준.
const PERIOD_TIMES: Record<number, string> = {
  1: "09:00",
  2: "10:00",
  3: "11:00",
  4: "12:00",
  5: "13:50",
  6: "14:50",
  7: "15:50",
};

// 수업마다 다른 색(AC-7.7). 과목별로 안정적 색을 배정(neutral-friendly 팔레트).
const SLOT_COLORS = [
  "bg-rose-50 border-rose-200 text-rose-700",
  "bg-sky-50 border-sky-200 text-sky-700",
  "bg-amber-50 border-amber-200 text-amber-700",
  "bg-emerald-50 border-emerald-200 text-emerald-700",
  "bg-violet-50 border-violet-200 text-violet-700",
  "bg-cyan-50 border-cyan-200 text-cyan-700",
  "bg-orange-50 border-orange-200 text-orange-700",
  "bg-teal-50 border-teal-200 text-teal-700",
];

/**
 * 오늘의 학교 — 통합 대시보드 (계획 §4 K-1 / QC v4 US-7). 오늘 시간표(색상+시간)·
 * 급식표·학사일정 캘린더(상담 오버레이)·공지위젯·넛지(모달)·미제출 신고서·잔여차시를
 * 한 화면에 집계. 진입 시 남은 넛지가 있으면 모달로 강조한다(AC-7.1).
 */
export default async function TodayPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = new Date().getFullYear();
  const semester = activeSemester(new Date());
  const { date, weekday } = kstToday();

  const [
    allSlots,
    events,
    meals,
    sections,
    nudges,
    pendingTiers,
    counselReservations,
    teacherNotes,
    noticeEvents,
  ] = await Promise.all([
    getTeacherTimetable(db, ownerId, year, semester),
    getUpcomingEvents(db, ownerId, date, 30),
    getMealsInRange(db, ownerId, date, date),
    listSectionsWithProgress(db, ownerId, year),
    collectNudges(db, ownerId, year),
    listPendingReportTiers(db, ownerId),
    listHomeroomUpcomingReservations(db, ownerId, year, date),
    listTeacherNotes(db, ownerId),
    listNoticeEvents(db, ownerId),
  ]);

  const todaySlots = allSlots
    .filter((s) => s.weekday === weekday)
    .sort((a, b) => a.period - b.period);
  const todayMeals = meals.flatMap((m) => readMeals(m.payload));
  const tierCount = {
    total: pendingTiers.length,
    warning: pendingTiers.filter((t) => t === "warning").length,
    critical: pendingTiers.filter((t) => t === "critical").length,
  };
  const remainingTotal = sections.reduce((acc, s) => acc + s.plannedUpToBoundary, 0);

  // 과목별 안정적 색 인덱스(AC-7.7).
  const colorBySubject = new Map<string, string>();
  let colorIdx = 0;
  for (const s of todaySlots) {
    if (!colorBySubject.has(s.subjectName)) {
      colorBySubject.set(s.subjectName, SLOT_COLORS[colorIdx % SLOT_COLORS.length]);
      colorIdx += 1;
    }
  }

  // 전체 공개 한마디만 위젯에 노출(개별 대상은 학생 페이지 전용).
  const publicNotes = teacherNotes
    .filter((n) => n.targetScope === "all")
    .map((n) => n.body);
  // 7일 내 할일·공지(공지실과 동일 기준)만 위젯에 표시.
  const upcomingNotices = noticeEvents.filter((e) => e.date >= date).slice(0, 10);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <TodayNudgeModal nudges={nudges} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">오늘의 학교</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>
      <p className="mt-1 text-xs text-neutral-400">{date}</p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* 오늘 시간표 — 수업마다 색상 + 시간(AC-7.7) */}
        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-semibold text-neutral-700">오늘 시간표</h2>
          {todaySlots.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400">오늘 수업이 없거나 시간표 미동기화.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {todaySlots.map((s, i) => (
                <li
                  key={i}
                  className={`flex items-center gap-3 rounded border px-2 py-1.5 ${
                    colorBySubject.get(s.subjectName) ?? "border-neutral-200"
                  }`}
                >
                  <span className="w-16 shrink-0 text-xs opacity-70">
                    {s.period}교시
                    {PERIOD_TIMES[s.period] && (
                      <span className="ml-1">{PERIOD_TIMES[s.period]}</span>
                    )}
                  </span>
                  <span className="font-medium">
                    {s.subjectName}{" "}
                    <span className="opacity-70">{s.label}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 오늘 급식 — 표(메뉴/칼로리/영양) (AC-7.8) */}
        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-semibold text-neutral-700">오늘 급식</h2>
          {todayMeals.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400">급식 정보가 없습니다.</p>
          ) : (
            <table className="mt-2 w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className="border border-neutral-200 bg-neutral-50 px-2 py-1 font-medium">
                    메뉴
                  </th>
                  <th className="w-20 border border-neutral-200 bg-neutral-50 px-2 py-1 font-medium">
                    칼로리
                  </th>
                  <th className="w-40 border border-neutral-200 bg-neutral-50 px-2 py-1 font-medium">
                    영양
                  </th>
                </tr>
              </thead>
              <tbody>
                {todayMeals.map((m, i) => (
                  <tr key={i}>
                    <td className="border border-neutral-200 px-2 py-1 align-top whitespace-pre-line">
                      {m.menu.join("\n")}
                    </td>
                    <td className="border border-neutral-200 px-2 py-1 align-top text-neutral-600">
                      {m.calInfo ?? "-"}
                    </td>
                    <td className="border border-neutral-200 px-2 py-1 align-top whitespace-pre-line text-xs text-neutral-600">
                      {m.ntrInfo ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* 다가오는 학사일정 — 캘린더 + 전체 상담 오버레이(AC-7.9) */}
        <EventsCalendar
          events={events.map((e) => ({ date: e.date, title: e.title }))}
          counsel={counselReservations.map((c) => ({
            date: c.date,
            studentLabel: c.studentLabel,
          }))}
        />

        {/* 공지 위젯 — 한마디 스와이프 + 할일·공지(내용 포함) (AC-7.10) */}
        <NoticeWidget notes={publicNotes} events={upcomingNotices} />

        {/* 신고서 / 잔여차시 요약 */}
        <section className="rounded-lg border border-neutral-200 p-4 md:col-span-2">
          <h2 className="text-sm font-semibold text-neutral-700">신고서 · 차시 요약</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">미제출 신고서</dt>
              <dd>
                {tierCount.total}건
                {tierCount.critical > 0 && (
                  <span className="ml-1 font-semibold text-red-600">심각 {tierCount.critical}</span>
                )}
                {tierCount.warning > 0 && (
                  <span className="ml-1 text-orange-600">위험 {tierCount.warning}</span>
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">남은 차시(전 분반)</dt>
              <dd>{remainingTotal}차시</dd>
            </div>
          </dl>
          <div className="mt-3 flex gap-2 text-xs">
            <Link href="/homeroom/attendance?view=unsubmitted" className="underline text-neutral-500">
              미제출 신고서
            </Link>
            <Link href="/sessions" className="underline text-neutral-500">시수</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
