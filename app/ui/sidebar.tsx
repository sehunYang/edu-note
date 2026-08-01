"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SPACES,
  activeSpaceHref,
  matchLongestHref,
  type Space,
} from "./nav-config";

/**
 * 데스크톱(md 이상) 좌측 고정 사이드바 (Stage 3-1). 8개 공간을 세로로 나열하고,
 * 하위 탭이 있는 공간(교실·담임·동아리)은 아코디언으로 펼친다. 활성 공간은 자동
 * 펼침이며 사용자가 토글로 override할 수 있다. 접힘 토글은 폭을 w-60↔w-14로 전환해
 * 라벨을 숨긴다. 활성 판정은 usePathname + 공간 단위 최장 prefix.
 *
 * 모바일에서는 숨기고(hidden md:flex) 하단 탭바가 대신 노출된다.
 */
export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // 사용자가 명시적으로 토글한 공간의 열림 상태. 미토글 공간은 활성 여부로 결정.
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});

  const activeHref = activeSpaceHref(pathname);

  const logo = SPACES[0];
  const spaces = SPACES.slice(1);

  function isOpen(space: Space): boolean {
    if (space.href in openOverride) return openOverride[space.href];
    return space.href === activeHref;
  }

  return (
    <aside
      className={`hidden shrink-0 flex-col border-r border-hairline bg-canvas transition-[width] duration-200 print:hidden md:flex md:sticky md:top-0 md:z-20 md:h-screen md:self-start ${
        collapsed ? "w-14" : "w-60"
      }`}
    >
      {/* 로고 (홈 링크) */}
      <div className="flex h-14 items-center gap-2 border-b border-hairline px-3">
        <Link
          href={logo.href}
          aria-current={pathname === "/" ? "page" : undefined}
          className="flex min-w-0 items-center gap-2 text-sm text-white"
        >
          <span aria-hidden="true" className="text-lg leading-none">{logo.icon}</span>
          {!collapsed && (
            <span className="truncate font-medium tracking-tight">
              {logo.label}
            </span>
          )}
        </Link>
      </div>

      <nav
        aria-label="주 메뉴"
        className="flex-1 overflow-y-auto px-2 py-3"
      >
        <ul className="flex flex-col gap-1">
          {spaces.map((space) => {
            const active = space.href === activeHref;
            const open = !collapsed && isOpen(space);
            const hasTabs = !!space.tabs?.length;
            // 하위 탭 활성 판정은 공간당 1회(최장 prefix) — pageTitle과 동일 규약.
            const subHref = hasTabs
              ? matchLongestHref(
                  pathname,
                  space.tabs!.map((t) => t.href),
                )
              : null;

            return (
              <li key={space.href}>
                <div className="flex items-stretch">
                  <Link
                    href={space.href}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? space.label : undefined}
                    className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
                      active
                        ? "bg-white/10 text-white"
                        : "text-neutral-500 hover:bg-white/5"
                    }`}
                  >
                    <span aria-hidden="true" className="w-5 shrink-0 text-center text-base leading-none">
                      {space.icon}
                    </span>
                    {!collapsed && <span className="truncate">{space.label}</span>}
                  </Link>
                  {hasTabs && !collapsed && (
                    <button
                      type="button"
                      onClick={() =>
                        setOpenOverride((prev) => ({
                          ...prev,
                          [space.href]: !open,
                        }))
                      }
                      aria-expanded={open}
                      aria-label={`${space.label} 하위메뉴 ${open ? "접기" : "펼치기"}`}
                      className="ml-0.5 flex w-7 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-white/5 hover:text-white"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        aria-hidden="true"
                      >
                        <path d="M7.5 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </div>

                {hasTabs && !collapsed && (
                  <div className={`accordion ${open ? "accordion-open" : ""}`}>
                    <div>
                      <ul className="mt-1 flex flex-col gap-0.5 py-0.5 pl-9 pr-1">
                        {space.tabs!.map((tab) => {
                          const subActive = subHref === tab.href;
                          return (
                            <li key={tab.href}>
                              <Link
                                href={tab.href}
                                aria-current={subActive ? "page" : undefined}
                                className={`block truncate rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                                  subActive
                                    ? "bg-white/10 text-white"
                                    : "text-neutral-500 hover:bg-white/5"
                                }`}
                              >
                                {tab.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 접힘 토글 */}
      <div className="border-t border-hairline p-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-neutral-500 transition-colors hover:bg-white/5 hover:text-white"
        >
          <span className="w-5 shrink-0 text-center leading-none">
            <svg
              viewBox="0 0 20 20"
              className={`mx-auto h-4 w-4 transition-transform ${collapsed ? "" : "rotate-180"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <path d="M12.5 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          {!collapsed && <span className="truncate">접기</span>}
        </button>
      </div>
    </aside>
  );
}
