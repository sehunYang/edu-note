/**
 * 세특 일괄(bulk) CSV 왕복 (교실 2-2 단계7, AC-S1/S3/S4).
 *
 * 과목·분반 단위로 학생별 원천자료를 CSV로 내보내고(코워크 작성용), 결과 CSV를
 * 다시 받아 학번+과목 복합키로 매칭한다. 단일 학생 흐름(buildSourceBundle)을
 * 재사용하되 **점수를 명시적으로 제외**한다 — NEIS 기재요령상 세특/관찰 원천자료에는
 * 수행평가 점수·지필성적을 일절 포함하지 않는다(Pre-mortem #3, AC-S4).
 *
 * - 관찰: body(+keywords) 텍스트
 * - 수행: prose(서술)만 — score 필드 드롭
 * - 학생추가입력: studentExtraNotes(extraNotes)
 * - 지필: 일절 미포함(애초에 buildSourceBundle 에 없음)
 */
import { parseCsvRecords } from "@/lib/csv/parse";
import { CsvHeaderError, type ImportResult, type FieldError } from "@/lib/csv/types";
import type { SetechSourceBundle } from "./types";

/** 한 학생의 점수 제외 원천자료(일괄 CSV 한 행의 텍스트 재료). */
export interface BulkSetechSource {
  /** 관찰 기록 본문들. */
  observations: string[];
  /** 수행평가 서술(prose)만 — 점수 제외. */
  performanceProse: string[];
  /** 학생 추가입력(studentExtraNotes). */
  extraNotes: string[];
  /** 교과 키워드. */
  keywords: string[];
}

/**
 * buildSourceBundle 결과를 일괄 CSV 원천으로 변환한다.
 * **score 필드를 명시적으로 제거**하고 수행은 prose(서술)만 남긴다(AC-S4).
 * 빈 항목(공란 서술 등)은 제외한다.
 */
export function buildBulkSetechSource(
  bundle: SetechSourceBundle,
): BulkSetechSource {
  const performanceProse = bundle.performances
    // score 는 의도적으로 참조하지 않는다(기재요령 — 점수 제외).
    .map((p) => (p.prose ?? "").trim())
    .filter((s) => s.length > 0);

  return {
    observations: bundle.observations.map((o) => o.trim()).filter((s) => s.length > 0),
    performanceProse,
    extraNotes: bundle.extraNotes.map((e) => e.trim()).filter((s) => s.length > 0),
    keywords: [...new Set(bundle.keywords.map((k) => k.trim()).filter((s) => s.length > 0))],
  };
}

/** 일괄 CSV 한 행(과목·학생). source = 점수 제외 원천 텍스트. */
export interface BulkSourceRow {
  sid: string;
  name: string;
  subject: string;
  source: BulkSetechSource;
}

/** 일괄 결과 CSV 한 행(코워크 작성 결과). 학번+과목 복합키 + 세특 본문. */
export interface BulkResultRow {
  sid: string;
  subject: string;
  content: string;
}

const SID_RE = /^[0-9]{5}$/;

/** CSV 셀 이스케이프(콤마·따옴표·줄바꿈 포함 시 따옴표로 감싸고 `"`→`""`). */
function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * 점수 제외 원천 묶음을 사람이 읽을 한 덩어리 텍스트로 합친다(관찰/수행서술/추가입력).
 * 섹션 라벨을 붙이되 점수 컬럼·숫자 점수는 어디에도 넣지 않는다(AC-S4).
 */
function sourceToText(s: BulkSetechSource): string {
  const blocks: string[] = [];
  if (s.observations.length > 0) {
    blocks.push("[관찰]\n" + s.observations.map((o) => `- ${o}`).join("\n"));
  }
  if (s.performanceProse.length > 0) {
    blocks.push("[수행서술]\n" + s.performanceProse.map((p) => `- ${p}`).join("\n"));
  }
  if (s.extraNotes.length > 0) {
    blocks.push("[추가입력]\n" + s.extraNotes.map((e) => `- ${e}`).join("\n"));
  }
  if (s.keywords.length > 0) {
    blocks.push("[키워드] " + s.keywords.join(", "));
  }
  return blocks.join("\n\n");
}

/**
 * 일괄 원천 CSV 문자열 생성(AC-S1). 컬럼: 학번,이름,과목,원천자료.
 * **점수 컬럼은 존재하지 않는다**(관찰/수행서술/추가입력을 합친 텍스트만, AC-S4).
 * 빈 세특본문 컬럼(작성용 빈칸)을 함께 두어 교사가 같은 파일에 채워 넣고 재업로드한다.
 */
export function toBulkCsv(rows: BulkSourceRow[]): string {
  const header = ["학번", "이름", "과목", "원천자료", "세특본문"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [r.sid, r.name, r.subject, sourceToText(r.source), ""]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}

/** 결과 CSV 헤더 별칭. */
const RESULT_ALIASES = {
  sid: ["학번"],
  subject: ["과목", "과목명"],
  content: ["세특본문", "세특", "본문", "특기사항"],
} as const;

function resolveColumn(
  headers: string[],
  aliases: readonly string[],
): string | null {
  for (const alias of aliases) {
    if (headers.includes(alias)) return alias;
  }
  return null;
}

/**
 * 결과 CSV 파싱(AC-S3). 학번+과목 복합키 + 세특본문을 ImportResult 로 반환한다.
 * 형식오류 행(학번 누락·형식위반·과목 공란·본문 공란)은 errors[] 채널(graceful).
 * 학번+과목→studentYearId 매핑은 쿼리 계층이 담당하고 여기서는 순수 파싱만 한다.
 */
export function parseBulkResultCsv(input: string): ImportResult<BulkResultRow> {
  const { headers, records } = parseCsvRecords(input);

  const cols = {
    sid: resolveColumn(headers, RESULT_ALIASES.sid),
    subject: resolveColumn(headers, RESULT_ALIASES.subject),
    content: resolveColumn(headers, RESULT_ALIASES.content),
  };

  const missing: string[] = [];
  if (cols.sid === null) missing.push("학번");
  if (cols.subject === null) missing.push("과목");
  if (cols.content === null) missing.push("세특본문");
  if (missing.length > 0) {
    throw new CsvHeaderError(`필수 헤더 누락: ${missing.join(", ")}`, missing);
  }

  const rows: BulkResultRow[] = [];
  const errors: ImportResult<BulkResultRow>["errors"] = [];

  for (const rec of records) {
    const fieldErrors: FieldError[] = [];
    const get = (col: string | null) => (col ? rec.values[col] ?? "" : "");

    const sid = get(cols.sid).trim();
    const subject = get(cols.subject).trim();
    const content = get(cols.content).trim();

    if (sid.length === 0) {
      fieldErrors.push({ field: "학번", message: "학번이 비어 있습니다." });
    } else if (!SID_RE.test(sid)) {
      fieldErrors.push({
        field: "학번",
        message: `학번 형식 오류(5자리 숫자): "${sid}"`,
      });
    }
    if (subject.length === 0) {
      fieldErrors.push({ field: "과목", message: "과목이 비어 있습니다." });
    }
    if (content.length === 0) {
      // 빈 본문은 작성 전 빈칸일 수 있으므로 형식오류가 아니라 스킵 대상으로 분류.
      fieldErrors.push({ field: "세특본문", message: "세특 본문이 비어 있습니다." });
    }

    if (fieldErrors.length > 0) {
      errors.push({ rowNumber: rec.rowNumber, errors: fieldErrors });
      continue;
    }

    rows.push({ sid, subject, content });
  }

  return { rows, errors, totalRows: records.length };
}
