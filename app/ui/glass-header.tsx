"use client";

import { usePathname } from "next/navigation";
import { pageTitle } from "./nav-config";

/**
 * 콘텐츠 영역 상단 글래스 스티키 헤더 (Stage 3-1). 경로에서 페이지 제목을 산출해
 * 표시한다. blur 반경은 md(12px) 기본으로 절제하고 will-change는 쓰지 않는다
 * (성능 계획 준수). 브랜드: 그림자 없이 헤어라인 하단 보더만.
 */
export function GlassHeader() {
  const pathname = usePathname();
  const title = pageTitle(pathname);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center border-b border-hairline bg-canvas/70 px-6 backdrop-blur-md print:hidden">
      <h2 className="truncate text-sm font-medium tracking-tight text-white">
        {title}
      </h2>
    </header>
  );
}
