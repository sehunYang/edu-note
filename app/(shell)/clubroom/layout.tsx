import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { getOwnerClub } from "@/lib/db/queries";
import { TabNav } from "@/app/ui/tab-nav";
import { RoomHeader } from "@/app/ui/room-header";

export const dynamic = "force-dynamic";

const TABS: { href: string; label: string }[] = [
  { href: "/clubroom/create", label: "동아리 개설" },
  { href: "/clubroom/assign", label: "부원 배정" },
  { href: "/clubroom/plan", label: "활동 계획" },
  { href: "/clubroom/entry", label: "활동 입력" },
  { href: "/clubroom/record", label: "생기부 작성" },
];

/**
 * 동아리실 셸 (QC v5 c9 D.1). 담임 교실 셸(app/homeroom/layout.tsx)을 복제한
 * **공유 탭 바 허브**다. 5개 컴포넌트 탭(개설/배정/활동계획/활동입력/생기부)을
 * 항상 노출한다. 교사 단일 동아리 전제 — 동아리 미개설 시 개설 탭만 안내하고
 * 나머지 탭은 비활성 안내로 게이팅한다.
 */
export default async function ClubroomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ownerId = await getOwnerId();
  const db = getDb();
  const club = await getOwnerClub(db, ownerId);

  return (
    <div>
      <RoomHeader
        icon="🎬"
        title="동아리실"
        desc="동아리 개설·부원 배정·활동 계획·활동 입력·생기부 작성을 한곳에서 관리합니다."
        note="학기 구분 없이 사용합니다(교사당 동아리 1개)"
      />

      <div className="mt-3 md:hidden">
        <TabNav tabs={TABS} ariaLabel="동아리실 탭" mobileOnly />
      </div>

      {!club && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p>
            아직 개설된 동아리가 없습니다. 부원 배정·활동 계획·활동 입력·생기부
            작성을 사용하려면 먼저 <strong>동아리 개설</strong> 탭에서 동아리를
            만드세요.
          </p>
        </div>
      )}

      <section className="mt-5">{children}</section>
    </div>
  );
}
