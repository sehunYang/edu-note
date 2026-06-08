import "server-only";
import iconv from "iconv-lite";
import {
  COMCIGAN_INIT_URL,
  buildSearchUrl,
  buildTimetableUrl,
  decodeTimetable,
  parseInitPage,
  parseSchoolSearch,
  requireSingleSchool,
  teacherSlots,
  type ComciganInit,
  type DecodedTimetable,
  type SchoolSearchRow,
  type TimetableSlot,
} from "./comcigan";

/**
 * 컴시간 서버 fetch 래퍼 (계획 §3.1/§6 — 어댑터 격리·비차단 best-effort).
 *
 * 네트워크/파싱 실패는 throw 하지 않고 Result 로 돌려준다. 호출측(시간표 sync 서버액션,
 * pg_cron)이 실패 시 audit_log + "마지막 성공 동기화" 배지 + 수기 fallback 을 처리.
 * 컴시간은 비공식 서비스이므로 sync 는 항상 비차단으로 다룬다.
 */
export type ComciganResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** 진입 페이지는 euc-kr. ASCII 토큰만 추출하므로 euc-kr 디코딩으로 안전. */
async function fetchInit(): Promise<ComciganInit> {
  const res = await fetch(COMCIGAN_INIT_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`init HTTP ${res.status}`);
  const body = iconv.decode(Buffer.from(await res.arrayBuffer()), "euc-kr");
  return parseInitPage(body);
}

/** 응답을 utf8 로 시도하고 실패 시 euc-kr 로 재해석(컴시간 인코딩 변동 대비). */
async function fetchBody(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const utf8 = buf.toString("utf8");
  try {
    JSON.parse(utf8.substring(0, utf8.lastIndexOf("}") + 1));
    return utf8;
  } catch {
    return iconv.decode(buf, "euc-kr");
  }
}

/** 학교 검색(부분 일치 목록). 실패는 Result.ok=false. */
export async function searchSchools(
  keyword: string,
): Promise<ComciganResult<SchoolSearchRow[]>> {
  try {
    const init = await fetchInit();
    const body = await fetchBody(buildSearchUrl(init, keyword));
    return { ok: true, data: parseSchoolSearch(body) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "검색 실패" };
  }
}

/** 학교명으로 시간표 전체를 디코딩(정확히 1개 매칭 요구). 실패는 Result.ok=false. */
export async function fetchTimetableBySchool(
  keyword: string,
): Promise<ComciganResult<DecodedTimetable>> {
  try {
    const init = await fetchInit();
    const searchBody = await fetchBody(buildSearchUrl(init, keyword));
    const school = requireSingleSchool(parseSchoolSearch(searchBody));
    const ttBody = await fetchBody(buildTimetableUrl(init, school.code));
    return { ok: true, data: decodeTimetable(JSON.parse(slice(ttBody))) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "시간표 조회 실패" };
  }
}

/** 특정 학교·교사의 시간표 슬롯. 편의 래퍼. */
export async function fetchTeacherTimetable(
  schoolKeyword: string,
  teacherName: string,
): Promise<ComciganResult<TimetableSlot[]>> {
  const res = await fetchTimetableBySchool(schoolKeyword);
  if (!res.ok) return res;
  return { ok: true, data: teacherSlots(res.data, teacherName) };
}

function slice(body: string): string {
  return body.substring(0, body.lastIndexOf("}") + 1);
}
