import Link from "next/link";
import { activeSemester } from "@/lib/domain/school-year";
import { TabNav } from "@/app/ui/tab-nav";
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">🏫 교실</h1>
          <p className="mt-1 text-sm text-neutral-500">
            수업 계획부터 세특 작성까지, 학기별 수업 운영을 한곳에서 관리합니다.
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <TabNav tabs={TABS} ariaLabel="교실 탭" mobileOnly />
        <SemesterSelector defaultSemester={defaultSemester} />
      </div>

      <section className="mt-8">{children}</section>
    </div>
  );
}
