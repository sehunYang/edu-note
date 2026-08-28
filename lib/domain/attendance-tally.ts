/**
 * 출결 NEIS 집계 (연간시나리오 기능갭 #1).
 *
 * 담임은 **월 단위로 출결을 마감**한다(학년말에 몰아서가 아니라). 그런데 기존
 * 출결 화면은 날짜별·월별·학생별 **목록**만 있어서, 마감 때 32명 × 4성격 ×
 * 4사유를 목록에서 눈으로 세야 했다. NEIS 출결상황 입력란과 같은 격자를 만들어
 * 그대로 보고 옮겨 적을 수 있게 한다.
 *
 * ── 세는 단위 ──────────────────────────────────────────────────────────────
 * 결석·지각·조퇴는 **일수**다. `attendance_records` 가 (owner, student, date,
 * kind) 유니크라 하루에 같은 성격이 두 번 잡히지 않으므로 행 수 = 일수다.
 *
 * 결과(absent_period)만 **교시 수**로 센다. 결과는 "그 교시에 없었다"는 기록이고
 * 한 행이 `periods` 배열로 여러 교시를 담기 때문에(입력 UI가 다중선택), 행 수로
 * 세면 3교시 결과가 1로 잡혀 NEIS 와 어긋난다. periods 가 비어 있으면(구 데이터
 * 또는 미지정) 1회로 본다 — 0으로 세어 누락시키는 것보다 안전하다.
 */
import type { AttendanceKind, AttendanceReason } from "./types";

/** NEIS 출결상황 입력란 순서. 표의 열 순서를 이 배열이 결정한다. */
export const TALLY_KINDS: AttendanceKind[] = [
  "absent",
  "late",
  "early_leave",
  "absent_period",
];

/** 각 성격 안의 사유 순서: 질병 → 미인정 → 기타 → 인정. 화면·CSV 열 순서 공통. */
export const TALLY_REASONS: AttendanceReason[] = [
  "illness",
  "unaccepted",
  "etc",
  "accepted",
];

export const TALLY_KIND_LABELS: Record<AttendanceKind, string> = {
  absent: "결석",
  late: "지각",
  early_leave: "조퇴",
  absent_period: "결과",
};

export const TALLY_REASON_LABELS: Record<AttendanceReason, string> = {
  illness: "질병",
  unaccepted: "미인정",
  accepted: "인정",
  etc: "기타",
};

/** 집계 입력 — 쿼리 계층이 넘기는 최소 형태. */
export interface TallyRecord {
  studentYearId: string;
  kind: AttendanceKind;
  reason: AttendanceReason;
  /** 결과(absent_period)의 교시 목록. 다른 성격에서는 무시된다. */
  periods?: number[] | null;
  reportRequired?: boolean;
  reportSubmitted?: boolean;
}

export interface TallyStudent {
  studentYearId: string;
  sid: string;
  name: string;
}

/** `counts[kind][reason]` = 일수(결과는 교시 수). 0 도 항상 채워진다. */
export type TallyCounts = Record<
  AttendanceKind,
  Record<AttendanceReason, number>
>;

export interface StudentTally {
  studentYearId: string;
  sid: string;
  name: string;
  counts: TallyCounts;
  /** 성격 무관 합계(결석일수+지각+조퇴+결과). 이상치 눈검사용. */
  total: number;
  /** 신고서가 필요한데 아직 안 낸 건수 — 마감 전 확인용. */
  unsubmittedReports: number;
}

function emptyCounts(): TallyCounts {
  const c = {} as TallyCounts;
  for (const k of TALLY_KINDS) {
    c[k] = {} as Record<AttendanceReason, number>;
    for (const r of TALLY_REASONS) c[k][r] = 0;
  }
  return c;
}

/** 이 기록이 더하는 값(결과=교시 수, 나머지=1). */
export function recordWeight(rec: TallyRecord): number {
  if (rec.kind !== "absent_period") return 1;
  const n = rec.periods?.length ?? 0;
  return n > 0 ? n : 1;
}

/**
 * 학생 명단 순서(학번 오름차순 전제)를 그대로 유지해 집계한다. 기록이 하나도
 * 없는 학생도 0 행으로 남긴다 — NEIS 는 명단 순서대로 입력하므로 빠진 줄이
 * 있으면 교사가 줄을 잘못 맞춘다.
 */
export function buildAttendanceTally(
  students: TallyStudent[],
  records: TallyRecord[],
): StudentTally[] {
  const byStudent = new Map<string, StudentTally>();
  for (const s of students) {
    byStudent.set(s.studentYearId, {
      studentYearId: s.studentYearId,
      sid: s.sid,
      name: s.name,
      counts: emptyCounts(),
      total: 0,
      unsubmittedReports: 0,
    });
  }

  for (const rec of records) {
    const t = byStudent.get(rec.studentYearId);
    // 명단 밖 학생(전출 등)의 기록은 버린다 — 표는 현재 명단 기준이다.
    if (!t) continue;
    const w = recordWeight(rec);
    t.counts[rec.kind][rec.reason] += w;
    t.total += w;
    if (rec.reportRequired && !rec.reportSubmitted) t.unsubmittedReports += 1;
  }

  return students.map((s) => byStudent.get(s.studentYearId)!);
}

/** 열 합계(반 전체) — 표 맨 아래 합계 줄. */
export function sumTallies(rows: StudentTally[]): TallyCounts {
  const total = emptyCounts();
  for (const row of rows) {
    for (const k of TALLY_KINDS) {
      for (const r of TALLY_REASONS) total[k][r] += row.counts[k][r];
    }
  }
  return total;
}

/**
 * NEIS 입력 순서 그대로의 CSV. 헤더 2줄(성격 / 사유)은 엑셀에서 열을 눈으로
 * 맞추기 위한 것이고, 값은 0 을 그대로 적는다(화면에서는 0 을 흐리게 죽이지만
 * 파일에서까지 비우면 붙여넣기 때 열이 밀린다).
 */
export function tallyToCsv(rows: StudentTally[], schoolDays: number): string {
  const head1 = ["", "", `수업일수 ${schoolDays}`];
  const head2 = ["학번", "이름", ""];
  for (const k of TALLY_KINDS) {
    for (const r of TALLY_REASONS) {
      head1.push(TALLY_KIND_LABELS[k]);
      head2.push(TALLY_REASON_LABELS[r]);
    }
  }
  head1.push("");
  head2.push("미제출신고서");

  const lines = [head1.join(","), head2.join(",")];
  for (const row of rows) {
    const cells: (string | number)[] = [row.sid, row.name, schoolDays];
    for (const k of TALLY_KINDS) {
      for (const r of TALLY_REASONS) cells.push(row.counts[k][r]);
    }
    cells.push(row.unsubmittedReports);
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}
