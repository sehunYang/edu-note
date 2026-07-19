import "server-only";
import {
  parseMealService,
  parseSchoolSchedule,
  parseSchoolInfo,
  parseHisTimetable,
  type NeisMealEntry,
  type NeisScheduleEntry,
  type NeisSchoolInfo,
  type NeisTimetableEntry,
} from "./neis";

/**
 * NEIS 개방포털 서버 fetch 래퍼 (계획 §3.1/§6 — 어댑터 격리, 비차단 best-effort).
 *
 * 네트워크/파싱 실패는 throw 하지 않고 discriminated Result 로 돌려준다.
 * 호출 측(서버 액션/pg_cron sync)이 실패 시 audit_log + 캘린더 경고 + "마지막 성공
 * 동기화" 배지를 처리한다. NEIS_API_KEY 는 서버 env only.
 */
const NEIS_BASE = "https://open.neis.go.kr/hub";

export type NeisResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

interface NeisQuery {
  /** 시도교육청코드 ATPT_OFCDC_SC_CODE. */
  officeCode: string;
  /** 표준학교코드 SD_SCHUL_CODE. */
  schoolCode: string;
}

function buildUrl(
  endpoint: string,
  query: NeisQuery,
  extra: Record<string, string>,
): string {
  const params = new URLSearchParams({
    Type: "json",
    pIndex: "1",
    pSize: "1000",
    ATPT_OFCDC_SC_CODE: query.officeCode,
    SD_SCHUL_CODE: query.schoolCode,
    ...extra,
  });
  const key = process.env.NEIS_API_KEY;
  if (key) params.set("KEY", key);
  return `${NEIS_BASE}/${endpoint}?${params.toString()}`;
}

async function fetchJson(url: string): Promise<NeisResult<unknown>> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, data: await res.json() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch 실패" };
  }
}

/** 학교명으로 NEIS 코드(교육청·학교코드)를 검색. 실패는 Result.ok=false. */
export async function searchSchoolInfo(
  name: string,
): Promise<NeisResult<NeisSchoolInfo[]>> {
  const params = new URLSearchParams({
    Type: "json",
    pIndex: "1",
    pSize: "20",
    SCHUL_NM: name,
  });
  const key = process.env.NEIS_API_KEY;
  if (key) params.set("KEY", key);
  const res = await fetchJson(`${NEIS_BASE}/schoolInfo?${params.toString()}`);
  if (!res.ok) return res;
  return { ok: true, data: parseSchoolInfo(res.data) };
}

/** 학사일정 조회(기간 YYYYMMDD). 실패는 Result.ok=false. */
export async function fetchSchoolSchedule(
  query: NeisQuery,
  fromYmd: string,
  toYmd: string,
): Promise<NeisResult<NeisScheduleEntry[]>> {
  const url = buildUrl("SchoolSchedule", query, {
    AA_FROM_YMD: fromYmd,
    AA_TO_YMD: toYmd,
  });
  const res = await fetchJson(url);
  if (!res.ok) return res;
  return { ok: true, data: parseSchoolSchedule(res.data) };
}

/** 급식 조회(기간 YYYYMMDD). 실패는 Result.ok=false. */
export async function fetchMealService(
  query: NeisQuery,
  fromYmd: string,
  toYmd: string,
): Promise<NeisResult<NeisMealEntry[]>> {
  const url = buildUrl("mealServiceDietInfo", query, {
    MLSV_FROM_YMD: fromYmd,
    MLSV_TO_YMD: toYmd,
  });
  const res = await fetchJson(url);
  if (!res.ok) return res;
  return { ok: true, data: parseMealService(res.data) };
}

/**
 * 고등학교시간표(hisTimetable) 조회 — 특정 학년/반의 기간(YYYYMMDD) 실제 시간표.
 * '이번 주 실제' 오버레이 소스. 실패는 Result.ok=false(호출측이 표준 폴백).
 */
export async function fetchHisTimetable(
  query: NeisQuery,
  grade: number,
  classNm: number,
  fromYmd: string,
  toYmd: string,
): Promise<NeisResult<NeisTimetableEntry[]>> {
  const url = buildUrl("hisTimetable", query, {
    GRADE: String(grade),
    CLASS_NM: String(classNm),
    TI_FROM_YMD: fromYmd,
    TI_TO_YMD: toYmd,
  });
  const res = await fetchJson(url);
  if (!res.ok) return res;
  return { ok: true, data: parseHisTimetable(res.data) };
}
