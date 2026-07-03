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
}: {
  tabs: Tab[];
  ariaLabel?: string;
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
    <nav className="flex flex-wrap gap-2" aria-label={ariaLabel}>
      {tabs.map((t) => {
        const active = t.href === activeHref;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full border px-3 py-2 text-sm transition-colors ${
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
