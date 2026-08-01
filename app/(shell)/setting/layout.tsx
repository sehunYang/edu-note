import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { getStageStatuses, type SettingStage } from "@/lib/db/queries";
import { activeSchoolYear } from "@/lib/domain/school-year";
import { StageNav } from "./stage-nav";

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
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">
            <span aria-hidden="true">⚙️</span> 세팅실
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {year}학년도 기초 환경을 순서대로 설정합니다.
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>

      <StageNav
        stages={statuses.map((s) => ({
          feature: s.feature,
          n: STAGE_LABEL[s.feature].n,
          title: STAGE_LABEL[s.feature].title,
          unlocked: s.unlocked,
          completed: s.completed,
        }))}
      />

      <section className="mt-8">{children}</section>
    </div>
  );
}
