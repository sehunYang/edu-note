/**
 * 학기계획 세부단원 도메인 (교실 2-2 수업계획 단계1, QC v4 US-2). 순수 함수.
 *
 * 6자리 코드 = 대단원(2자리)·중단원(2자리)·소단원(2자리) = major*10000 + mid*100 + minor.
 * 각 자리는 0..99. 차시계획에서 6자리 입력으로 단원을 자동 채운다(AC-1.6).
 */

/** 단원 번호 3요소(각 0..99). */
export interface UnitNumbers {
  majorNo: number;
  midNo: number;
  minorNo: number;
}

/** 6자리 코드 산출. major*10000 + mid*100 + minor. */
export function sixDigitCode({ majorNo, midNo, minorNo }: UnitNumbers): number {
  return majorNo * 10000 + midNo * 100 + minorNo;
}

/**
 * 6자리 코드를 대/중/소 번호로 분해. 정수·0..999999 범위·각 자리 0..99 검증.
 * 형식이 어긋나면(소수·음수·범위초과) null 을 반환한다(저장 차단 신호, AC-1.6).
 */
export function parseSixDigit(code: number): UnitNumbers | null {
  if (!Number.isInteger(code) || code < 0 || code > 999999) return null;
  const majorNo = Math.floor(code / 10000);
  const midNo = Math.floor((code % 10000) / 100);
  const minorNo = code % 100;
  if (majorNo > 99 || midNo > 99 || minorNo > 99) return null;
  return { majorNo, midNo, minorNo };
}

/** 6자리 코드를 가진 단원 정렬용 최소 형태. */
export interface CodedUnit {
  majorNo: number;
  midNo: number;
  minorNo: number;
}

/** 6자리 코드 오름차순 정렬(원본 불변, 새 배열 반환). */
export function sortUnitsByCode<T extends CodedUnit>(units: readonly T[]): T[] {
  return [...units].sort((a, b) => sixDigitCode(a) - sixDigitCode(b));
}

/**
 * 최소차시 초과 판정(AC-1.8). 실제 배정 차시 수가 단원의 최소차시보다 많으면
 * 학기 계획 변경이 필요하다(exceeded=true). 같거나 적으면 ok.
 */
export function validateMinOrdinals(
  unitMinOrdinals: number,
  actualOrdinalCount: number,
): { ok: boolean; exceeded: boolean } {
  const exceeded = actualOrdinalCount > unitMinOrdinals;
  return { ok: !exceeded, exceeded };
}
