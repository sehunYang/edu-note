import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { getTeacherSettings } from "@/lib/db/queries";
import { TabNav } from "@/app/ui/tab-nav";
import { RoomHeader } from "@/app/ui/room-header";
import { EmptyState } from "@/app/ui/empty-state";

export const dynamic = "force-dynamic";

const TABS: { href: string; label: string }[] = [
  { href: "/homeroom/activities", label: "자율·진로활동" },
  { href: "/homeroom/attendance", label: "출결 관리" },
  { href: "/homeroom/behavior", label: "행동특성 기록" },
  { href: "/homeroom/counsel", label: "상담실" },
  { href: "/homeroom/notice", label: "공지실" },
  { href: "/homeroom/record", label: "생기부 작성" },
];

/**
 * 담임 교실 셸 (QC v4 US-8, AC-3.1/3.2). 교실 셸을 참고한 **공유 탭 바 허브**다.
 * 6개 컴포넌트 탭을 항상 노출해 하위 페이지 네비를 통일한다(하위의 ← 홈 제거).
 * 담임 미설정 게이팅을 보존: 담임이 아니면 탭 대신 세팅실 안내만 렌더한다.
 * 담임 교실은 학기 구분 없이 사용한다.
 */
export default async function HomeroomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ownerId = await getOwnerId();
  const db = getDb();
  const settings = await getTeacherSettings(db, ownerId);

  return (
    <div>
      <RoomHeader
        icon="🏠"
        title="담임 교실"
        note="학기 구분 없음"
      />

      {!settings?.isHomeroom ? (
        <div className="mt-5">
          <EmptyState
            actions={[{ href: "/setting/profile", label: "담임 학년·반 설정" }]}
          >
            담임 교사로 설정되어 있지 않습니다.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-3 md:hidden">
            <TabNav tabs={TABS} ariaLabel="담임 교실 탭" mobileOnly />
          </div>

          <section className="mt-5">{children}</section>
        </>
      )}
    </div>
  );
}
