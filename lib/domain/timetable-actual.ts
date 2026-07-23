/**
 * NEIS '이번 주 실제' 시간표 오버레이 판정(순수 함수).
 *
 * 배경: 표준(컴시간)과 NEIS 는 과목 어휘가 체계적으로 다르다(축약 vs 정식명 —
 * 예: 일어↔일본어, 생명↔생명과학, 운건↔운동과 건강, 영ⅠA↔영어Ⅰ). 두 문자열을
 * 사전 없이 통일할 수 없으므로 "표준과 다르다"만으로 강조하면 정규과목 대부분이
 * 오탐된다. 대신 학생이 실제로 알아야 할 신호 = **그 교시가 정규수업이 아니라
 * 특별활동·행사·시험·휴업 등으로 대체된 경우**만 강조한다(진로활동·제헌절 등).
 * 정규과목 간 표기 차이는 강조하지 않는다.
 */

// 특별(비정규 수업) 표식 — 부분일치. 한국 고교의 표준 표기 기준.
const SPECIAL_KEYWORDS = [
  "활동", // 자율활동·진로활동·동아리활동·봉사활동
  "창체",
  "창의적",
  "재량",
  "체험",
  "봉사",
  "행사",
  "시험",
  "평가", // 지필평가·수행평가
  "고사", // 모의고사
  "모의",
  "수능",
  "보강",
  "자습",
  "자율",
  "진로",
  "동아리",
  "방학",
  "휴업",
  "수련",
  "현장",
  "견학",
  "소풍",
  "대회",
  "축제",
  "연수",
];

/**
 * NEIS 수업내용이 '특별활동/행사'(정규수업 대체)인지. 정규 교과목명은 false.
 * - 위 키워드 부분일치, 또는 공휴일/기념일(…절)·의식(…식: 입학식/졸업식/시업식) 패턴.
 *   ('회'로 끝나는 건 '사회' 오탐 때문에 제외 — 대회/축제는 키워드로 별도 포함.)
 */
export function isSpecialTimetableEntry(subject: string): boolean {
  const s = subject.trim();
  if (s.length === 0) return false;
  if (SPECIAL_KEYWORDS.some((k) => s.includes(k))) return true;
  // 공휴일·기념일(…절), 의식(…식). 한국 고교 교과목은 이 어미로 끝나지 않는다.
  if (/절$/.test(s)) return true;
  if (/식$/.test(s)) return true;
  return false;
}

/**
 * NEIS 항목이 '방학'인지(여름방학·겨울방학·재량휴업일 등 수업이 아예 없는 날).
 * 특별활동(★ 강조)과 달리 이건 **그 날/요일에 수업 자체가 없다**는 뜻이라, 표준 시간표를
 * 덧칠 강조가 아니라 통째로 '방학'으로 대체해야 한다(사용자 요구: 방학은 그냥 방학으로).
 *
 * 판정은 academic_vacations(교사 입력)가 아니라 NEIS 실제를 쓴다: 방학식날(예 7/21)은
 * academic_vacations 시작일에 걸쳐도 오전 정규수업이 있어 경계가 부정확하지만, NEIS 는
 * 그 날 실제(7/21=수업, 7/22~=여름방학)를 반별로 정확히 담는다.
 */
export function isVacationEntry(subject: string): boolean {
  return /방학|휴업/.test(subject.trim());
}

/**
 * NEIS 이번 주 실제에서 '방학 요일' 집합(1=월..5=금). 그 요일에 슬롯이 하나라도 있고
 * **전부** 방학이면 방학 요일. 데이터 없는 요일(미동기화·주말)은 판정하지 않는다.
 * 학생 시간표 요일 뷰가 이 집합으로 해당 요일을 통째로 '방학'으로 표시한다.
 *
 * ⚠ 범위는 **이번 주 한정**이다. 방학 중엔 daily-brief 크론이 비수업일이라 NEIS 를 갱신하지
 * 않아, 다음 주(미래 방학주)는 actual 이 비어 판정이 ∅ → 표준 시간표가 다시 보인다. 즉
 * '방학이 이번 주에 시작하는 경우'만 커버한다(원 신고 케이스). 방학 전체 기간을 덮으려면
 * academic_vacations 를 학생 payload 로 넘겨 날짜 기반으로 판정해야 한다(후속 과제).
 */
export function vacationWeekdays(actual: OverlaySlot[]): Set<number> {
  const has = new Map<number, boolean>(); // 요일 → (지금까지 전부 방학인가)
  const seen = new Set<number>();
  for (const a of actual) {
    const v = a.subject.trim();
    if (!v) continue;
    seen.add(a.weekday);
    const prev = has.get(a.weekday);
    const isVac = isVacationEntry(v);
    has.set(a.weekday, prev === undefined ? isVac : prev && isVac);
  }
  const result = new Set<number>();
  for (const wd of seen) if (has.get(wd)) result.add(wd);
  return result;
}

/** 날짜(YYYY-MM-DD)가 방학 구간 중 하나에 포함되는지(양끝 포함). */
export function isDateInVacation(
  date: string,
  spans: { start: string; end: string }[],
): boolean {
  return spans.some((s) => date >= s.start && date <= s.end);
}

/**
 * 이번 주 요일별 방학 판정(1=월..5=금). **NEIS 실제 우선, academic_vacations 날짜 폴백**.
 *
 *  - 그 요일에 NEIS 데이터가 있으면 그걸로 판정(경계 정확 — 방학식날 오전수업 등을 살린다).
 *  - NEIS 데이터가 없으면(방학 중엔 크론이 갱신을 스킵) 그 요일 날짜가 방학 구간에 들면 방학.
 *
 * 이 조합이 vacationWeekdays 의 '이번 주 한정' 한계를 없앤다: 미래 방학주는 NEIS 가 비어도
 * 날짜로 방학 판정된다. weekdayIso = 요일→이번주 YYYY-MM-DD(호출측이 KST 로 산출).
 */
export function resolveVacationWeekdays(
  actual: OverlaySlot[],
  weekdayIso: Record<number, string>,
  spans: { start: string; end: string }[],
): Set<number> {
  const neisVac = vacationWeekdays(actual);
  const neisDays = new Set<number>();
  for (const a of actual) if (a.subject.trim()) neisDays.add(a.weekday);

  const result = new Set<number>();
  for (let wd = 1; wd <= 5; wd++) {
    if (neisDays.has(wd)) {
      if (neisVac.has(wd)) result.add(wd); // NEIS 우선
    } else {
      const date = weekdayIso[wd];
      if (date && isDateInVacation(date, spans)) result.add(wd); // 날짜 폴백
    }
  }
  return result;
}

// ── 주간 오버레이 분류(표준↔NEIS 변화 감지) ──────────────────────────────
//
// 목표: NEIS 실제가 표준(컴시간)과 다른 '모든 변화'를 강조하되, 어휘 표기차
// (일어↔일본어 등)로 인한 오탐은 제거한다. 사전 없이 통일 불가능하므로 **주간
// 데이터에서 과목 별칭을 학습**한다: 한 표준과목(일어)이 주중 여러 칸에 나오고
// 대부분 칸에서 NEIS 가 같은 이름(일본어)을 쓰므로, 최빈값으로 일어→일본어 별칭을
// 자동 도출한다. 그 뒤 별칭으로 정규화해 실제 변화만 남긴다.

export type OverlayKind = "special" | "swap" | "changed" | "none";
export interface OverlaySlot {
  weekday: number;
  period: number;
  subject: string;
}
export interface OverlayResult {
  kind: OverlayKind;
  actual: string; // NEIS 실제 과목(표시용)
}
/** 별칭 학습용 (표준과목 std, NEIS 과목 act, 동시등장 횟수 count) 쌍. */
export interface AliasPair {
  std: string;
  act: string;
  count: number;
}

const cellKey = (weekday: number, period: number) => `${weekday}::${period}`;

/** std→act 카운트 맵에서 최빈 act 를 뽑아 별칭 맵 완성(동점은 먼저 큰 값). */
function modeAliasMap(
  counts: Map<string, Map<string, number>>,
): Map<string, string> {
  const alias = new Map<string, string>();
  for (const [std, m] of counts) {
    let best: string | undefined;
    let bestCount = -1;
    for (const [a, c] of m) {
      if (c > bestCount) {
        bestCount = c;
        best = a;
      }
    }
    if (best !== undefined) alias.set(std, best);
  }
  return alias;
}

/**
 * 표준↔NEIS 과목 별칭 학습(std → 정규(특별 아닌) NEIS 최빈 과목). standard(요일·교시)와
 * actual 슬롯을 같은 칸에서 짝지어 센다. **여러 주치 actual** 을 넣을수록 최빈값이 안정적
 * (오탐·표본부족 방지) — 크론이 누적한 과거 주 NEIS 를 통째로 넣는 것을 권장.
 */
export function learnSubjectAliases(
  standard: OverlaySlot[],
  actual: OverlaySlot[],
): Map<string, string> {
  const stdBy = new Map<string, string>();
  for (const s of standard) {
    const v = s.subject.trim();
    if (v) stdBy.set(cellKey(s.weekday, s.period), v);
  }
  const counts = new Map<string, Map<string, number>>();
  for (const a of actual) {
    const act = a.subject.trim();
    if (!act || isSpecialTimetableEntry(act)) continue;
    const std = stdBy.get(cellKey(a.weekday, a.period));
    if (!std) continue;
    let m = counts.get(std);
    if (!m) counts.set(std, (m = new Map()));
    m.set(act, (m.get(act) ?? 0) + 1);
  }
  return modeAliasMap(counts);
}

/**
 * SQL 에서 사전 집계한 (std, act, count) 쌍으로 별칭 맵 구성(get_public_page 경유).
 * 특별활동 act 는 제외하고 std 별 최빈 정규 과목을 별칭으로 삼는다.
 */
export function buildAliasMapFromPairs(pairs: AliasPair[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const p of pairs) {
    const std = p.std.trim();
    const act = p.act.trim();
    if (!std || !act || isSpecialTimetableEntry(act)) continue;
    let m = counts.get(std);
    if (!m) counts.set(std, (m = new Map()));
    m.set(act, (m.get(act) ?? 0) + p.count);
  }
  return modeAliasMap(counts);
}

/**
 * 표준 주간 시간표와 NEIS 이번주 실제를 비교해, 표준 칸별로 '변화'를 분류한다.
 * 반환: `${weekday}::${period}` → { kind, actual }. 변화 없는(별칭 정규화 후 동일) 칸은
 * 결과에 없음. 표준 칸 기준으로만 판정한다(정규 빈 교시에 실제가 있어도 미표시).
 *
 * aliasMap: 누적 주간으로 학습한 별칭(권장). 없으면 actual(이번 주)만으로 학습(폴백).
 *
 * kind:
 *  - special: 실제가 특별활동/행사(진로활동·제헌절·여름방학·보강 등)
 *  - swap:    실제가 같은 요일 '다른 교시'의 표준 과목과 일치(교시 교환)
 *  - changed: 그 외 정규과목 대체(다른 과목으로 바뀜)
 *  - none:    그 요일에 NEIS 데이터는 있는데 이 교시만 없음 = **수업이 사라짐**(단축·조기하교)
 *
 * ⚠ '무데이터'와 '수업 없음'을 구분한다. 요일 전체가 NEIS 에 없으면(미동기화·주말) 판정을
 * 포기하고 표준을 그대로 보여주지만, 그 요일에 다른 교시가 있는데 이 교시만 비었다면 그건
 * 단축수업으로 없어진 교시다. 이전에는 둘 다 '변화 없음'이라 방학식날 4교시가 정상 수업처럼
 * 표시됐다(2026-07-21 실측).
 */
export function classifyWeeklyOverlay(
  standard: OverlaySlot[],
  actual: OverlaySlot[],
  aliasMap?: Map<string, string>,
): Map<string, OverlayResult> {
  const stdBy = new Map<string, string>();
  for (const s of standard) {
    const v = s.subject.trim();
    if (v) stdBy.set(cellKey(s.weekday, s.period), v);
  }
  const actBy = new Map<string, string>();
  // 요일별 NEIS 최대 교시. 0(=무데이터)이면 그 요일은 판정 자체를 포기한다.
  const actMaxPeriod = new Map<number, number>();
  for (const a of actual) {
    const v = a.subject.trim();
    if (v) {
      actBy.set(cellKey(a.weekday, a.period), v);
      actMaxPeriod.set(a.weekday, Math.max(actMaxPeriod.get(a.weekday) ?? 0, a.period));
    }
  }

  // 별칭: 누적 학습 맵이 있으면 사용, 없으면 이번 주 actual 로 학습(하위호환 폴백).
  const alias = aliasMap ?? learnSubjectAliases(standard, actual);
  const aliasOf = (std: string): string | undefined => alias.get(std);
  // 표준과 실제가 (별칭 포함) 같은 과목인지.
  const sameSubject = (std: string, act: string): boolean =>
    act === std || aliasOf(std) === act;

  // 요일별 표준 과목 목록(교환 탐지용).
  const stdByWeekday = new Map<number, { period: number; subject: string }[]>();
  for (const s of standard) {
    const v = s.subject.trim();
    if (!v) continue;
    const arr = stdByWeekday.get(s.weekday) ?? [];
    arr.push({ period: s.period, subject: v });
    stdByWeekday.set(s.weekday, arr);
  }

  const result = new Map<string, OverlayResult>();
  // 표준 칸 기준으로 순회(빈 교시에 실제가 있어도 미표시 — 범위 한정).
  for (const [k, std] of stdBy) {
    const [wd, p] = k.split("::").map(Number);
    const act = actBy.get(k);
    if (act == null) {
      // 그 요일 자체가 NEIS 에 없으면 판정 불가 → 표준 폴백.
      const maxAct = actMaxPeriod.get(wd) ?? 0;
      if (maxAct === 0) continue;
      // **뒤쪽 절삭만** 단축으로 본다(p > 그날 NEIS 최대 교시). 중간이 비는 건 학교마다
      // 창체·방과후를 NEIS 에 안 올리는 등록 관행이라 오탐이 된다 — 그 경우 표준 폴백.
      if (p <= maxAct) continue;
      result.set(k, { kind: "none", actual: "" });
      continue;
    }
    if (sameSubject(std, act)) continue; // 별칭 정규화 후 동일 → 변화 없음

    let kind: OverlayKind;
    if (isSpecialTimetableEntry(act)) {
      kind = "special";
    } else {
      const sameDay = stdByWeekday.get(wd) ?? [];
      const swapped = sameDay.some(
        (o) => o.period !== p && sameSubject(o.subject, act),
      );
      kind = swapped ? "swap" : "changed";
    }
    result.set(k, { kind, actual: act });
  }
  return result;
}
