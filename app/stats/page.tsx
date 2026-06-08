import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { getOwnerStats } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/**
 * 통계실 (계획 §4 Phase2-K-2). 기록 현황 집계 대시보드.
 * 성적(grades)은 Phase 1 목업 → '준비중'으로 표기(값 미집계).
 */
export default async function StatsPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = new Date().getFullYear();
  const stats = await getOwnerStats(db, ownerId, year);

  const cards: { label: string; value: number; sub?: string }[] = [
    { label: "학생", value: stats.students, sub: `${year}년 등록` },
    { label: "교과 관찰기록", value: stats.observations },
    { label: "행동특성 기록", value: stats.behaviorNotes },
    { label: "활동 기입", value: stats.activities },
    { label: "상담 기록", value: stats.counseling },
    { label: "동아리", value: stats.clubs },
    {
      label: "세특 초안",
      value: stats.draftsTotal,
      sub: `완료 ${stats.draftsFinalized}`,
    },
    {
      label: "출결 기록",
      value: stats.attendanceTotal,
      sub: `미제출 신고서 ${stats.unsubmittedReports}`,
    },
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">통계실 ({year})</h1>
        <div className="flex items-center gap-4">
          <Link
            href="/print"
            className="text-sm text-neutral-500 hover:underline"
          >
            인쇄실 →
          </Link>
          <Link href="/" className="text-sm text-neutral-500 hover:underline">
            ← 홈
          </Link>
        </div>
      </div>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-neutral-200 p-4"
          >
            <p className="text-xs text-neutral-500">{c.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{c.value}</p>
            {c.sub && (
              <p className="mt-0.5 text-xs text-neutral-400">{c.sub}</p>
            )}
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4">
        <h2 className="text-sm font-semibold text-neutral-500">
          성적 통계 <span className="text-xs font-normal">(준비중)</span>
        </h2>
        <p className="mt-1 text-xs text-neutral-400">
          성적(grades)은 현재 목업 단계입니다. 성적 입력 기능이 켜지면 석차·등급 분포가
          여기에 표시됩니다.
        </p>
      </section>
    </main>
  );
}
