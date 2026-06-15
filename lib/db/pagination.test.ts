import { describe, it, expect } from "vitest";
import { toLimitOffset, pageCount, paginate, DEFAULT_PAGE_SIZE } from "./pagination";

describe("toLimitOffset", () => {
  it("1-based page → offset", () => {
    expect(toLimitOffset(1, 10)).toEqual({ limit: 10, offset: 0 });
    expect(toLimitOffset(3, 10)).toEqual({ limit: 10, offset: 20 });
    expect(toLimitOffset(2, 20)).toEqual({ limit: 20, offset: 20 });
  });
  it("page<1 또는 비정상은 1로 보정", () => {
    expect(toLimitOffset(0, 10)).toEqual({ limit: 10, offset: 0 });
    expect(toLimitOffset(-5, 10)).toEqual({ limit: 10, offset: 0 });
    expect(toLimitOffset(NaN, 10)).toEqual({ limit: 10, offset: 0 });
  });
  it("기본 페이지 크기", () => {
    expect(toLimitOffset(1)).toEqual({ limit: DEFAULT_PAGE_SIZE, offset: 0 });
  });
});

describe("pageCount", () => {
  it("총 항목 수 → 총 페이지(올림, 최소 1)", () => {
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(10, 10)).toBe(1);
    expect(pageCount(11, 10)).toBe(2);
    expect(pageCount(25, 10)).toBe(3);
    expect(pageCount(40, 20)).toBe(2);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);
  it("현재 페이지 슬라이스", () => {
    expect(paginate(items, 1, 10).pageItems).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(paginate(items, 3, 10).pageItems).toEqual([21, 22, 23, 24, 25]);
  });
  it("범위 밖 page 는 마지막으로 보정", () => {
    const r = paginate(items, 99, 10);
    expect(r.currentPage).toBe(3);
    expect(r.totalPages).toBe(3);
  });
  it("빈 배열은 1페이지", () => {
    const r = paginate([], 1, 10);
    expect(r.pageItems).toEqual([]);
    expect(r.totalPages).toBe(1);
    expect(r.currentPage).toBe(1);
  });
});
