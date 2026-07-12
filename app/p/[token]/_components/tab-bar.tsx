"use client";

export type TabId = "home" | "schedule" | "timetable" | "records";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "home", label: "홈", icon: "📆" },
  { id: "schedule", label: "일정", icon: "🗓️" },
  { id: "timetable", label: "시간표", icon: "📚" },
  { id: "records", label: "나의기록", icon: "📋" },
];

/**
 * 학생 공개 페이지 하단 탭바 (public-page-mobile-v2 Step 3). 교사 앱 BottomTabBar의
 * 글래스 패턴을 재사용하되, 모바일 전용(`md:hidden`)이 아니라 모든 폭에서 노출한다
 * (스펙: 데스크톱도 동일 4탭 레이아웃). 내부를 `max-w-2xl`로 감싸 데스크톱에서도
 * 본문 폭과 정렬되게 한다.
 */
export function TabBar({
  active,
  onSelect,
}: {
  active: TabId;
  onSelect: (tab: TabId) => void;
}) {
  return (
    <nav
      aria-label="학생 페이지 내비게이션"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
    >
      <div className="mx-auto flex w-full max-w-2xl">
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs transition-colors ${
                isActive ? "text-white" : "text-neutral-500 hover:text-white"
              }`}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
