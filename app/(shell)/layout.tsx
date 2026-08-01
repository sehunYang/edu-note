import { AppShell } from "@/app/ui/app-shell";
import { CoveLight } from "@/app/ui/cove-light";

/**
 * (shell) 라우트 그룹 레이아웃.
 *
 * Stage 3-1: 앱 셸 장착 — 데스크톱 좌측 사이드바 + 글래스 스티키 헤더 + 모바일
 * 하단 탭바. 공개 경로(/p·/login·/auth)는 이 그룹 밖에 있어 셸 JS가 실리지 않는다.
 * 콘텐츠 전환(template.tsx fade)은 children 내부에서 그대로 동작한다.
 *
 * 인쇄실(통계실·인쇄실 재구축 AD-4 Option C): `/print` 는 셸 안·밖에 라우트가
 * 나뉜다 — 인쇄 **출력** 라우트(`/print/roster`, `/print/[id]/handout`)는 크롬
 * 무탑재가 정확성 요건이라 이 그룹 밖에 남고, 인쇄실 **탐색/점검** 화면(`/print`,
 * `/print/[id]`)만 이 그룹 안(셸 JS 탑재)으로 들어온다. 셸 크롬 3종(Sidebar·
 * GlassHeader·BottomTabBar)에는 방어적 `print:hidden` 이 있어(우발 Ctrl+P 대비)
 * 탐색 화면에서 인쇄해도 크롬이 유출되지 않는다.
 */
export default function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // CoveLight는 template.tsx의 transform 애니메이션 조상 바깥(AppShell 형제)에
  // 두어야 fixed 앵커링이 유지된다(cove-lighting 계획 AC-6/RC4).
  //
  // 사용성 개선 P1-5/P2-15: <main> 컨테이너를 여기 하나로 모았다. 이전에는 각
  // 페이지·실 레이아웃이 제각기 컨테이너를 선언해 본문 폭이 4종(max-w-3xl/4xl/
  // 5xl/컨테이너 없음)으로 갈렸고, 실 사이를 오갈 때 본문이 좌우로 최대 256px
  // 튀었다. 동시에 <main> 랜드마크가 있는 페이지와 없는 페이지가 섞여 있었는데
  // 이제 모든 셸 하위 화면이 정확히 하나의 <main>을 갖는다.
  return (
    <>
      <CoveLight />
      <AppShell>
        <main id="content" className="mx-auto w-full max-w-5xl px-6 py-10">
          {children}
        </main>
      </AppShell>
    </>
  );
}
