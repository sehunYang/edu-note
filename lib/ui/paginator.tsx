"use client";

/**
 * 공용 번호식 페이지네이션 컴포넌트 (QC v4 #8, AC-8.1).
 *
 * 1 2 3 … 형태로 페이지 번호를 노출하고 클릭 시 onPageChange 호출.
 * 페이지가 1개면 렌더하지 않는다. 페이지가 많으면 현재 페이지 주변 + 양끝만
 * 노출하고 가운데를 … 로 축약한다.
 */

interface PaginatorProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** 노출할 페이지 번호 목록(축약 포함)을 만든다. "…" 는 생략 마커. */
function buildPageList(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

export function Paginator({
  currentPage,
  totalPages,
  onPageChange,
  className,
}: PaginatorProps) {
  if (totalPages <= 1) return null;

  const pages = buildPageList(currentPage, totalPages);

  return (
    <nav
      className={`flex items-center justify-center gap-1 ${className ?? ""}`}
      aria-label="페이지 네비게이션"
    >
      <button
        type="button"
        className="rounded px-2 py-1 text-sm text-gray-600 disabled:opacity-40 hover:bg-gray-100"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        aria-label="이전 페이지"
      >
        ‹
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-2 py-1 text-sm text-gray-400">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={`min-w-8 rounded px-2 py-1 text-sm ${
              p === currentPage
                ? "bg-gray-800 text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
            onClick={() => onPageChange(p)}
            aria-current={p === currentPage ? "page" : undefined}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        className="rounded px-2 py-1 text-sm text-gray-600 disabled:opacity-40 hover:bg-gray-100"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        aria-label="다음 페이지"
      >
        ›
      </button>
    </nav>
  );
}
