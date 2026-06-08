/**
 * CSV 임포트 공용 타입 (계획 §3.2 — 행 단위 오류 리포트).
 *
 * 검증 결과는 항상 "성공 행 + 행 단위 오류" 양쪽을 반환한다.
 * 일부 행이 틀려도 정상 행은 살리되, 오류는 행/필드 단위로 사용자에게 보고한다.
 */

/** 한 필드의 검증 오류. */
export interface FieldError {
  field: string;
  message: string;
}

/** 한 행(원본 CSV 행)의 오류 묶음. rowNumber 는 1-기반(헤더=1). */
export interface RowError {
  rowNumber: number;
  errors: FieldError[];
}

/** 엔티티 임포트 결과. rows = 검증 통과 행, errors = 행 단위 오류. */
export interface ImportResult<T> {
  rows: T[];
  errors: RowError[];
  /** 데이터 행 총 개수(헤더 제외, 성공+실패 합). */
  totalRows: number;
}

/** 헤더 누락 등 파일 전체 차원의 오류(행과 무관). */
export class CsvHeaderError extends Error {
  constructor(
    message: string,
    /** 누락된 필수 헤더 목록. */
    public readonly missing: string[] = [],
  ) {
    super(message);
    this.name = "CsvHeaderError";
  }
}
