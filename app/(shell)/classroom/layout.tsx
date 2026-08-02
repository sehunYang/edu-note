import { activeSemester } from "@/lib/domain/school-year";
import { TabNav } from "@/app/ui/tab-nav";
import { RoomHeader } from "@/app/ui/room-header";
import { SemesterSelector } from "./semester-selector";

export const dynamic = "force-dynamic";

const TABS: { href: string; label: string }[] = [
  { href: "/classroom/plan", label: "수업 계획실" },
  { href: "/classroom/progress", label: "진척도" },
  { href: "/classroom/grades", label: "성적 기록" },
  { href: "/classroom/observations", label: "교과 관찰" },
  { href: "/classroom/report", label: "학생 보고서" },
  { href: "/classroom/setech", label: "세특 작성" },
];

/**
 * 교실 허브 셸 (QC v2 2-2 단계1). 세팅실 셸을 참고하되 **게이팅 없는 자유 탭 허브**다.
 * 6개 컴포넌트 탭을 항상 활성으로 제공하고, 학기 셀렉터(client)로 `?semester`를 공유한다.
 * 활성 학기 기본값은 서버에서 activeSemester로 산출해 셀렉터에 주입한다(layout은
 * searchParams를 못 받으므로 셀렉터가 client에서 직접 읽어 override).
 */
export default function ClassroomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const defaultSemester = activeSemester(new Date());

  return (
    <div>
      <RoomHeader
        icon="🏫"
        title="교실"
        actions={<SemesterSelector defaultSemester={defaultSemester} />}
      />

      <div className="mt-3 md:hidden">
        <TabNav tabs={TABS} ariaLabel="교실 탭" mobileOnly />
      </div>

      <section className="mt-5">{children}</section>
    </div>
  );
}
