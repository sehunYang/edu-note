import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { collectNudges, listStudents } from "@/lib/db/queries";
import { NudgeBanner } from "./nudge-banner";
import type { NudgeResult } from "@/lib/domain/nudge";

export const dynamic = "force-dynamic";

const EMPTY_NUDGES: NudgeResult = {
  unrecordedObservation: null,
  behaviorNotes: null,
  pendingReports: null,
  hasAny: false,
};

/** 홈 대시보드 (미들웨어가 보호 — 허용 계정만 도달). */
export default async function Home() {
  const user = await getCurrentUser();

  // 넛지 수집(데이터 미구성 시에도 홈은 깨지지 않도록 graceful).
  let nudges: NudgeResult = EMPTY_NUDGES;
  let suggestedLabel: string | null = null;
  if (user) {
    try {
      const db = getDb();
      const year = new Date().getFullYear();
      nudges = await collectNudges(db, user.id, year);
      const sid = nudges.unrecordedObservation?.suggestedStudentId;
      if (sid) {
        const students = await listStudents(db, user.id, year);
        const s = students.find((x) => x.id === sid);
        suggestedLabel = s ? `${s.sid} ${s.name}` : null;
      }
    } catch {
      nudges = EMPTY_NUDGES;
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">📆 Edu_Note</h1>
          <p className="mt-1 text-sm text-neutral-500">
            교수–수업–평가–기록 일체화 플랫폼
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50">
            로그아웃
          </button>
        </form>
      </div>

      <p className="mt-2 text-xs text-neutral-400">
        로그인: {user?.email ?? "—"}
      </p>

      <NudgeBanner nudges={nudges} suggestedStudentLabel={suggestedLabel} />

      <section className="mt-10 grid gap-3">
        <DashCard
          href="/setting"
          title="⚙️ 세팅실"
          desc="학년도·교사·학사일정·학생·수업을 순서대로 설정합니다(기초 환경)."
        />
        <DashCard
          href="/classroom"
          title="🏫 교실"
          desc="수업 계획·진척도·성적·교과 관찰·학생 보고서·세특을 한곳에서 관리합니다."
        />
        <DashCard
          href="/today"
          title="오늘의 학교"
          desc="오늘 시간표·급식·학사일정과 해야 할 일(넛지)을 한눈에 봅니다."
        />
        <DashCard
          href="/setting/students"
          title="학생 명단"
          desc="CSV로 학생 명단을 올리고, 학생별 공개 링크를 발급합니다."
        />
        <DashCard
          href="/setting/courses"
          title="시간표 · 수업"
          desc="컴시간알리미에서 본인 시간표를 동기화하고 수업을 관리합니다."
        />
        <DashCard
          href="/sessions"
          title="시수 관리"
          desc="시험 날짜를 정하고 과목별 남은 차시를 계산·관리합니다."
        />
        <DashCard
          href="/setting/calendar"
          title="학사일정 · 급식"
          desc="NEIS에서 학사일정(수업일)과 급식을 동기화합니다."
        />
        <DashCard
          href="/activities"
          title="활동 기입"
          desc="학생별 자율·진로 활동을 기입합니다(자율+진로는 한 곳으로 자동 배치)."
        />
        <DashCard
          href="/classroom/observations"
          title="교과 관찰 기록"
          desc="교과 관찰기록을 분반·날짜와 함께 남깁니다(교실로 이동)."
        />
        <DashCard
          href="/homeroom/behavior"
          title="행동특성 기록"
          desc="담임반 학생의 행동발달 및 특기사항을 누가기록합니다."
        />
        <DashCard
          href="/attendance"
          title="출결 관리"
          desc="사유×성격으로 출결을 기록하고 신고서 필요/제출을 관리합니다."
        />
        <DashCard
          href="/club"
          title="동아리"
          desc="동아리를 만들고 부원과 희망진로를 관리합니다."
        />
        <DashCard
          href="/counsel"
          title="상담"
          desc="학생·학부모 상담일지를 기록합니다(AI 분석은 준비중)."
        />
        <DashCard
          href="/staffroom"
          title="교무실"
          desc="업무 to-do(진척)와 영역별 예산·집행률을 관리합니다."
        />
        <DashCard
          href="/stats"
          title="통계실"
          desc="기록 현황을 한눈에 집계합니다(성적 통계는 준비중)."
        />
        <DashCard
          href="/print"
          title="인쇄실"
          desc="학생 명렬표를 인쇄하거나 PDF로 저장합니다."
        />
        <DashCard
          href="/notice"
          title="공지실"
          desc="공개 페이지의 교사 한마디·이번 주 할 일을 설정합니다."
        />
      </section>

      <div className="mt-10 flex items-center justify-between border-t border-neutral-100 pt-4">
        <p className="text-xs text-neutral-400">
          AI 세특은 코워크(Claude Code) 내보내기 워크플로로 진행합니다.
        </p>
        <a
          href="/api/backup"
          download
          className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
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
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-neutral-200 p-5 transition hover:border-neutral-400 hover:shadow-sm"
    >
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-neutral-500">{desc}</p>
    </Link>
  );
}
