import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { collectNudges } from "@/lib/db/queries";
import { NudgeBanner } from "./nudge-banner";
import type { NudgeResult } from "@/lib/domain/nudge";

export const dynamic = "force-dynamic";

const EMPTY_NUDGES: NudgeResult = {
  unrecordedObservations: [],
  behaviorNotes: null,
  pendingReports: null,
  pendingCounselLogs: [],
  hasAny: false,
};

/** 홈 대시보드 (미들웨어가 보호 — 허용 계정만 도달). */
export default async function Home() {
  const user = await getCurrentUser();

  // 넛지 수집(데이터 미구성 시에도 홈은 깨지지 않도록 graceful).
  // 추천 학생명은 넛지 결과(suggestedStudentName)에 포함되어 별도 조회 불필요.
  let nudges: NudgeResult = EMPTY_NUDGES;
  if (user) {
    try {
      const db = getDb();
      const year = new Date().getFullYear();
      nudges = await collectNudges(db, user.id, year);
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

      <NudgeBanner nudges={nudges} />

      {/* QC v6 ⑦ — 대표 8개 컴포넌트만 지정 순서로 배치(이모지 부여). 그 외 기능은
          각 대표 컴포넌트 하위로 접근. */}
      <section className="mt-10 grid gap-3">
        <DashCard
          href="/setting"
          title="⚙️ 세팅실"
          desc="학년도·교사·학사일정·학생·수업을 순서대로 설정합니다(기초 환경)."
        />
        <DashCard
          href="/today"
          title="🗓️ 오늘의 학교"
          desc="오늘 시간표·급식·학사일정과 해야 할 일(넛지)을 한눈에 봅니다."
        />
        <DashCard
          href="/classroom"
          title="🏫 교실"
          desc="수업 계획·진척도·성적·교과 관찰·학생 보고서·세특을 한곳에서 관리합니다."
        />
        <DashCard
          href="/homeroom"
          title="🏠 담임 교실"
          desc="담임반 학생의 자율·진로활동·출결·행특·상담·공지·생기부를 한곳에서 관리합니다."
        />
        <DashCard
          href="/staffroom"
          title="🗂️ 교무실"
          desc="업무 to-do(진척)와 영역별 예산·집행률을 관리합니다."
        />
        <DashCard
          href="/clubroom"
          title="🎬 동아리실"
          desc="동아리 개설·부원 배정·활동 계획·활동 입력·생기부 작성을 한곳에서 관리합니다."
        />
        <DashCard
          href="/stats"
          title="📊 통계실"
          desc="기록 현황을 한눈에 집계합니다(성적 통계는 준비중)."
        />
        <DashCard
          href="/print"
          title="🖨️ 인쇄실"
          desc="학생 명렬표를 인쇄하거나 PDF로 저장합니다."
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
