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
  /**
   * 원본 코드. ⚠ 인코딩이 출처마다 다르다 — `slots`(자료542)는 `과목×1000+학년·반`,
   * `classSlots`(자료481)는 학기 데이터에 따라 `교사×1000+과목` 또는 `과목×1000+교사`
   * (2026-08 2학기 데이터에서 방향이 뒤집힌 것을 실측 — decodeTimetable 이 자동 판별).
   * 두 목록을 합치거나 code 로 비교하지 말 것.
   */
  code: number;
}

/** 동시그룹(이동수업 묶음) 1건 — 같은 시간에 함께 도는 (과목, 개설 교실). */
export interface SimultaneousOffering {
  grade: number;
  classNo: number;
  subjectName: string;
}

export interface DecodedTimetable {
  schoolName: string;
  teachers: string[]; // index 로 참조
  subjects: string[]; // index 로 참조
  classCount: number[]; // [_, 1학년반수, 2학년반수, ...]
  classTimes: string[]; // 교시별 시작시간 "1(08:50)" ...
  /** 교사별 배열(자료542) 기반 — **금주 반영본**(보강·변경 적용, 축소 주간엔 조각남). */
  slots: TimetableSlot[];
  /**
   * 학급별 배열(자료481) 기반 — **원본 표준 주간표**(변경 무관, 방학 중에도 온전).
   * 탐지 실패 시 빈 배열(호출측이 안내). 담임반 표준 시간표의 정답 소스.
   */
  classSlots: TimetableSlot[];
  /**
   * 동시그룹(이동수업 묶음, 2026-08 2학기 데이터부터 등장) — 각 그룹은 같은 시간에
   * 함께 도는 (과목, 개설 교실) 목록. 어떤 반의 그리드 과목이 여기 등장하면 그 칸은
   * 그 반 학생들이 흩어지는 **선택(이동반)** 이다. 키 부재(구형 데이터)면 빈 배열.
   */
  simultaneousGroups: SimultaneousOffering[][];
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
 * 학급별 시간표 배열(자료481/자료147) 판별: 길이 = 학년수+1, `v[학년][0]` = 그 학년의
 * 반 수(학급수와 일치), `v[학년][반]` = [요일수, [교시수, code…], …].
 *
 * ⚠ 자료481(원본)과 자료147(금주 변경분)은 **형태가 완전히 동일**해서 모양만으로는
 * 구분되지 않는다. 구분 기준은 값의 타입뿐 — 변경분은 `">27062"` 처럼 문자열이 섞인다
 * (→ allNumericCodes 로 가려낸다).
 */
function isClassTimetable(v: unknown[], classCount: number[]): boolean {
  if (classCount.length < 2 || v.length !== classCount.length) return false;
  for (let g = 1; g < v.length; g++) {
    // 반 수 0인 학년(미개설·패딩)은 판별에서 제외 — 있어도 배열 전체를 버리지 않는다.
    if (classCount[g] === 0) continue;
    const gd = v[g];
    if (!Array.isArray(gd)) return false;
    if (gd[0] !== classCount[g]) return false; // 반 수 일치(강한 판별자)
    const cd = gd[1];
    if (!Array.isArray(cd)) return false;
    if (typeof cd[0] !== "number") return false; // 요일수
    const day = cd[1];
    if (!Array.isArray(day) || typeof day[0] !== "number") return false; // 교시수
  }
  return true;
}

/**
 * 학급별 배열의 실제 수업 코드 수(0·문자열 제외). 원본(자료481)과 변경분(자료147)을
 * 가르는 최종 기준.
 *
 * ⚠ "문자열이 섞였는가"만으로 가르면 안 된다: 그 주에 학교 전체 변경이 0건이면 자료147도
 * 전부 숫자(대개 0)라 선착순으로 잘못 채택될 수 있고, 그러면 정상 시간표가 조각으로
 * 덮어써진다(이 커밋이 없애려던 바로 그 손상). 코드 수가 최대인 배열을 고르면 무변경 주에도
 * 안전하다 — 변경분은 언제나 원본의 부분집합이다.
 */
function countCodes(v: unknown[]): number {
  let n = 0;
  for (let g = 1; g < v.length; g++) {
    const gd = v[g];
    if (!Array.isArray(gd)) continue;
    for (let c = 1; c < gd.length; c++) {
      const cd = gd[c];
      if (!Array.isArray(cd)) continue;
      for (let d = 1; d < cd.length; d++) {
        const day = cd[d];
        if (!Array.isArray(day)) continue;
        for (let p = 1; p < day.length; p++) {
          if (typeof day[p] === "number" && day[p] !== 0) n += 1;
        }
      }
    }
  }
  return n;
}

/**
 * 컴시간 응답 JSON(동적 키)에서 교사/과목/**교사별 시간표(자료542)**를 구조적으로
 * 탐지·디코딩. 키 이름(자료NNN)을 하드코딩하지 않는다.
 *
 * 두 배열은 용도가 다르다. **둘 다 필요하며 서로 대체하지 못한다**(2026-07 실측):
 *
 * | | 자료542 교사별 → `slots` | 자료481 학급별 → `classSlots` |
 * |---|---|---|
 * | 인코딩 | `과목×1000 + (학년×100+반)` | `교사×1000+과목` 또는 `과목×1000+교사` — 학기 데이터마다 달라 자동 판별 (학년·반은 배열 위치) |
 * | 기준 주 | **금주 반영본**(보강·변경 적용) | **원본 표준**(변경 무관) |
 * | 선택과목 | 교사의 전체 수업 포함 | 반 기준으론 포함, **교사 기준으론 누락** |
 * | 용도 | 교사 본인 시간표·시수관리 | 담임반 표준(학생 공개 페이지) |
 *
 * 실측: 특정 교사의 일부 과목은 학급 그리드에서 다른 교사에게 귀속돼 교사별로 뽑으면
 * 물리 9칸만 나온다(→ 교사 경로는 542 유지). 반대로 542 는 금주 반영본이라 방학 주간엔
 * 전교 209칸/2개 요일로 쪼그라든다(원본은 893칸/5개 요일 → 담임반 경로는 481).
 *
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
  let classTT: unknown[] | null = null;
  let classTTCount = 0;

  for (const key of Object.keys(result)) {
    if (key.indexOf("자료") === -1) continue;
    const v = result[key];
    if (!Array.isArray(v)) continue;

    // 학급별 배열 후보(자료481 원본 / 자료147 금주 변경분): 형태가 같아 선착순으로 고르면
    // 안 된다. 후보를 모아 뒀다가 루프 뒤에서 코드 수가 최대인 것(=원본)을 채택한다.
    if (isClassTimetable(v, classCount)) {
      const n = countCodes(v);
      if (n > classTTCount) {
        classTT = v;
        classTTCount = n;
      }
      continue;
    }

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

  // 학급별 원본(자료481) → classSlots. 인코딩이 교사별과 다르고, **학기 데이터에 따라
  // 방향까지 뒤집힌다**: 2026-07 실측은 `교사×1000+과목`, 2026-08 2학기 데이터는
  // `과목×1000+교사` (뒤집힌 채 구형 해석을 쓰면 교사index 가 과목으로 읽혀 담임반
  // 시간표 전체가 엉뚱한 과목으로 저장된다). 학년·반은 배열 위치가 곧 좌표.
  // → 두 방향으로 디코딩해 (1) 자료542 와 같은 칸 과목 일치 수, (2) 유효 슬롯 수로
  //   더 그럴듯한 쪽을 채택한다. 방학 주간엔 542 가 조각이라 (1)이 0:0 일 수 있는데,
  //   그땐 (2)가 가른다(뒤집힌 해석은 index 초과로 슬롯이 덜 나온다).
  const decodeClassTT = (subjectFirst: boolean): TimetableSlot[] => {
    const out: TimetableSlot[] = [];
    if (!classTT) return out;
    for (let grade = 1; grade < classTT.length; grade++) {
      const gd = classTT[grade];
      if (!Array.isArray(gd)) continue;
      for (let classNo = 1; classNo < gd.length; classNo++) {
        const cd = gd[classNo];
        if (!Array.isArray(cd)) continue;
        for (let weekday = 1; weekday <= 5; weekday++) {
          const day = cd[weekday];
          if (!Array.isArray(day)) continue;
          const periods = day[0];
          for (let period = 1; period <= periods; period++) {
            const code = day[period];
            if (typeof code !== "number" || !code) continue; // 0=공강
            const subjectIdx = subjectFirst ? Math.floor(code / 1000) : code % 1000;
            const teacherIdx = subjectFirst ? code % 1000 : Math.floor(code / 1000);
            // subjects[0] 은 과목 '개수'(number)라 index 0 이면 숫자가 잡힌다 →
            // 타입까지 확인해야 .replace 에서 TypeError 로 액션이 죽지 않는다.
            const subject = subjects[subjectIdx];
            if (typeof subject !== "string" || !subject) continue;
            if (teacherIdx >= teachers.length) continue; // 방향이 틀리면 index 초과
            out.push({
              grade,
              classNo,
              weekday,
              period,
              subject: subject.replace(/_/g, ""),
              teacher: teachers[teacherIdx] ?? "",
              code,
            });
          }
        }
      }
    }
    return out;
  };
  // 자료542 와의 (학년,반,요일,교시)→과목 일치 수. 진짜 방향은 금주 반영본과 대체로 겹친다.
  const cellSubjects = new Map<string, Set<string>>();
  for (const s of slots) {
    const key = `${s.grade}:${s.classNo}:${s.weekday}:${s.period}`;
    let set = cellSubjects.get(key);
    if (!set) cellSubjects.set(key, (set = new Set()));
    set.add(s.subject);
  }
  const agreement = (cand: TimetableSlot[]): number => {
    let n = 0;
    for (const s of cand) {
      if (cellSubjects.get(`${s.grade}:${s.classNo}:${s.weekday}:${s.period}`)?.has(s.subject)) n++;
    }
    return n;
  };
  const teacherFirst = decodeClassTT(false);
  const subjectFirst = decodeClassTT(true);
  const agreeTF = agreement(teacherFirst);
  const agreeSF = agreement(subjectFirst);
  const classSlots =
    agreeSF !== agreeTF
      ? agreeSF > agreeTF
        ? subjectFirst
        : teacherFirst
      : subjectFirst.length > teacherFirst.length
        ? subjectFirst
        : teacherFirst;

  // 동시그룹(이동수업 묶음) — code 인코딩은 자료542 와 같은 `과목×1000+학년·반`.
  // 구형 데이터엔 키 자체가 없거나 비어 있다 → 빈 배열(호출측이 구형 판별로 폴백).
  const simultaneousGroups: SimultaneousOffering[][] = [];
  const groupsRaw = result["동시그룹"];
  if (Array.isArray(groupsRaw)) {
    for (const g of groupsRaw) {
      if (!Array.isArray(g)) continue;
      const entries: SimultaneousOffering[] = [];
      for (let i = 1; i < g.length; i++) {
        const code = g[i];
        if (typeof code !== "number" || !code) continue;
        const subject = subjects[Math.floor(code / 1000)];
        if (typeof subject !== "string" || !subject) continue;
        const gc = code % 1000;
        const grade = Math.floor(gc / 100);
        const classNo = gc % 100;
        if (grade < 1 || grade > maxGrade || classNo < 1) continue;
        entries.push({ grade, classNo, subjectName: subject.replace(/_/g, "") });
      }
      // 1건짜리는 '묶음'이 아니다(오파싱 노이즈 방지).
      if (entries.length >= 2) simultaneousGroups.push(entries);
    }
  }

  return {
    schoolName: String(result["학교명"] ?? ""),
    teachers,
    subjects,
    classCount,
    classTimes: (result["일과시간"] as string[]) ?? [],
    slots,
    classSlots,
    simultaneousGroups,
  };
}

/**
 * 전교 기준 요일 커버리지(1=월..5=금 중 수업이 있는 요일 수). 교사별 배열(자료542)은
 * **금주 반영본**이라 방학·시험·행사 주간엔 요일이 통째로 빈다 — 그 상태로 동기화하면
 * 정상 시간표가 조각으로 덮어써진다. 동기화 가드가 이 값으로 축소 주간을 판별한다.
 */
export function weekdayCoverage(slots: TimetableSlot[]): number {
  const days = new Set<number>();
  for (const s of slots) {
    if (s.weekday >= 1 && s.weekday <= 5) days.add(s.weekday);
  }
  return days.size;
}

// ── 교사 매칭(학생뷰 마스킹 대응) ──

/** 마스킹된 교사명("홍길*")이 전체 이름("홍길동")과 일치하는지. */
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
