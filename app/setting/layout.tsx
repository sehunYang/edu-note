import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { getStageStatuses, type SettingStage } from "@/lib/db/queries";
import { activeSchoolYear } from "@/lib/domain/school-year";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<SettingStage, { n: number; title: string }> = {
  year: { n: 1, title: "학년도" },
  profile: { n: 2, title: "교사 기본" },
  calendar: { n: 3, title: "학사일정" },
  students: { n: 4, title: "학생 명단" },
  courses: { n: 5, title: "수업 관리" },
};

/**
 * 세팅실 셸 (QC v1 단계0, AC-0.1). 5단계 순차 게이팅 네비를 제공한다.
 * 선행 단계가 완료되지 않은 단계는 잠금(비활성)으로 렌더한다.
 */
export default async function SettingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ownerId = await getOwnerId();
  const db = getDb();
  const statuses = await getStageStatuses(db, ownerId);
  const year = activeSchoolYear(new Date());

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">⚙️ 세팅실</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {year}학년도 기초 환경을 순서대로 설정합니다.
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="세팅 단계">
        {statuses.map((s) => {
          const meta = STAGE_LABEL[s.feature];
          const base =
            "flex items-center gap-2 rounded-md border px-3 py-2 text-sm";
          if (!s.unlocked) {
            return (
              <span
                key={s.feature}
                aria-disabled
                title="선행 단계를 먼저 완료하세요"
                className={`${base} cursor-not-allowed border-neutral-200 text-neutral-300`}
              >
                🔒 {meta.n}. {meta.title}
              </span>
            );
          }
          return (
            <Link
              key={s.feature}
              href={`/setting/${s.feature}`}
              className={`${base} border-neutral-300 text-neutral-700 hover:border-neutral-500 hover:bg-neutral-50`}
            >
              <span>
                {meta.n}. {meta.title}
              </span>
              {s.completed && <span className="text-green-600">✓</span>}
            </Link>
          );
        })}
      </nav>

      <section className="mt-8">{children}</section>
    </div>
  );
}
