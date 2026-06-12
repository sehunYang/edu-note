/**
 * 성적 CSV 임포트 (교실 2-2 단계4, AC-G1/G3/G5/G6).
 *
 * student-roster.ts 패턴을 따른다: `ImportResult<T>` shape(`{rows,errors,totalRows}`)
 * 반환, 행 단위 형식오류는 `errors[]` 채널(graceful), 헤더 별칭으로 컬럼 해석.
 * 학번→studentYearId 매핑은 쿼리 계층(grades.ts)이 담당하고, 여기서는 순수 파싱만.
 *
 * - 수행: 항목별 파일 (학번,이름,점수,서술)
 * - 지필: 과목×회차별 파일 (학번,이름,원점수)
 *
 * 예시 CSV(performanceCsvExample/jipilCsvExample)는 클라이언트 Blob 다운로드용
 * (정적 자산 부재 — roster import-form 패턴 확장).
 */
import { parseCsvRecords } from "./parse";
import { CsvHeaderError, type ImportResult, type FieldError } from "./types";

export interface PerformanceCsvRow {
  sid: string;
  name: string;
  score: number | null;
  prose: string | null;
}

export interface JipilCsvRow {
  sid: string;
  name: string;
  rawScore: number | null;
}

/** 한 필드에 허용되는 헤더 별칭(앞이 우선). 모두 trim 후 비교. */
const HEADER_ALIASES = {
  sid: ["학번"],
  name: ["이름", "성명"],
  score: ["점수", "수행점수", "득점"],
  prose: ["서술", "줄글", "관찰", "서술평가"],
  rawScore: ["원점수", "점수", "지필점수"],
} as const;

const SID_RE = /^[0-9]{5}$/;

/** records 헤더에서 각 필드명을 실제 CSV 헤더로 해석. 미발견은 null. */
function resolveColumn(
  headers: string[],
  aliases: readonly string[],
): string | null {
  for (const alias of aliases) {
    if (headers.includes(alias)) return alias;
  }
  return null;
}

function optional(raw: string): string | null {
  const v = raw.trim();
  return v.length === 0 ? null : v;
}

/** 학번 형식 검증(공통). 비어있음·5자리 위반은 fieldErrors 누적. 통과 시 trim 된 학번 반환. */
function validateSid(raw: string, errors: FieldError[]): string {
  const sid = raw.trim();
  if (sid.length === 0) {
    errors.push({ field: "학번", message: "학번이 비어 있습니다." });
  } else if (!SID_RE.test(sid)) {
    errors.push({
      field: "학번",
      message: `학번 형식 오류(5자리 숫자): "${sid}"`,
    });
  }
  return sid;
}

/**
 * 점수 셀 파싱. 공란은 null(미입력 허용), 비숫자는 형식오류로 누적.
 * 0~100 범위는 강제하지 않는다(weight 초과 경고는 저장 계층의 비차단 판단).
 */
function parseScore(
  raw: string,
  label: string,
  errors: FieldError[],
): number | null {
  const v = raw.trim();
  if (v.length === 0) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    errors.push({ field: label, message: `${label} 형식 오류(숫자 아님): "${v}"` });
    return null;
  }
  return n;
}

/** 수행 CSV 파싱 (학번,이름,점수,서술). 항목별 파일. */
export function parsePerformanceCsv(
  input: string,
): ImportResult<PerformanceCsvRow> {
  const { headers, records } = parseCsvRecords(input);

  const cols = {
    sid: resolveColumn(headers, HEADER_ALIASES.sid),
    name: resolveColumn(headers, HEADER_ALIASES.name),
    score: resolveColumn(headers, HEADER_ALIASES.score),
    prose: resolveColumn(headers, HEADER_ALIASES.prose),
  };

  // 필수 헤더(학번) 부재는 파일 차원 오류.
  if (cols.sid === null) {
    throw new CsvHeaderError("필수 헤더 누락: 학번", ["학번"]);
  }

  const rows: PerformanceCsvRow[] = [];
  const errors: ImportResult<PerformanceCsvRow>["errors"] = [];

  for (const rec of records) {
    const fieldErrors: FieldError[] = [];
    const get = (col: string | null) => (col ? rec.values[col] ?? "" : "");

    const sid = validateSid(get(cols.sid), fieldErrors);
    const score = parseScore(get(cols.score), "점수", fieldErrors);

    if (fieldErrors.length > 0) {
      errors.push({ rowNumber: rec.rowNumber, errors: fieldErrors });
      continue;
    }

    rows.push({
      sid,
      name: get(cols.name).trim(),
      score,
      prose: optional(get(cols.prose)),
    });
  }

  return { rows, errors, totalRows: records.length };
}

/** 지필 CSV 파싱 (학번,이름,원점수). 과목×회차별 파일. */
export function parseJipilCsv(input: string): ImportResult<JipilCsvRow> {
  const { headers, records } = parseCsvRecords(input);

  const cols = {
    sid: resolveColumn(headers, HEADER_ALIASES.sid),
    name: resolveColumn(headers, HEADER_ALIASES.name),
    rawScore: resolveColumn(headers, HEADER_ALIASES.rawScore),
  };

  if (cols.sid === null) {
    throw new CsvHeaderError("필수 헤더 누락: 학번", ["학번"]);
  }

  const rows: JipilCsvRow[] = [];
  const errors: ImportResult<JipilCsvRow>["errors"] = [];

  for (const rec of records) {
    const fieldErrors: FieldError[] = [];
    const get = (col: string | null) => (col ? rec.values[col] ?? "" : "");

    const sid = validateSid(get(cols.sid), fieldErrors);
    const rawScore = parseScore(get(cols.rawScore), "원점수", fieldErrors);

    if (fieldErrors.length > 0) {
      errors.push({ rowNumber: rec.rowNumber, errors: fieldErrors });
      continue;
    }

    rows.push({ sid, name: get(cols.name).trim(), rawScore });
  }

  return { rows, errors, totalRows: records.length };
}

/** 수행 예시 CSV(헤더+샘플행). 클라이언트 Blob 다운로드용(AC-G5). */
export function performanceCsvExample(): string {
  return (
    "학번,이름,점수,서술\n" +
    "10101,홍길동,18,실험 설계에서 변인 통제를 정확히 적용함\n" +
    "10102,김영희,20,모둠 토론에서 근거를 들어 주장을 전개함\n"
  );
}

/** 지필 예시 CSV(헤더+샘플행). 클라이언트 Blob 다운로드용(AC-G5). */
export function jipilCsvExample(): string {
  return "학번,이름,원점수\n" + "10101,홍길동,88\n" + "10102,김영희,92\n";
}
