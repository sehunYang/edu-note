import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { activeSemester } from "@/lib/domain/school-year";
import {
  getTeacherTimetable,
  getMealsInRange,
  getEventsInRange,
  getVacationSpansInRange,
  listSectionsWithProgress,
  collectNudges,
  listPendingReportTiers,
  listHomeroomReservationsInRange,
  listTodayMemosInRange,
  listTeacherNotes,
  listNoticeEvents,
  listTodayLessons,
} from "@/lib/db/queries";
import { TodayNudgeModal } from "./nudge-modal";
import { NudgeBanner } from "../nudge-banner";
import { EventsCalendar } from "./events-calendar";
import { fetchGoogleEventsInRange } from "./actions";
import { getGoogleConnectionStatusAction } from "../setting/profile/google-calendar-actions";
import { NoticeWidget } from "./notice-widget";
import { TimetableWidget } from "./timetable-widget";
import { MealsWidget } from "./meals-widget";
import { TodayLessonsCard } from "./today-lessons-card";
import { kstToday, readMeals, todaySlotsFor } from "./today-lib";

export const dynamic = "force-dynamic";

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

  // 캘린더 초기 표시 월(=오늘이 속한 월) 범위. 월 네비 시엔 클라이언트가 재조회(B.3).
  const [cy, cm] = date.split("-").map(Number);
  const mm = String(cm).padStart(2, "0");
  const lastDay = new Date(cy, cm, 0).getDate();
  const monthFrom = `${cy}-${mm}-01`;
  const monthTo = `${cy}-${mm}-${String(lastDay).padStart(2, "0")}`;

  const [
    allSlots,
    monthEvents,
    meals,
    sections,
    nudges,
    pendingTiers,
    monthReservations,
    monthMemos,
    teacherNotes,
    noticeEvents,
    googleStatus,
    googleEvents,
    vacationSpans,
    todayLessons,
  ] = await Promise.all([
    getTeacherTimetable(db, ownerId, year, semester),
    getEventsInRange(db, ownerId, monthFrom, monthTo),
    getMealsInRange(db, ownerId, date, date),
    listSectionsWithProgress(db, ownerId, year),
    collectNudges(db, ownerId, year),
    listPendingReportTiers(db, ownerId),
    listHomeroomReservationsInRange(db, ownerId, year, monthFrom, monthTo),
    listTodayMemosInRange(db, ownerId, monthFrom, monthTo),
    listTeacherNotes(db, ownerId),
    listNoticeEvents(db, ownerId),
    getGoogleConnectionStatusAction(),
    fetchGoogleEventsInRange(monthFrom, monthTo),
    getVacationSpansInRange(db, ownerId, monthFrom, monthTo),
    listTodayLessons(db, ownerId, date, weekday, year, semester),
  ]);

  const todaySlots = todaySlotsFor(allSlots, weekday);
  const todayMeals = meals.flatMap((m) => readMeals(m.payload));
  const tierCount = {
    total: pendingTiers.length,
    warning: pendingTiers.filter((t) => t === "warning").length,
    critical: pendingTiers.filter((t) => t === "critical").length,
  };
  const remainingTotal = sections.reduce((acc, s) => acc + s.plannedUpToBoundary, 0);

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
        <h1 className="text-2xl font-normal tracking-tight">오늘의 학교</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>
      <p className="mt-1 text-xs text-neutral-400">{date}</p>

      {/* QC v6 ⑥(AC-6.3): 메인처럼 페이지 최상단에 '오늘 해야 할 일'을 상시 표시
          (기존 모달과 별개로 유지 — 모달을 닫아도 배너는 남는다). */}
      <NudgeBanner nudges={nudges} />

      <div className="stagger mt-6 grid gap-6 md:grid-cols-2">
        {/* 오늘 수업 — 차시 체크(진척도 실반영, QC v7 comp1 AC-1.1~1.4) */}
        <TodayLessonsCard lessons={todayLessons} date={date} className="md:col-span-2" />

        {/* 오늘 시간표 — 수업마다 색상 + 시간(AC-7.7) */}
        <TimetableWidget todaySlots={todaySlots} />

        {/* 오늘 급식 — 표(메뉴/칼로리/영양) (AC-7.8) */}
        <MealsWidget todayMeals={todayMeals} />

        {/* 학사일정 캘린더 — 월 범위 조회 + 상담 오버레이 + 날짜 메모(B.3/B.4) */}
        <EventsCalendar
          events={monthEvents.map((e) => ({
            date: e.date,
            title: e.title,
            eventKind: e.eventKind,
          }))}
          counsel={monthReservations.map((c) => ({
            date: c.date,
            studentLabel: c.studentLabel,
          }))}
          memos={monthMemos}
          googleEvents={googleEvents}
          googleSyncError={googleStatus.connected ? googleStatus.lastError : null}
          vacationSpans={vacationSpans}
        />

        {/* 공지 위젯 — 한마디 스와이프 + 할일·공지(내용 포함) (AC-7.10) */}
        <NoticeWidget notes={publicNotes} events={upcomingNotices} />

        {/* 신고서 / 잔여차시 요약 */}
        <section className="rounded-lg border border-neutral-200 p-4 md:col-span-2">
          <h2 className="text-sm font-normal text-neutral-700">신고서 · 차시 요약</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">미제출 신고서</dt>
              <dd>
                {tierCount.total}건
                {tierCount.critical > 0 && (
                  <span className="ml-1 font-normal text-red-600">심각 {tierCount.critical}</span>
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
