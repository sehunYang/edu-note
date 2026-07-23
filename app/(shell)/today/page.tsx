import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { activeSemester } from "@/lib/domain/school-year";
import {
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
  listHomeroomStudents,
  listAttendanceByDate,
  listNeisActualForRange,
  getTeacherTimetable,
  getTeacherProfile,
} from "@/lib/db/queries";
import {
  classifyWeeklyOverlay,
  learnSubjectAliases,
  isVacationEntry,
  type OverlayResult,
} from "@/lib/domain/timetable-actual";
import { TodayNudgeModal } from "./nudge-modal";
import { NudgeBanner } from "../nudge-banner";
import { EventsCalendar } from "./events-calendar";
import { fetchGoogleEventsInRange } from "./actions";
import { getGoogleConnectionStatusAction } from "../setting/profile/google-calendar-actions";
import { NoticeWidget } from "./notice-widget";
import { MealsWidget } from "./meals-widget";
import { TodayScheduleCard } from "./today-schedule-card";
import { TodayAttendanceCard } from "./today-attendance-card";
import { kstToday, readMeals, weekRange } from "./today-lib";

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

  // NEIS 이번 주(월~금) 범위 + 별칭 학습용 누적 범위(8주 전부터).
  const { weekStart, weekEnd } = weekRange(date);
  const aliasFrom = new Date(`${weekStart}T00:00:00Z`);
  aliasFrom.setUTCDate(aliasFrom.getUTCDate() - 56);
  const aliasFromStr = aliasFrom.toISOString().slice(0, 10);

  const [
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
    homeroomStudents,
    attendanceToday,
    neisActualRange,
    teacherWeekStd,
    teacherProfile,
  ] = await Promise.all([
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
    listHomeroomStudents(db, ownerId, year),
    listAttendanceByDate(db, ownerId, date),
    listNeisActualForRange(db, ownerId, aliasFromStr, weekEnd),
    getTeacherTimetable(db, ownerId, year, semester),
    getTeacherProfile(db, ownerId),
  ]);

  // NEIS 이번 주 실제 ↔ 표준을 **반별로** 비교해 오늘의 변화(특별활동·교시교환·대체)를 분류한다.
  // 교환은 같은 반 내 판정이라 반(label)별로 classifyWeeklyOverlay 를 돌린다.
  // 별칭은 누적(8주) 실제로 학습하고, 분류·표시는 이번 주만 대상으로 한다.
  const isodow = (d: string): number => {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay(); // 0=일..6=토
    return wd === 0 ? 7 : wd;
  };
  // 반별 표준 주간 슬롯: label → [{weekday, period, subject}]
  const stdByClass = new Map<string, { weekday: number; period: number; subject: string }[]>();
  for (const s of teacherWeekStd) {
    const arr = stdByClass.get(s.label) ?? [];
    arr.push({ weekday: s.weekday, period: s.period, subject: s.subjectName });
    stdByClass.set(s.label, arr);
  }
  // 반별 NEIS: 누적(별칭 학습)과 이번 주(분류 대상)를 각각 요일 매핑해 모은다.
  const actHistByClass = new Map<string, { weekday: number; period: number; subject: string }[]>();
  const actWeekByClass = new Map<string, { weekday: number; period: number; subject: string }[]>();
  for (const a of neisActualRange) {
    const label = `${a.grade}-${a.classNo}`;
    const slot = { weekday: isodow(a.date), period: a.period, subject: a.subjectName };
    (actHistByClass.get(label) ?? actHistByClass.set(label, []).get(label)!).push(slot);
    if (a.date >= weekStart && a.date <= weekEnd) {
      (actWeekByClass.get(label) ?? actWeekByClass.set(label, []).get(label)!).push(slot);
    }
  }
  // 오늘(weekday) 변화만 추출: "label::period" → OverlayResult.
  const overlayByClassPeriod: Record<string, OverlayResult> = {};
  for (const [label, std] of stdByClass) {
    const alias = learnSubjectAliases(std, actHistByClass.get(label) ?? []);
    const overlay = classifyWeeklyOverlay(std, actWeekByClass.get(label) ?? [], alias);
    for (const [k, res] of overlay) {
      const [wd, p] = k.split("::").map(Number);
      if (wd === weekday) overlayByClassPeriod[`${label}::${p}`] = res;
    }
  }

  // 오늘 방학 여부: 오늘(date) NEIS 실제가 하나라도 있고 **전부** 방학이면 방학.
  // academic_vacations(교사 입력)는 방학식날 경계가 부정확해 NEIS 실제로 판정한다.
  // 빈 subjectName 은 학생 vacationWeekdays 와 동일하게 판정에서 제외(정책 일치).
  const todayActual = neisActualRange.filter(
    (a) => a.date === date && a.subjectName.trim(),
  );
  const vacationLabel =
    todayActual.length > 0 && todayActual.every((a) => isVacationEntry(a.subjectName))
      ? (todayActual[0]?.subjectName.trim() || "방학")
      : null;

  // 담임반 명단으로 오늘 출결을 필터(공유 쿼리는 owner 전체 반환 — 룸 page.tsx와 동일 패턴).
  const homeroomIds = new Set(homeroomStudents.map((s) => s.id));
  const todayAttendance = attendanceToday.filter((r) => homeroomIds.has(r.studentYearId));

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
        {/* 오늘 시간표 통합 카드 — 교시·시간·과목색(시간표) + 차시 체크·내용(수업)
            을 한 카드로(today-schedule-merge). 진척도 실반영은 기존과 동일. */}
        <TodayScheduleCard
          lessons={todayLessons}
          date={date}
          vacationLabel={vacationLabel}
          overlayByClassPeriod={overlayByClassPeriod}
          neisSyncedAt={
            teacherProfile?.lastNeisTimetableSyncAt
              ? teacherProfile.lastNeisTimetableSyncAt.toISOString()
              : null
          }
          className="md:col-span-2"
        />

        {/* 오늘 출결 — 담임반 빠른 입력(학생 선택→사유→즉시 저장). 홈룸 0명이면 미렌더. */}
        <TodayAttendanceCard
          students={homeroomStudents}
          date={date}
          records={todayAttendance}
        />

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
