/**
 * 학생 명단 CSV 임포트 (계획 §3.3 student_years, §3.2 검증·행단위 오류, AC-A).
 *
 * 학번(sid) 5자리 = 학년1 + 반2 + 번호2. 학번에서 학년/반/번호를 파생하고,
 * CSV 에 명시 컬럼이 있으면 일치 여부를 검증한다. 학번은 `^[0-9]{5}$` 강제,
 * 파일 내 학번 중복은 뒤 행에서 오류 처리한다.
 */
import { parseCsvRecords, type CsvRecord } from "./parse";
import { CsvHeaderError, type ImportResult, type FieldError } from "./types";

export interface StudentRosterRow {
  sid: string;
  name: string;
  grade: number;
  classNo: number;
  number: number;
  phone: string | null;
  parentName: string | null;
  parentPhone: string | null;
  career: string | null;
}

/** 한 필드에 허용되는 헤더 별칭(앞이 우선). 모두 trim 후 비교. */
const HEADER_ALIASES = {
  sid: ["학번"],
  name: ["이름", "성명"],
  grade: ["학년"],
  classNo: ["반", "학급"],
  number: ["번호", "출석번호"],
  phone: ["연락처", "전화번호", "휴대전화", "휴대폰", "전화"],
  parentName: ["보호자", "보호자명", "보호자 성명"],
  parentPhone: ["보호자연락처", "보호자 연락처", "보호자전화", "보호자 전화번호"],
  career: ["진로", "희망진로", "진로희망"],
} as const;

const SID_RE = /^[0-9]{5}$/;
// 느슨한 전화번호 검증: 숫자/하이픈/공백/괄호/+ 만 허용.
const PHONE_RE = /^[0-9+()\-\s]+$/;

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

export function parseStudentRoster(input: string): ImportResult<StudentRosterRow> {
  const { headers, records } = parseCsvRecords(input);

  const cols = {
    sid: resolveColumn(headers, HEADER_ALIASES.sid),
    name: resolveColumn(headers, HEADER_ALIASES.name),
    grade: resolveColumn(headers, HEADER_ALIASES.grade),
    classNo: resolveColumn(headers, HEADER_ALIASES.classNo),
    number: resolveColumn(headers, HEADER_ALIASES.number),
    phone: resolveColumn(headers, HEADER_ALIASES.phone),
    parentName: resolveColumn(headers, HEADER_ALIASES.parentName),
    parentPhone: resolveColumn(headers, HEADER_ALIASES.parentPhone),
    career: resolveColumn(headers, HEADER_ALIASES.career),
  };

  // 필수 헤더(학번·이름) 부재는 파일 차원 오류.
  const missing: string[] = [];
  if (cols.sid === null) missing.push("학번");
  if (cols.name === null) missing.push("이름");
  if (missing.length > 0) {
    throw new CsvHeaderError(
      `필수 헤더 누락: ${missing.join(", ")}`,
      missing,
    );
  }

  const rows: StudentRosterRow[] = [];
  const errors: ImportResult<StudentRosterRow>["errors"] = [];
  const seenSid = new Map<string, number>(); // sid → 최초 출현 행번호

  for (const rec of records) {
    const fieldErrors: FieldError[] = [];
    const get = (col: string | null) => (col ? rec.values[col] ?? "" : "");

    const sid = get(cols.sid).trim();
    const name = get(cols.name).trim();

    if (sid.length === 0) {
      fieldErrors.push({ field: "학번", message: "학번이 비어 있습니다." });
    } else if (!SID_RE.test(sid)) {
      fieldErrors.push({
        field: "학번",
        message: `학번 형식 오류(5자리 숫자): "${sid}"`,
      });
    } else {
      const first = seenSid.get(sid);
      if (first !== undefined) {
        fieldErrors.push({
          field: "학번",
          message: `학번 중복(${first}행과 같음): ${sid}`,
        });
      }
    }

    if (name.length === 0) {
      fieldErrors.push({ field: "이름", message: "이름이 비어 있습니다." });
    }

    // 학번에서 학년/반/번호 파생 + 명시 컬럼 일치 검증
    let grade = 0;
    let classNo = 0;
    let number = 0;
    if (SID_RE.test(sid)) {
      grade = Number(sid.slice(0, 1));
      classNo = Number(sid.slice(1, 3));
      number = Number(sid.slice(3, 5));
      checkExplicit(rec, cols.grade, grade, "학년", fieldErrors);
      checkExplicit(rec, cols.classNo, classNo, "반", fieldErrors);
      checkExplicit(rec, cols.number, number, "번호", fieldErrors);
    }

    const phone = optional(get(cols.phone));
    const parentPhone = optional(get(cols.parentPhone));
    for (const [val, label] of [
      [phone, "연락처"],
      [parentPhone, "보호자연락처"],
    ] as const) {
      if (val !== null && !PHONE_RE.test(val)) {
        fieldErrors.push({
          field: label,
          message: `전화번호 형식 오류: "${val}"`,
        });
      }
    }

    if (fieldErrors.length > 0) {
      errors.push({ rowNumber: rec.rowNumber, errors: fieldErrors });
      continue;
    }

    // 통과 행만 중복 추적에 등록(중복 판정은 최초 유효 행 기준)
    seenSid.set(sid, rec.rowNumber);
    rows.push({
      sid,
      name,
      grade,
      classNo,
      number,
      phone,
      parentName: optional(get(cols.parentName)),
      parentPhone,
      career: optional(get(cols.career)),
    });
  }

  return { rows, errors, totalRows: records.length };
}

/** 명시 컬럼이 있고 비어있지 않으면 파생값과 일치하는지 검사. */
function checkExplicit(
  rec: CsvRecord,
  col: string | null,
  derived: number,
  label: string,
  out: FieldError[],
): void {
  if (col === null) return;
  const raw = (rec.values[col] ?? "").trim();
  if (raw.length === 0) return;
  if (Number(raw) !== derived) {
    out.push({
      field: label,
      message: `${label} 불일치(학번 파생=${derived}, 입력=${raw})`,
    });
  }
}
