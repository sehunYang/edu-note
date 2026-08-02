import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  collectNudges,
  listTodayLessons,
  getMealsInRange,
  getWeeklyProgressStat,
  listHomeroomReservationsInRange,
  listTeacherNotes,
  listNoticeEvents,
  listNeisActualForDate,
  getVacationSpansInRange,
} from "@/lib/db/queries";
import { activeSemester } from "@/lib/domain/school-year";
import { isVacationEntry, isDateInVacation } from "@/lib/domain/timetable-actual";
import { NudgeBanner } from "./nudge-banner";
import { NoticeWidget } from "./today/notice-widget";
import { TodayScheduleCard } from "./today/today-schedule-card";
import { MealsWidget } from "./today/meals-widget";
import { SummaryWidget } from "./today/summary-widget";
import { kstToday, readMeals, weekRange } from "./today/today-lib";
import type { NudgeResult } from "@/lib/domain/nudge";
import { Button } from "@/app/ui/button";

export const metadata = { title: "홈" };

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
  let todayLessons: Awaited<ReturnType<typeof listTodayLessons>> = [];
  let todayMeals: ReturnType<typeof readMeals> = [];
  let progressPercent = 0;
  let unrecordedObservations = 0;
  let weeklyReservations = 0;
  let publicNotes: string[] = [];
  let upcomingNotices: Awaited<ReturnType<typeof listNoticeEvents>> = [];
  let vacationLabel: string | null = null;
  // 렌더에서도 필요(TodayScheduleCard date prop) — user 유무와 무관하게 산출.
  const { date, weekday } = kstToday();

  if (user) {
    const db = getDb();
    const now = new Date();
    const year = now.getFullYear();
    const semester = activeSemester(now);
    const { weekStart, weekEnd } = weekRange(date);

    const [
      nudgeR,
      lessonsR,
      mealsR,
      progressR,
      reservationsR,
      notesR,
      noticeR,
      neisTodayR,
      vacationSpansR,
    ] = await Promise.all([
        safe(collectNudges(db, user.id, year), EMPTY_NUDGES),
        safe(
          listTodayLessons(db, user.id, date, weekday, year, semester),
          [] as Awaited<ReturnType<typeof listTodayLessons>>,
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
        safe(
          listNeisActualForDate(db, user.id, date),
          [] as Awaited<ReturnType<typeof listNeisActualForDate>>,
        ),
        safe(
          getVacationSpansInRange(db, user.id, date, date),
          [] as Awaited<ReturnType<typeof getVacationSpansInRange>>,
        ),
      ]);

    nudges = nudgeR;
    todayLessons = lessonsR;
    todayMeals = mealsR.flatMap((m) => readMeals(m.payload));
    progressPercent = Math.round(progressR.rate * 100);
    unrecordedObservations = nudges.unrecordedObservations.length;
    weeklyReservations = reservationsR.length;
    publicNotes = notesR.filter((n) => n.targetScope === "all").map((n) => n.body);
    upcomingNotices = noticeR.filter((e) => e.date >= date).slice(0, 10);

    // 오늘 방학 여부(/today 와 동일 로직): 오늘 NEIS 실제가 있으면 그걸로(경계 정확),
    // 없으면 academic_vacations 날짜로 폴백. 홈도 오늘의 학교처럼 방학이면 수업 대신 안내.
    const neisToday = neisTodayR.filter((a) => a.subjectName.trim());
    vacationLabel =
      neisToday.length > 0
        ? neisToday.every((a) => isVacationEntry(a.subjectName))
          ? (neisToday[0]?.subjectName.trim() || "방학")
          : null
        : isDateInVacation(date, vacationSpansR)
          ? "방학"
          : null;
  }

  return (
    <>
      {/* 밀도 개선 D-10: 40px 제목 + 부제 + 로그인 이메일 줄이 세로로 쌓여
          첫 화면 100px 을 브랜딩에 썼다. 매일 여는 도구의 홈에서 앱 이름은
          이미 사이드바 최상단에 있다. 한 줄로 합치고 이메일은 로그아웃 옆
          맥락으로 옮긴다(누구로 로그인했는지는 로그아웃할 때 필요한 정보다). */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl tracking-tight">
          📆 Edu_Note
          <span className="ml-2 text-xs font-normal text-neutral-400">
            교수–수업–평가–기록 일체화
          </span>
        </h1>
        <form action="/auth/signout" method="post" className="flex items-baseline gap-2">
          <span className="text-xs text-neutral-400">{user?.email ?? "—"}</span>
          <Button className="px-3 py-1.5 text-xs text-neutral-600">
            로그아웃
          </Button>
        </form>
      </div>

      <NudgeBanner nudges={nudges} />

      {/* 오늘의 학교 벤토 — 시간표·급식·요약·공지. 데이터 실패에도 각 위젯이 graceful. */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm text-neutral-500">오늘의 학교</h2>
        <Link
          href="/today"
          className="tap-link text-xs text-neutral-500 hover:underline"
        >
          전체 보기(캘린더 등) →
        </Link>
      </div>
      {/* items-start: 그리드 기본 stretch 때문에 빈 카드가 옆 카드 높이만큼
          늘어났다(실측 "오늘 급식" 빈 카드 210px, "요약 통계" 380px 중 230px
          공백). 빈 상태가 화면을 차지하는 만큼 커지는 건 밀도가 아니라 낭비다. */}
      <section className="stagger mt-3 grid grid-cols-1 items-start gap-3 md:grid-cols-12">
        <TodayScheduleCard
          lessons={todayLessons}
          date={date}
          vacationLabel={vacationLabel}
          className="md:col-span-7"
        />
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
      <section className="stagger mt-6 grid grid-cols-1 items-start gap-3 md:grid-cols-12">
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
        {/* 연간시나리오 QC E: 사이드바에는 9개 공간이 있는데 홈 카드는 6개뿐이라
            인쇄실만 홈에서 도달할 수 없었다(모바일은 하단 탭바 "더보기"를 열어야
            나옴). 수시 원서철·학년말 마감처럼 정작 인쇄실을 제일 많이 여는 시기에
            홈에서 안 보이는 실이 하나 있는 상태였다. */}
        <DashCard
          href="/print"
          title="🖨️ 인쇄실"
          desc="학생별 점검·명렬표 출력."
          className="md:col-span-6"
        />
      </section>

      <div className="mt-10 flex items-center justify-end border-t border-neutral-100 pt-4">
        <a
          href="/api/backup"
          download
          className="shrink-0 rounded-full border border-white/25 px-3 py-1.5 text-xs text-neutral-600 hover:bg-white/10"
        >
          백업 내보내기(JSON)
        </a>
      </div>
    </>
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
      className={`rounded-lg border border-neutral-200 p-4 transition-colors hover:border-white/20 ${
        className ?? ""
      }`}
    >
      <h2 className="text-sm">{title}</h2>
      <p className="mt-0.5 text-xs text-neutral-500">{desc}</p>
    </Link>
  );
}
