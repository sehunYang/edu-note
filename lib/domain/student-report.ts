/**
 * 학생 분석 보고서 도메인 (교실 2-2 단계6). 순수 함수(네트워크·DB·AI 없음).
 *
 * 집계 입력 → 규칙기반 플래그 4종 산출. **AI 호출 일절 없음**(Principle 5, AC-R5):
 * 모든 진단은 결정론적 규칙으로만 계산된다(자연어 문장 생성 없음).
 *  - jipilTrend: 지필 중간→기말 환산점수 추이(up/down/flat/null).
 *  - observationShortage: 관찰 건수 임계 이하 경고.
 *  - performanceMissing: 미입력 수행항목 이름 목록.
 *  - sectionRank: 분반 코호트 대비 상/중/하(3분위).
 */

/** 지필 추이. 데이터 부족 시 null. */
export type JipilTrend = "up" | "down" | "flat" | null;

/** 분반 코호트 대비 위치. 점수·코호트 부재 시 null. */
export type SectionRank = "high" | "mid" | "low" | null;

/** 한 수행항목의 입력 여부(점수 또는 서술 중 하나라도 있으면 입력으로 간주). */
export interface PerformanceItemStatus {
  name: string;
  hasScore: boolean;
}

/** 보고서 플래그 묶음. */
export interface StudentReportFlags {
  jipilTrend: JipilTrend;
  observationShortage: boolean;
  performanceMissing: string[];
  sectionRank: SectionRank;
}

/**
 * 지필 추이. 중간·기말 환산점수 중 하나라도 null 이면 비교 불가 → null.
 * 둘 다 있으면 기말 vs 중간 비교: 상승 up / 하락 down / 동일 flat.
 */
export function jipilTrend(
  midConverted: number | null,
  finalConverted: number | null,
): JipilTrend {
  if (midConverted === null || finalConverted === null) return null;
  if (finalConverted > midConverted) return "up";
  if (finalConverted < midConverted) return "down";
  return "flat";
}

/**
 * 관찰 부족 경고. 관찰 건수가 임계(기본 1) 이하면 true.
 * 기본값 1 → 0건·1건이면 경고(관찰이 거의 없는 학생 환기).
 */
export function observationShortage(count: number, threshold = 1): boolean {
  return count <= threshold;
}

/**
 * 미입력 수행항목 목록. 점수·서술 둘 다 없는(hasScore=false) 항목 이름만 반환.
 * 입력 순서 보존.
 */
export function performanceMissing(
  items: PerformanceItemStatus[],
): string[] {
  return items.filter((i) => !i.hasScore).map((i) => i.name);
}

/**
 * 분반 코호트 대비 3분위 위치. studentScore 없거나 cohortScores 비면 null.
 *
 * 결정론적 정의(경계 포함 규칙 명시):
 *  - cohortScores 를 오름차순 정렬한 분포에서 studentScore 의 백분위
 *    pct = (studentScore 미만 점수 개수) / (코호트 크기) ∈ [0,1) 를 산출.
 *  - pct >= 2/3 → "high", pct < 1/3 → "low", 그 사이 → "mid".
 *  - cohort 는 학생 본인 점수를 **포함**해 전달한다(getStudentReport 에서 보장).
 *    동점이면 "미만" 카운트가 같아져 같은 등급으로 결정론적 분류.
 *
 * 예: cohort=[10,20,30], student=30 → 미만 2개 → pct=2/3 → high.
 *     cohort=[10,20,30], student=10 → 미만 0개 → pct=0   → low.
 *     cohort=[10,20,30], student=20 → 미만 1개 → pct=1/3 → mid.
 */
export function sectionRank(
  studentScore: number | null,
  cohortScores: number[],
): SectionRank {
  if (studentScore === null || cohortScores.length === 0) return null;
  const below = cohortScores.filter((s) => s < studentScore).length;
  const pct = below / cohortScores.length;
  if (pct >= 2 / 3) return "high";
  if (pct < 1 / 3) return "low";
  return "mid";
}
