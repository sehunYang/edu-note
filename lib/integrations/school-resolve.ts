import "server-only";
import { searchSchoolInfo } from "./neis-client";
import { searchSchools } from "./comcigan-client";
import type { NeisSchoolInfo } from "./neis";
import type { SchoolSearchRow } from "./comcigan";

/**
 * 학교명 1회 입력으로 NEIS(office/school 코드)와 comcigan(학교 식별자)를 **동시 해석**한다
 * (QC v1 C2, AC-2.3). C3(NEIS 학사일정 sync)와 C5(comcigan 시간표 sync)가 재입력 없이
 * 동작하도록 양대 통합을 한 번에 채운다.
 *
 * 비차단(best-effort): 네트워크/검색 실패는 throw 하지 않고 status='none'+error 로 돌려
 * 수동 입력 경로를 유지(게이트 막힘 방지). 다건은 picker fallback(status='multiple').
 */
export type MatchStatus = "none" | "single" | "multiple";

/** 결과 건수 → 분기 상태(0건/단일/다건). 순수 — 단위테스트 대상. */
export function matchStatus(count: number): MatchStatus {
  if (count <= 0) return "none";
  if (count === 1) return "single";
  return "multiple";
}

export interface ProviderMatch<T> {
  status: MatchStatus;
  candidates: T[];
  error?: string;
}

export interface SchoolResolution {
  neis: ProviderMatch<NeisSchoolInfo>;
  comcigan: ProviderMatch<SchoolSearchRow>;
}

function toMatch<T>(
  res: { ok: true; data: T[] } | { ok: false; error: string },
): ProviderMatch<T> {
  if (!res.ok) return { status: "none", candidates: [], error: res.error };
  return { status: matchStatus(res.data.length), candidates: res.data };
}

/** 학교명 → NEIS·comcigan 병렬 동시 해석. 어느 한쪽 실패해도 다른 쪽 결과는 보존. */
export async function resolveSchool(name: string): Promise<SchoolResolution> {
  const [neis, comcigan] = await Promise.all([
    searchSchoolInfo(name),
    searchSchools(name),
  ]);
  return { neis: toMatch(neis), comcigan: toMatch(comcigan) };
}
