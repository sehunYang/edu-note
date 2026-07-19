/**
 * 과목별 안정 색 팔레트 단일 정의. 오늘의학교 "오늘 시간표" 카드(교사)와 학생
 * 공개 페이지 시간표/오늘 요약이 공유한다. neutral-friendly 톤 + 다크 디자인에서
 * remap 된 hue 만 사용(event-kind-display 와 동일 원칙 — fuchsia/indigo 등 금지).
 */
export const SUBJECT_COLORS = [
  "bg-rose-50 border-rose-200 text-rose-700",
  "bg-sky-50 border-sky-200 text-sky-700",
  "bg-amber-50 border-amber-200 text-amber-700",
  "bg-emerald-50 border-emerald-200 text-emerald-700",
  "bg-violet-50 border-violet-200 text-violet-700",
  "bg-cyan-50 border-cyan-200 text-cyan-700",
  "bg-orange-50 border-orange-200 text-orange-700",
  "bg-teal-50 border-teal-200 text-teal-700",
] as const;

/**
 * 과목명 등장순 안정 색 배정. 같은 목록이면 항상 같은 결과(호출부는 렌더마다
 * 호출해도 안전). 중복 과목명은 첫 등장 색을 유지하고 8색 초과 시 순환한다.
 */
export function assignSubjectColors(
  orderedNames: string[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const name of orderedNames) {
    if (!map.has(name)) {
      map.set(name, SUBJECT_COLORS[map.size % SUBJECT_COLORS.length]);
    }
  }
  return map;
}
