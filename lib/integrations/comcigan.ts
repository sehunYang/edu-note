/**
 * 컴시간알리미 시간표 파서 (계획 §3.1/§3.3 B, §6 — 비공식·읽기전용 어댑터).
 *
 * 참고 구현: github.com/leegeunhyeok/comcigan-parser (의 edited 포크).
 * ⚠ 컴시간은 비공식 서비스라 base URL·페이지 구조·데이터 키가 수시로 바뀐다.
 * 2026-06 실측: 진입점이 comci.kr:4081 → **comci.net:4082** 로 이동, 데이터 키가
 * 동적(자료NNN)으로 바뀌고 교사명이 마스킹(예: "양세*")됨. 아래 파서는 현재 구조를
 * 구조적 탐지(키 이름 하드코딩 없이)로 디코딩한다. 깨지면 parse*가 throw → 호출측
 * fallback(수기 입력)·경고·감사로그(§6).
 *
 * 순수 함수만 모음(네트워크 없음 → 픽스처 테스트 가능). 서버 fetch 는
 * ./comcigan-client(server-only)에 격리. (Buffer/iconv 사용 → 서버/노드 전용)
 */
import iconv from "iconv-lite";

export const COMCIGAN_BASE = "http://comci.net:4082";
export const COMCIGAN_INIT_URL = `${COMCIGAN_BASE}/st`;

// ── 초기화 코드 추출 ──

export interface ComciganInit {
  /** school_ra 의 ajax url (예: "/36179?17384l"). */
  extractCode: string;
  /** sc_data('73629_',sc,1,'0') 인자 (예: ["73629_","sc","1","0"]). */
  scData: string[];
}

/** /st 진입 페이지(euc-kr)에서 식별 코드를 추출. 구조 변경 시 throw. */
export function parseInitPage(body: string): ComciganInit {
  const idx = body.indexOf("school_ra(sc)");
  const idx2 = body.indexOf("sc_data('");
  if (idx === -1 || idx2 === -1) {
    throw new Error(
      "컴시간 초기화 코드를 찾을 수 없습니다(서비스 구조 변경 가능).",
    );
  }
  const ra = body.substr(idx, 50).replace(" ", "").match(/url:'.(.*?)'/);
  const sc = body.substr(idx2, 30).replace(" ", "").match(/\(.*?\)/);
  if (!ra) throw new Error("school_ra url 코드 미발견.");
  if (!sc) throw new Error("sc_data 인자 미발견.");
  const scData = sc[0].replace(/[()]/g, "").replace(/'/g, "").split(",");
  return { extractCode: ra[1], scData };
}

/** 한글 키워드를 euc-kr 바이트의 %XX hex 로 인코딩(컴시간 검색 파라미터 형식). */
export function eucKrHex(keyword: string): string {
  let hex = "";
  for (const b of iconv.encode(keyword, "euc-kr")) {
    hex += "%" + b.toString(16);
  }
  return hex;
}

export function buildSearchUrl(init: ComciganInit, keyword: string): string {
  return COMCIGAN_BASE + init.extractCode + eucKrHex(keyword);
}

// ── 학교 검색 ──

export interface SchoolSearchRow {
  regionCode: number; // [0]
  region: string; // [1] 지역
  name: string; // [2] 학교명
  code: number; // [3] 학교코드(시간표 조회 키)
}

/** 컴시간 응답에서 마지막 '}' 까지 잘라 JSON 파싱(꼬리 잡음 제거). */
function sliceJson(body: string): string {
  return body.substr(0, body.lastIndexOf("}") + 1);
}

export function parseSchoolSearch(body: string): SchoolSearchRow[] {
  const json = JSON.parse(sliceJson(body)) as Record<string, unknown>;
  const arr = (json["학교검색"] as unknown[]) ?? [];
  return arr.map((r) => {
    const row = r as [number, string, string, number];
    return { regionCode: row[0], region: row[1], name: row[2], code: row[3] };
  });
}

/** 검색 결과에서 정확히 1개를 요구(setSchool 의미). 0개/복수면 throw. */
export function requireSingleSchool(rows: SchoolSearchRow[]): SchoolSearchRow {
  if (rows.length === 0) throw new Error("검색된 학교가 없습니다.");
  if (rows.length > 1) {
    throw new Error(
      `검색된 학교가 많습니다(${rows.length}). 더 구체적인 학교명을 입력하세요.`,
    );
  }
  return rows[0];
}

// ── 시간표 URL ──

export function buildTimetableUrl(
  init: ComciganInit,
  schoolCode: number,
): string {
  const da1 = "0";
  const s7 = init.scData[0] + schoolCode;
  const path =
    init.extractCode.split("?")[0] +
    "?" +
    Buffer.from(s7 + "_" + da1 + "_" + init.scData[2]).toString("base64");
  return COMCIGAN_BASE + path;
}

// ── 시간표 디코딩 ──

export interface TimetableSlot {
  grade: number;
  classNo: number;
  weekday: number; // 1=월 .. 5=금
  period: number; // 1교시 ..
  subject: string;
  teacher: string; // 학생뷰는 마스킹됨(예: "양세*")
  code: number; // 원본 코드(teacher*1000+subject)
}

export interface DecodedTimetable {
  schoolName: string;
  teachers: string[]; // index 로 참조
  subjects: string[]; // index 로 참조
  classCount: number[]; // [_, 1학년반수, 2학년반수, ...]
  classTimes: string[]; // 교시별 시작시간 "1(08:50)" ...
  slots: TimetableSlot[];
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/**
 * 교사별 시간표 배열(자료542) 판별: 길이 ≈ 교사수+1, 요소가 [요일수, 요일배열…] 중첩.
 * (학급별 배열 자료481 은 길이가 학년수+1 이라 길이로 구분된다.)
 */
function isTeacherTimetable(v: unknown[], teacherCount: number): boolean {
  if (Math.abs(v.length - (teacherCount + 1)) > 1) return false;
  for (let i = 1; i < v.length; i++) {
    const e = v[i];
    if (Array.isArray(e)) return Array.isArray(e[1]); // [요일수, [교시수, code…], …]
  }
  return false;
}

/**
 * 컴시간 응답 JSON(동적 키)에서 교사/과목/**교사별 시간표(자료542)**를 구조적으로
 * 탐지·디코딩. 키 이름(자료NNN)을 하드코딩하지 않는다.
 *
 * ⚠ 학급별 배열(자료481, `교사×1000+과목`)은 **반을 섞는 선택과목(물Ⅱ·생활과학 등)을
 * 누락**한다. 교사별 배열(자료542)은 선택과목 포함 교사의 전체 수업을 담으며,
 * 인코딩이 다르다: **`code = 과목index×1000 + (학년×100 + 반)`**.
 * `>`로 시작하는 문자열 값은 **금주 변경분(보강 등)**이라 정규 시간표에서 제외한다.
 */
export function decodeTimetable(raw: unknown): DecodedTimetable {
  const result = raw as Record<string, unknown>;
  const teacherCount = Number(result["교사수"] ?? 0);
  const classCount = (result["학급수"] as number[]) ?? [];
  // ⚠ "전체학년" 은 숫자가 아니라 학년별 플래그 배열([0,1,1,1])일 수 있어 신뢰 불가.
  const maxGrade = classCount.length > 1 ? classCount.length - 1 : 3;

  let teachers: string[] | null = null;
  let subjects: string[] | null = null;
  let teacherTT: unknown[] | null = null;

  for (const key of Object.keys(result)) {
    if (key.indexOf("자료") === -1) continue;
    const v = result[key];
    if (!Array.isArray(v)) continue;

    // 교사명: 문자열 배열, 길이 ≈ 교사수+1
    if (!teachers && isStringArray(v) && Math.abs(v.length - (teacherCount + 1)) <= 1) {
      teachers = v;
      continue;
    }
    // 과목: v[0]=개수(number), v[1]=문자열
    if (!subjects && typeof v[0] === "number" && typeof v[1] === "string") {
      subjects = v as string[];
      continue;
    }
    // 교사별 시간표(자료542): 길이 ≈ 교사수+1, 요소가 중첩 요일배열
    if (!teacherTT && isTeacherTimetable(v, teacherCount)) {
      teacherTT = v;
      continue;
    }
  }

  if (!teachers || !subjects || !teacherTT) {
    throw new Error(
      "컴시간 시간표 자료 구조를 해석하지 못했습니다(서비스 포맷 변경 가능).",
    );
  }

  const slots: TimetableSlot[] = [];
  for (let ti = 1; ti < teacherTT.length; ti++) {
    const td = teacherTT[ti];
    const teacher = teachers[ti];
    if (!Array.isArray(td) || !teacher) continue;
    for (let weekday = 1; weekday <= 5; weekday++) {
      const day = td[weekday];
      if (!Array.isArray(day)) continue;
      const periods = day[0];
      for (let period = 1; period <= periods; period++) {
        const code = day[period];
        // 숫자만 정규 수업. `>` 변경분(string)·0(공강)은 제외.
        if (typeof code !== "number" || !code) continue;
        const subjectIdx = Math.floor(code / 1000);
        const gc = code % 1000;
        const grade = Math.floor(gc / 100);
        const classNo = gc % 100;
        const subject = subjects[subjectIdx];
        if (!subject) continue;
        if (grade < 1 || grade > maxGrade || classNo < 1) continue;
        slots.push({
          grade,
          classNo,
          weekday,
          period,
          subject: subject.replace(/_/g, ""),
          teacher,
          code,
        });
      }
    }
  }

  return {
    schoolName: String(result["학교명"] ?? ""),
    teachers,
    subjects,
    classCount,
    classTimes: (result["일과시간"] as string[]) ?? [],
    slots,
  };
}

// ── 교사 매칭(학생뷰 마스킹 대응) ──

/** 마스킹된 교사명("양세*")이 전체 이름("양세훈")과 일치하는지. */
export function teacherNameMatches(masked: string, fullName: string): boolean {
  const prefix = masked.replace(/\*+$/, "");
  if (prefix.length === 0) return false;
  return fullName.startsWith(prefix) && fullName.length === masked.length;
}

/** 특정 교사(전체 이름)의 수업 슬롯만 추출. 마스킹된 학생뷰와도 매칭. */
export function teacherSlots(
  decoded: DecodedTimetable,
  teacherFullName: string,
): TimetableSlot[] {
  return decoded.slots.filter((s) => teacherNameMatches(s.teacher, teacherFullName));
}
