import { Sidebar } from "./sidebar";
import { GlassHeader } from "./glass-header";
import { BottomTabBar } from "./bottom-tab-bar";

/**
 * 앱 셸 프레임 (Stage 3-1). 데스크톱 좌측 사이드바 + 콘텐츠 열(글래스 헤더 +
 * 페이지 본문) + 모바일 하단 탭바를 조립한다. 자체는 서버 컴포넌트로 두어
 * children(각 페이지)이 서버 렌더되도록 하고, 내부의 사이드바/헤더/탭바만 클라이언트다.
 *
 * 각 페이지는 자체 `mx-auto max-w-*` 컨테이너를 가지므로 콘텐츠 열은 배경만 제공하고
 * 별도 컨테이너를 두지 않는다(이중 컨테이너 금지). 모바일에서는 하단 탭바에 가리지
 * 않도록 본문 하단 패딩을 보정한다.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-canvas">
      {/* 본문 바로가기 (사용성 개선 P2-15). 사이드바가 링크 26개를 상시 렌더하므로
          이게 없으면 키보드 사용자는 페이지를 옮길 때마다 26탭을 통과해야 본문에
          닿는다. 평소엔 화면 밖(sr-only)이고 Tab 을 처음 누를 때만 나타난다. */}
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-full focus:border focus:border-white focus:bg-white focus:px-5 focus:text-sm focus:text-black print:hidden"
      >
        본문 바로가기
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <GlassHeader />
        <div className="pb-20 md:pb-0">{children}</div>
      </div>
      <BottomTabBar />
    </div>
  );
}
