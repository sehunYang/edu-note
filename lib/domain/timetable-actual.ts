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

// ── 주간 오버레이 분류(표준↔NEIS 변화 감지) ──────────────────────────────
//
// 목표: NEIS 실제가 표준(컴시간)과 다른 '모든 변화'를 강조하되, 어휘 표기차
// (일어↔일본어 등)로 인한 오탐은 제거한다. 사전 없이 통일 불가능하므로 **주간
// 데이터에서 과목 별칭을 학습**한다: 한 표준과목(일어)이 주중 여러 칸에 나오고
// 대부분 칸에서 NEIS 가 같은 이름(일본어)을 쓰므로, 최빈값으로 일어→일본어 별칭을
// 자동 도출한다. 그 뒤 별칭으로 정규화해 실제 변화만 남긴다.

export type OverlayKind = "special" | "swap" | "changed";
export interface OverlaySlot {
  weekday: number;
  period: number;
  subject: string;
}
export interface OverlayResult {
  kind: OverlayKind;
  actual: string; // NEIS 실제 과목(표시용)
}

const cellKey = (weekday: number, period: number) => `${weekday}::${period}`;

/**
 * 표준 주간 시간표와 NEIS 이번주 실제를 비교해, 표준 칸별로 '변화'를 분류한다.
 * 반환: `${weekday}::${period}` → { kind, actual }. 변화 없는(별칭 정규화 후 동일) 칸은
 * 결과에 없음. 표준 칸 기준으로만 판정한다(정규 빈 교시에 실제가 있어도 미표시).
 *
 * kind:
 *  - special: 실제가 특별활동/행사(진로활동·제헌절·여름방학·보강 등)
 *  - swap:    실제가 같은 요일 '다른 교시'의 표준 과목과 일치(교시 교환)
 *  - changed: 그 외 정규과목 대체(다른 과목으로 바뀜)
 */
export function classifyWeeklyOverlay(
  standard: OverlaySlot[],
  actual: OverlaySlot[],
): Map<string, OverlayResult> {
  const stdBy = new Map<string, string>();
  for (const s of standard) {
    const v = s.subject.trim();
    if (v) stdBy.set(cellKey(s.weekday, s.period), v);
  }
  const actBy = new Map<string, string>();
  for (const a of actual) {
    const v = a.subject.trim();
    if (v) actBy.set(cellKey(a.weekday, a.period), v);
  }

  // 별칭 학습: 표준과목 → 같은 칸의 (특별 아닌) NEIS 실제 최빈값.
  const pairCounts = new Map<string, Map<string, number>>();
  for (const [k, act] of actBy) {
    const std = stdBy.get(k);
    if (!std || isSpecialTimetableEntry(act)) continue;
    let m = pairCounts.get(std);
    if (!m) pairCounts.set(std, (m = new Map()));
    m.set(act, (m.get(act) ?? 0) + 1);
  }
  const aliasOf = (std: string): string | undefined => {
    const m = pairCounts.get(std);
    if (!m) return undefined;
    let best: string | undefined;
    let bestCount = -1;
    for (const [a, c] of m) {
      if (c > bestCount) {
        bestCount = c;
        best = a;
      }
    }
    return best;
  };
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
    const act = actBy.get(k);
    if (act == null) continue; // NEIS 무데이터 → 표준 폴백(변화 아님)
    if (sameSubject(std, act)) continue; // 별칭 정규화 후 동일 → 변화 없음

    const [wd, p] = k.split("::").map(Number);
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
