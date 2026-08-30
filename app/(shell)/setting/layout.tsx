import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { getStageStatuses, type SettingStage } from "@/lib/db/queries";
import { activeSchoolYear } from "@/lib/domain/school-year";
import { StageNav } from "./stage-nav";
import { RoomHeader } from "@/app/ui/room-header";

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
      <RoomHeader
        icon="⚙️"
        title="세팅실"
        desc={`${year}학년도`}
      />

      <StageNav
        stages={statuses.map((s) => ({
          feature: s.feature,
          n: STAGE_LABEL[s.feature].n,
          title: STAGE_LABEL[s.feature].title,
          unlocked: s.unlocked,
          completed: s.completed,
        }))}
      />

      {/* 시스템 상태는 5단계 게이팅과 무관하다 — 설치 진단·키 등록은 언제나 열려
          있어야 한다(배포판 S5). 그래서 StageNav 밖에 별도 링크로 둔다. */}
      <div className="mt-3">
        <a
          href="/setting/system"
          className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-300"
        >
          시스템 상태 · 인증키 등록 →
        </a>
      </div>

      <section className="mt-5">{children}</section>
    </div>
  );
}
