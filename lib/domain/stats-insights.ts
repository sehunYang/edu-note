/**
 * 통계실 인사이트 도메인 (AD-1). 순수 함수(네트워크·DB 없음, 결정론적).
 *
 * 분포 통계·기록 커버리지·업무 진척 비율을 계산한다. 쿼리 계층은 행 수집만 하고
 * 임계값·집계 규칙은 전부 이 파일에 둔다(R10: 단위 테스트로 경계값 검증).
 */

/** 히스토그램 한 구간. */
export interface HistogramBin {
  label: string;
  count: number;
}

/** 분포 기초 통계. */
export interface BasicStats {
  mean: number;
  stddev: number;
  median: number;
  n: number;
}

/** 학생 1명의 기록 커버리지 집계 결과. */
export interface CoverageRow {
  studentYearId: string;
  studentName: string;
  counts: Record<string, number>;
  total: number;
}

/**
 * 점수 히스토그램. 구간은 **0을 기준으로 한 binSize 배수**로 고정한다
 * (환산점수 0~100 분포를 그대로 눈금에 맞추기 위함 — 관측 최솟값 기준으로 시작점을
 * 잡으면 분반마다 구간 경계가 달라져 화면 간 비교가 어려워진다).
 *
 * 구간 범위는 관측된 최솟값이 속한 구간부터 최댓값이 속한 구간까지이며, 그 사이에
 * 데이터가 0건인 구간도 빠짐없이 포함한다(연속 구간 보장). 각 구간은 `[lo, hi)`
 * 반개구간(하한 포함, 상한 미포함)으로 판정 — 최댓값도 자신이 속한 구간의 하한과
 * binSize 로 동일한 floor 연산을 거치므로 항상 포함된다.
 *
 * 빈 배열 입력 → 빈 배열 반환(구간을 만들 데이터가 없음).
 */
export function histogram(scores: number[], binSize: number): HistogramBin[] {
  if (scores.length === 0) return [];
  const minBin = Math.floor(Math.min(...scores) / binSize);
  const maxBin = Math.floor(Math.max(...scores) / binSize);
  const bins: HistogramBin[] = [];
  for (let b = minBin; b <= maxBin; b++) {
    const lo = b * binSize;
    const hi = lo + binSize;
    const count = scores.filter((s) => s >= lo && s < hi).length;
    bins.push({ label: `${lo}-${hi}`, count });
  }
  return bins;
}

/**
 * 평균·표준편차·중앙값. **stddev 는 모표준편차(population, n 으로 나눔)** —
 * 분반은 표본이 아니라 전수 집단이라는 확정 결정(v2/v3 changelog).
 *
 * 빈 배열 계약: `{ mean: 0, stddev: 0, median: 0, n: 0 }` (NaN 방지, 화면에서
 * "데이터 없음" 분기는 n===0 으로 판정).
 */
export function basicStats(scores: number[]): BasicStats {
  const n = scores.length;
  if (n === 0) return { mean: 0, stddev: 0, median: 0, n: 0 };

  const mean = scores.reduce((sum, s) => sum + s, 0) / n;
  const variance =
    scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);

  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const median = n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return { mean, stddev, median, n };
}

/**
 * 학생별 기록 유형(kind) 카운트 매트릭스. 정렬은 **합계 오름차순**(기록이 적은
 * 학생 = 최우선 점검 대상이 먼저 보이도록) — 동률이면 studentName 오름차순으로
 * 결정론적 tie-break.
 *
 * `allStudents`(선택)를 넘기면 4유형 전부 0건인 학생도 total=0 행으로 포함된다
 * (rows 는 "기록이 존재하는 건"만 들어오므로, 모든 유형이 0건인 학생은 rows 에
 * 아예 나타나지 않는다 — 커버리지 매트릭스의 목적이 "기록 부족 학생을 먼저
 * 보여주는 것"인데, 가장 부족한(0건) 학생이 조용히 누락되는 것을 방지). 생략하면
 * 기존 동작(rows 에 등장한 학생만 집계)과 동일하다.
 *
 * 빈 입력(allStudents 도 없음) → 빈 배열.
 */
export function coverageMatrix(
  rows: { studentYearId: string; studentName: string; kind: string }[],
  allStudents?: { studentYearId: string; studentName: string }[],
): CoverageRow[] {
  const byStudent = new Map<string, CoverageRow>();

  if (allStudents) {
    for (const s of allStudents) {
      byStudent.set(s.studentYearId, {
        studentYearId: s.studentYearId,
        studentName: s.studentName,
        counts: {},
        total: 0,
      });
    }
  }

  for (const row of rows) {
    let entry = byStudent.get(row.studentYearId);
    if (!entry) {
      entry = {
        studentYearId: row.studentYearId,
        studentName: row.studentName,
        counts: {},
        total: 0,
      };
      byStudent.set(row.studentYearId, entry);
    }
    entry.counts[row.kind] = (entry.counts[row.kind] ?? 0) + 1;
    entry.total += 1;
  }

  return Array.from(byStudent.values()).sort(
    (a, b) => a.total - b.total || a.studentName.localeCompare(b.studentName),
  );
}

/**
 * 완료율(진도율/세특완성률/신고서처리율 공용). `total===0` 이면 **명시적으로
 * null**을 반환한다(모수가 없는 분반/학기를 0%로 오인시키지 않기 위함 — 0과
 * null 을 화면에서 다르게 표시해야 함).
 */
export function completionRate(
  completed: number,
  total: number,
): number | null {
  if (total === 0) return null;
  return completed / total;
}
