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
 * 오버레이 강조 여부: NEIS 실제가 있고, 특별활동/행사이며, 표준 과목과 다를 때만.
 * (표준이 이미 같은 특별활동을 담고 있으면 강조 불필요.)
 */
export function shouldHighlightActual(
  standard: string,
  actual: string | undefined | null,
): boolean {
  if (actual == null) return false;
  const a = actual.trim();
  if (a.length === 0) return false;
  if (a === standard.trim()) return false;
  return isSpecialTimetableEntry(a);
}
