/**
 * NEIS 개방포털 응답 파서 (계획 §3.1/§3.3 E, §6 — 읽기 전용 외부 API).
 *
 * open.neis.go.kr 의 학사일정(SchoolSchedule)·급식(mealServiceDietInfo) JSON 을
 * 도메인 입력 형태로 정규화하는 **순수 함수**(네트워크 없음 → 픽스처 테스트 가능).
 * 서버 fetch 래퍼는 ./neis-client(server-only)에 격리한다.
 *
 * 실패/무데이터 내성: NEIS 는 데이터가 없으면 RESULT.CODE="INFO-200" 을 돌려준다.
 * 파서는 이 경우 throw 하지 않고 빈 배열을 반환한다(§6 비차단 best-effort).
 */

// ── 정규화 출력 ──

/** 학사일정 한 건 → calendar_events / school_day_calendar 입력. */
export interface NeisScheduleEntry {
  date: string; // YYYY-MM-DD
  title: string; // 행사명(EVENT_NM)
  content: string | null; // 행사내용(EVENT_CNTNT)
  /** 휴업일/공휴일/토요휴업일 등 → 수업일 아님. 평일·"" → 수업일. */
  isSchoolDay: boolean;
  dayCategory: string | null; // 원본 SBTR_DD_SC_NM
}

/** 급식 한 건 → meal_cache 입력. */
export interface NeisMealEntry {
  date: string; // YYYY-MM-DD
  mealType: string; // 조식/중식/석식 (MMEAL_SC_NM)
  /** 알레르기 코드 제거된 메뉴 항목들. */
  menu: string[];
  /** <br/> 정규화만 한 원본 메뉴(코드 포함). */
  rawMenu: string;
  calInfo: string | null; // 칼로리(CAL_INFO)
  /** 영양정보(NTR_INFO) — "탄수화물(g) : 100.0\n단백질(g) : 30.0..." 형태. <br/>→줄바꿈 정규화. */
  ntrInfo: string | null;
}

/** 학교 검색 결과 → NEIS 코드(학사일정·급식 조회 키). */
export interface NeisSchoolInfo {
  officeCode: string; // ATPT_OFCDC_SC_CODE 시도교육청코드
  schoolCode: string; // SD_SCHUL_CODE 표준학교코드
  name: string; // SCHUL_NM 학교명
}

// ── 공통 헬퍼 ──

/** "YYYYMMDD" → "YYYY-MM-DD". 형식 불일치는 원본 그대로 반환. */
export function neisDate(ymd: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(ymd.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ymd.trim();
}

/** NEIS 네임드 키 응답에서 row 배열을 안전 추출. 무데이터/에러면 []. */
function extractRows(json: unknown, key: string): Record<string, unknown>[] {
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  // 무데이터: 최상위 RESULT.CODE = INFO-200
  const topResult = obj.RESULT as { CODE?: string } | undefined;
  if (topResult?.CODE && topResult.CODE !== "INFO-000") return [];

  const arr = obj[key];
  if (!Array.isArray(arr)) return [];
  // arr = [ { head: [...] }, { row: [...] } ] 구조. head 블록의 RESULT 도 확인.
  for (const block of arr) {
    if (block && typeof block === "object") {
      const head = (block as Record<string, unknown>).head;
      if (Array.isArray(head)) {
        for (const h of head) {
          const code = (h as { RESULT?: { CODE?: string } })?.RESULT?.CODE;
          if (code && code !== "INFO-000") return [];
        }
      }
    }
  }
  for (const block of arr) {
    const row = (block as Record<string, unknown>)?.row;
    if (Array.isArray(row)) return row as Record<string, unknown>[];
  }
  return [];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

// 수업일 아님으로 보는 일자 구분 키워드.
const NON_SCHOOL_DAY = ["휴업일", "공휴일", "토요휴업일", "방학", "휴일"];

// ── 학사일정 ──

export function parseSchoolSchedule(json: unknown): NeisScheduleEntry[] {
  const rows = extractRows(json, "SchoolSchedule");
  return rows.map((r) => {
    const category = str(r.SBTR_DD_SC_NM).trim() || null;
    const isSchoolDay =
      category === null || !NON_SCHOOL_DAY.some((k) => category.includes(k));
    const content = str(r.EVENT_CNTNT).trim();
    return {
      date: neisDate(str(r.AA_YMD)),
      title: str(r.EVENT_NM).trim(),
      content: content.length > 0 ? content : null,
      isSchoolDay,
      dayCategory: category,
    };
  });
}

// ── 급식 ──

/** DDISH_NM 의 <br/> 구분 + 알레르기 코드 "(1.2.5)"·"1.2." 제거. */
export function cleanMealMenu(ddishNm: string): string[] {
  return ddishNm
    .split(/<br\s*\/?>/i)
    .map((item) =>
      item
        // 끝의 알레르기 코드 묶음 제거: 공백+숫자/점/괄호만으로 끝나는 부분
        .replace(/[\s(]*\d+(?:[.\s]\d+)*[.\s]*\)?\s*$/g, "")
        .trim(),
    )
    .filter((item) => item.length > 0);
}

export function parseMealService(json: unknown): NeisMealEntry[] {
  const rows = extractRows(json, "mealServiceDietInfo");
  return rows.map((r) => {
    const rawMenu = str(r.DDISH_NM).replace(/<br\s*\/?>/gi, "\n").trim();
    const calInfo = str(r.CAL_INFO).trim();
    // NTR_INFO 는 <br/> 구분 영양항목 목록 — 줄바꿈으로 정규화(코드/괄호는 보존).
    const ntrInfo = str(r.NTR_INFO).replace(/<br\s*\/?>/gi, "\n").trim();
    return {
      date: neisDate(str(r.MLSV_YMD)),
      mealType: str(r.MMEAL_SC_NM).trim(),
      menu: cleanMealMenu(str(r.DDISH_NM)),
      rawMenu,
      calInfo: calInfo.length > 0 ? calInfo : null,
      ntrInfo: ntrInfo.length > 0 ? ntrInfo : null,
    };
  });
}

// ── 학교 검색 ──

export function parseSchoolInfo(json: unknown): NeisSchoolInfo[] {
  const rows = extractRows(json, "schoolInfo");
  return rows.map((r) => ({
    officeCode: str(r.ATPT_OFCDC_SC_CODE).trim(),
    schoolCode: str(r.SD_SCHUL_CODE).trim(),
    name: str(r.SCHUL_NM).trim(),
  }));
}
