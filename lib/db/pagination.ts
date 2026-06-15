/**
 * 리스트 페이지네이션 헬퍼 (QC v4 #8). 번호식(1 2 3 …) 페이지네이션 공통 계산.
 *
 * 쿼리 계층은 `toLimitOffset` 로 limit/offset 을 만들고, UI 는 `paginate`
 * 로 현재 페이지 슬라이스 + 총 페이지 수를 얻는다. 순수 함수로 단위 테스트한다.
 */

/** 기본 페이지 크기(컴포넌트별로 10 또는 20). */
export const DEFAULT_PAGE_SIZE = 10;

/** 1-based page → SQL limit/offset. page<1 은 1로 보정. */
export function toLimitOffset(
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): { limit: number; offset: number } {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  return { limit: pageSize, offset: (safePage - 1) * pageSize };
}

/** 총 항목 수 → 총 페이지 수(최소 1). */
export function pageCount(total: number, pageSize: number = DEFAULT_PAGE_SIZE): number {
  if (total <= 0) return 1;
  return Math.ceil(total / pageSize);
}

/**
 * 드리즐 `$dynamic()` 쿼리에 limit/offset 을 선택 적용한다(서버 페이지네이션).
 * opts 미지정·limit 없음 = 페이징 미적용(전체 반환). offset 만 단독 적용은 무시.
 */
export function applyPaging<Q extends { limit: (n: number) => Q; offset: (n: number) => Q }>(
  query: Q,
  opts?: { limit?: number; offset?: number },
): Q {
  if (!opts || opts.limit == null) return query;
  let q = query.limit(opts.limit);
  if (opts.offset != null && opts.offset > 0) q = q.offset(opts.offset);
  return q;
}

/** 메모리 배열을 현재 페이지로 슬라이스(클라이언트 페이지네이션용). */
export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): { pageItems: T[]; totalPages: number; currentPage: number } {
  const totalPages = pageCount(items.length, pageSize);
  const currentPage = Math.min(
    Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1),
    totalPages,
  );
  const start = (currentPage - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    totalPages,
    currentPage,
  };
}
