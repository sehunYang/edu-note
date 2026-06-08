/**
 * CSV 저수준 토크나이저 (계획 §3.5 /lib/csv, §3.2 CSV 업로드).
 *
 * RFC 4180 호환: 따옴표 필드, 필드 내 콤마/줄바꿈, `""` 이스케이프 처리.
 * 줄바꿈은 \r\n / \r / \n 모두 허용. 선행 BOM 제거.
 * 원본 파일은 저장하지 않는다(파싱 후 폐기 — 호출 측 책임).
 */

/** CSV 텍스트를 행×열 문자열 2차원 배열로 분해한다. 빈 입력은 []. */
export function parseCsv(input: string): string[][] {
  // BOM 제거
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  // 현재 행에 셀을 하나라도 시작했는지(완전 빈 줄 판별용)
  let started = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      started = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      started = true;
      endField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      // \r\n 은 한 번의 줄바꿈으로
      if (text[i + 1] === "\n") i += 1;
      endRow();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i += 1;
      continue;
    }
    field += ch;
    started = true;
    i += 1;
  }

  // 마지막 필드/행 마무리: 내용이 있거나 셀을 시작했으면 행으로 추가
  if (started || field.length > 0 || row.length > 0) {
    endRow();
  }

  // 완전 빈 줄(셀 1개에 빈 문자열) 제거
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/**
 * 헤더 행 + 데이터 행을 객체 배열로 변환한다.
 * 헤더는 trim 한다. 중복 헤더는 마지막 값이 우선.
 */
export interface CsvRecord {
  /** 1-기반 원본 행 번호(헤더=1, 첫 데이터행=2 …) — 오류 리포트용. */
  rowNumber: number;
  values: Record<string, string>;
}

export interface ParsedCsv {
  headers: string[];
  records: CsvRecord[];
}

export function parseCsvRecords(input: string): ParsedCsv {
  const matrix = parseCsv(input);
  if (matrix.length === 0) return { headers: [], records: [] };

  const headers = matrix[0].map((h) => h.trim());
  const records: CsvRecord[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r];
    const values: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      values[headers[c]] = (cells[c] ?? "").trim();
    }
    records.push({ rowNumber: r + 1, values });
  }
  return { headers, records };
}
