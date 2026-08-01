"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string };

/**
 * 실 셸 상단 공유 탭 바 (Stage 2-3). 현재 경로를 감지해 활성 탭에 인디케이터를
 * 부여한다. 활성 판정은 pathname === href 또는 pathname.startsWith(href + "/")를
 * 만족하는 탭 중 **가장 긴 href 하나만** 활성으로 삼아(최장 prefix 우선) 접두
 * 중복을 방지한다.
 */
export function TabNav({
  tabs,
  ariaLabel,
  mobileOnly = false,
}: {
  tabs: Tab[];
  ariaLabel?: string;
  /**
   * 데스크톱에서 이 탭 바를 숨긴다(사용성 개선 P1-6). 교실·담임 교실·동아리실은
   * 같은 하위 링크를 사이드바가 이미 펼쳐 보여주므로, 데스크톱에서 탭 바까지
   * 렌더하면 동일 href 6개가 한 화면에 두 번 나오고(실측 중복 href 10개) 첫
   * 과업 컨트롤이 뷰포트 321px 지점까지 밀린다. 사이드바가 없는 모바일에서는
   * 이 탭이 유일한 실 내부 이동 수단이라 그대로 유지한다.
   */
  mobileOnly?: boolean;
}) {
  const pathname = usePathname();

  let activeHref: string | null = null;
  for (const t of tabs) {
    const matches = pathname === t.href || pathname.startsWith(t.href + "/");
    if (matches && (activeHref === null || t.href.length > activeHref.length)) {
      activeHref = t.href;
    }
  }

  return (
    <nav
      className={`flex flex-wrap gap-2 ${mobileOnly ? "md:hidden" : ""}`}
      aria-label={ariaLabel}
    >
      {tabs.map((t) => {
        const active = t.href === activeHref;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm transition-colors ${
              active
                ? "border-white/60 bg-white/10 text-white"
                : "border-white/25 text-neutral-700 hover:border-neutral-500 hover:bg-white/10"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
