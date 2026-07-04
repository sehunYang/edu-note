import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  collectNudges,
  getTeacherTimetable,
  getMealsInRange,
  getWeeklyProgressStat,
  listHomeroomReservationsInRange,
  listTeacherNotes,
  listNoticeEvents,
} from "@/lib/db/queries";
import { activeSemester } from "@/lib/domain/school-year";
import { NudgeBanner } from "./nudge-banner";
import { NoticeWidget } from "./today/notice-widget";
import { TimetableWidget } from "./today/timetable-widget";
import { MealsWidget } from "./today/meals-widget";
import { SummaryWidget } from "./today/summary-widget";
import { kstToday, readMeals, todaySlotsFor, weekRange } from "./today/today-lib";
import type { NudgeResult } from "@/lib/domain/nudge";
import { Button } from "@/app/ui/button";

export const dynamic = "force-dynamic";

const EMPTY_NUDGES: NudgeResult = {
  unrecordedObservations: [],
  behaviorNotes: null,
  pendingReports: null,
  pendingCounselLogs: [],
  hasAny: false,
};

/** 실패해도 홈이 깨지지 않도록 각 조회를 개별 fallback으로 감싼다. */
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

/** 홈 대시보드 — 오늘의 학교 위젯 + 실 바로가기를 벤토로 배치(미들웨어가 보호). */
export default async function Home() {
  const user = await getCurrentUser();

  let nudges: NudgeResult = EMPTY_NUDGES;
  let todaySlots: Awaited<ReturnType<typeof getTeacherTimetable>> = [];
  let todayMeals: ReturnType<typeof readMeals> = [];
  let progressPercent = 0;
  let unrecordedObservations = 0;
  let weeklyReservations = 0;
  let publicNotes: string[] = [];
  let upcomingNotices: Awaited<ReturnType<typeof listNoticeEvents>> = [];

  if (user) {
    const db = getDb();
    const now = new Date();
    const year = now.getFullYear();
    const semester = activeSemester(now);
    const { date, weekday } = kstToday();
    const { weekStart, weekEnd } = weekRange(date);

    const [nudgeR, slotsR, mealsR, progressR, reservationsR, notesR, noticeR] =
      await Promise.all([
        safe(collectNudges(db, user.id, year), EMPTY_NUDGES),
        safe(
          getTeacherTimetable(db, user.id, year, semester),
          [] as Awaited<ReturnType<typeof getTeacherTimetable>>,
        ),
        safe(
          getMealsInRange(db, user.id, date, date),
          [] as Awaited<ReturnType<typeof getMealsInRange>>,
        ),
        safe(getWeeklyProgressStat(db, user.id, year, semester), {
          planned: 0,
          done: 0,
          rate: 0,
        }),
        safe(
          listHomeroomReservationsInRange(db, user.id, year, weekStart, weekEnd),
          [] as Awaited<ReturnType<typeof listHomeroomReservationsInRange>>,
        ),
        safe(
          listTeacherNotes(db, user.id),
          [] as Awaited<ReturnType<typeof listTeacherNotes>>,
        ),
        safe(
          listNoticeEvents(db, user.id),
          [] as Awaited<ReturnType<typeof listNoticeEvents>>,
        ),
      ]);

    nudges = nudgeR;
    todaySlots = todaySlotsFor(slotsR, weekday);
    todayMeals = mealsR.flatMap((m) => readMeals(m.payload));
    progressPercent = Math.round(progressR.rate * 100);
    unrecordedObservations = nudges.unrecordedObservations.length;
    weeklyReservations = reservationsR.length;
    publicNotes = notesR.filter((n) => n.targetScope === "all").map((n) => n.body);
    upcomingNotices = noticeR.filter((e) => e.date >= date).slice(0, 10);
  }

  return (
    <main className="hero-glow mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-normal tracking-tight">📆 Edu_Note</h1>
          <p className="mt-1 text-sm text-neutral-500">
            교수–수업–평가–기록 일체화 플랫폼
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <Button className="px-3 py-1.5 text-xs text-neutral-600">
            로그아웃
          </Button>
        </form>
      </div>

      <p className="mt-2 text-xs text-neutral-400">
        로그인: {user?.email ?? "—"}
      </p>

      <NudgeBanner nudges={nudges} />

      {/* 오늘의 학교 벤토 — 시간표·급식·요약·공지. 데이터 실패에도 각 위젯이 graceful. */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-normal text-neutral-500">오늘의 학교</h2>
        <Link href="/today" className="text-xs text-neutral-500 hover:underline">
          전체 보기(캘린더 등) →
        </Link>
      </div>
      <section className="stagger mt-3 grid grid-cols-1 gap-3 md:grid-cols-12">
        <TimetableWidget todaySlots={todaySlots} className="md:col-span-7" />
        <MealsWidget todayMeals={todayMeals} className="md:col-span-5" />
        <SummaryWidget
          progressPercent={progressPercent}
          unrecordedObservations={unrecordedObservations}
          weeklyReservations={weeklyReservations}
          className="md:col-span-5"
        />
        <div className="md:col-span-7">
          <NoticeWidget notes={publicNotes} events={upcomingNotices} />
        </div>
      </section>

      {/* 실 바로가기 — 사용빈도순 크기 차등(교실·담임 대, 나머지 소). */}
      <section className="stagger mt-6 grid grid-cols-1 gap-3 md:grid-cols-12">
        <DashCard
          href="/classroom"
          title="🏫 교실"
          desc="수업 계획·진척도·성적·교과 관찰·학생 보고서·세특."
          className="md:col-span-6"
        />
        <DashCard
          href="/homeroom"
          title="🏠 담임 교실"
          desc="자율·진로활동·출결·행특·상담·공지·생기부."
          className="md:col-span-6"
        />
        <DashCard
          href="/clubroom"
          title="🎬 동아리실"
          desc="개설·부원·활동·생기부."
          className="md:col-span-3"
        />
        <DashCard
          href="/setting"
          title="⚙️ 세팅실"
          desc="학년도·교사·학사일정·학생·수업."
          className="md:col-span-3"
        />
        <DashCard
          href="/stats"
          title="📊 통계실"
          desc="기록 현황 집계."
          className="md:col-span-3"
        />
        <DashCard
          href="/staffroom"
          title="🗂️ 교무실"
          desc="업무 to-do·예산."
          className="md:col-span-3"
        />
      </section>

      <div className="mt-10 flex items-center justify-between border-t border-neutral-100 pt-4">
        <p className="text-xs text-neutral-400">
          AI 세특은 코워크(Claude Code) 내보내기 워크플로로 진행합니다.
        </p>
        <a
          href="/api/backup"
          download
          className="shrink-0 rounded-full border border-white/25 px-3 py-1.5 text-xs text-neutral-600 hover:bg-white/10"
        >
          백업 내보내기(JSON)
        </a>
      </div>
    </main>
  );
}

function DashCard({
  href,
  title,
  desc,
  className,
}: {
  href: string;
  title: string;
  desc: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border border-neutral-200 p-5 transition-colors hover:border-white/20 ${
        className ?? ""
      }`}
    >
      <h2 className="font-normal">{title}</h2>
      <p className="mt-1 text-sm text-neutral-500">{desc}</p>
    </Link>
  );
}
