import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { getOwnerClub } from "@/lib/db/queries";
import { TabNav } from "@/app/ui/tab-nav";
import { RoomHeader } from "@/app/ui/room-header";
import { EmptyState } from "@/app/ui/empty-state";

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
        note="학기 구분 없음 · 교사당 1개"
      />

      <div className="mt-3 md:hidden">
        <TabNav tabs={TABS} ariaLabel="동아리실 탭" mobileOnly />
      </div>

      {/* 간략화 S-1: 미개설 안내를 셸에서 뺐다. 하위 5개 탭이 각자 같은 문장을
          이미 띄워 한 화면에 두 번 나오고 있었다(개설 탭에서는 개설 폼 위에). */}
      <section className="mt-5">{children}</section>
    </div>
  );
}
