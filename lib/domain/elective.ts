/**
 * 선택과목 자가매핑 후보 도출 (QC v3 Part B, US-B13, AC-12.4).
 *
 * 공개 페이지의 학생은 (요일,교시)의 '선택과목' 칸을 자신이 듣는 과목으로 자가매핑한다.
 * 그 후보 목록은 = 해당 학년이 그 (요일,교시)에 제공하는 distinct 과목 중
 * '고정반(원반)' 으로 표시되지 않은 과목들이다.
 *
 * 순수 함수(외부 의존 없음) — 클라/서버 공용, 픽스처 단위 테스트 가능.
 */

/** 학년의 (요일,교시,과목) 단위 수업 제공. */
export interface GradeOffering {
  weekday: number;
  period: number;
  subjectName: string;
}

/**
 * 특정 (weekday, period) 에서 학생이 고를 수 있는 선택과목 후보를 도출한다.
 *  - 해당 (weekday, period) 의 제공 과목만 추린다.
 *  - 고정반 과목(fixedSubjects 에 포함)은 제외한다(이동반=선택과목만 남긴다).
 *  - 중복 과목명은 1개로 합친다. 결과는 과목명 오름차순.
 */
export function electiveCandidates(
  gradeOfferings: GradeOffering[],
  fixedSubjects: ReadonlySet<string> | string[],
  weekday: number,
  period: number,
): string[] {
  const fixed =
    fixedSubjects instanceof Set ? fixedSubjects : new Set(fixedSubjects);
  const seen = new Set<string>();
  for (const o of gradeOfferings) {
    if (o.weekday !== weekday || o.period !== period) continue;
    if (fixed.has(o.subjectName)) continue;
    seen.add(o.subjectName);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}
