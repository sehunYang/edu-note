"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SPACES, activeSpaceHref, type Space } from "./nav-config";

/** 하단 탭바에 직접 노출할 공간 href → 축약 라벨 (나머지는 "더보기" 시트로). */
const PRIMARY: { href: string; label: string }[] = [
  { href: "/", label: "허브" },
  { href: "/today", label: "오늘" },
  { href: "/classroom", label: "교실" },
  { href: "/homeroom", label: "담임" },
];
const PRIMARY_HREFS = PRIMARY.map((p) => p.href);

function spaceByHref(href: string): Space {
  return SPACES.find((s) => s.href === href)!;
}

/**
 * 모바일(md 미만) 고정 하단 탭바 (Stage 3-1). 허브·오늘·교실·담임 4개 공간을
 * 직접 노출하고, "더보기"로 동아리실·세팅실·통계·교무실을 시트로 연다. safe-area
 * 하단 인셋을 반영한다. 데스크톱에서는 숨긴다(md:hidden).
 */
export function BottomTabBar() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  const activeHref = activeSpaceHref(pathname);
  const overflow = SPACES.filter(
    (s) => !PRIMARY_HREFS.includes(s.href),
  );
  const overflowActive = overflow.some((s) => s.href === activeHref);

  return (
    <>
      {/* 더보기 시트 */}
      {sheetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="더보기 메뉴"
          className="fixed inset-0 z-50 print:hidden md:hidden"
        >
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-x-0 bottom-0 animate-scale-in origin-bottom rounded-t-2xl border-t border-hairline bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
            <ul className="grid grid-cols-2 gap-2">
              {overflow.map((space) => {
                const active = space.href === activeHref;
                return (
                  <li key={space.href}>
                    <Link
                      href={space.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setSheetOpen(false)}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-3 text-sm transition-colors ${
                        active
                          ? "bg-white/10 text-white"
                          : "text-neutral-500 hover:bg-white/5"
                      }`}
                    >
                      <span aria-hidden="true" className="text-base leading-none">{space.icon}</span>
                      <span className="truncate">{space.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <nav
        aria-label="하단 내비게이션"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-hairline bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md print:hidden md:hidden"
      >
        {PRIMARY.map((item) => {
          const space = spaceByHref(item.href);
          const active = space.href === activeHref;
          return (
            <Link
              key={space.href}
              href={space.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.7rem] transition-colors ${
                active ? "text-white" : "text-neutral-500 hover:text-white"
              }`}
            >
              <span aria-hidden="true" className="text-lg leading-none">{space.icon}</span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-expanded={sheetOpen}
          aria-label="더보기"
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.7rem] transition-colors ${
            overflowActive ? "text-white" : "text-neutral-500 hover:text-white"
          }`}
        >
          <span className="text-lg leading-none">⋯</span>
          <span>더보기</span>
        </button>
      </nav>
    </>
  );
}
