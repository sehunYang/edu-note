import { describe, it, expect } from "vitest";
import {
  buildAttendanceTally,
  recordWeight,
  sumTallies,
  tallyToCsv,
  type TallyRecord,
  type TallyStudent,
} from "./attendance-tally";

const STUDENTS: TallyStudent[] = [
  { studentYearId: "a", sid: "20901", name: "고제나" },
  { studentYearId: "b", sid: "20902", name: "김보민" },
];

describe("recordWeight", () => {
  it("결석·지각·조퇴는 교시와 무관하게 1일", () => {
    expect(recordWeight({ studentYearId: "a", kind: "absent", reason: "illness" })).toBe(1);
    expect(
      recordWeight({
        studentYearId: "a",
        kind: "late",
        reason: "etc",
        periods: [1, 2, 3],
      }),
    ).toBe(1);
  });

  it("결과는 교시 수로 센다 — 행 수로 세면 3교시가 1로 잡힌다", () => {
    expect(
      recordWeight({
        studentYearId: "a",
        kind: "absent_period",
        reason: "unaccepted",
        periods: [2, 4, 6],
      }),
    ).toBe(3);
  });

  it("결과인데 periods 가 비면 1회로 본다(0으로 죽이지 않는다)", () => {
    expect(
      recordWeight({ studentYearId: "a", kind: "absent_period", reason: "etc" }),
    ).toBe(1);
    expect(
      recordWeight({
        studentYearId: "a",
        kind: "absent_period",
        reason: "etc",
        periods: [],
      }),
    ).toBe(1);
  });
});

describe("buildAttendanceTally", () => {
  it("성격×사유 격자에 누적하고 합계를 낸다", () => {
    const recs: TallyRecord[] = [
      { studentYearId: "a", kind: "absent", reason: "illness" },
      { studentYearId: "a", kind: "absent", reason: "illness" },
      { studentYearId: "a", kind: "late", reason: "unaccepted" },
      { studentYearId: "a", kind: "absent_period", reason: "etc", periods: [3, 4] },
    ];
    const [ga] = buildAttendanceTally(STUDENTS, recs);
    expect(ga.counts.absent.illness).toBe(2);
    expect(ga.counts.late.unaccepted).toBe(1);
    expect(ga.counts.absent_period.etc).toBe(2);
    expect(ga.total).toBe(5);
  });

  it("기록이 없는 학생도 0 행으로 남긴다 — NEIS 는 명단 순서로 입력한다", () => {
    const rows = buildAttendanceTally(STUDENTS, [
      { studentYearId: "a", kind: "absent", reason: "etc" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1].sid).toBe("20902");
    expect(rows[1].total).toBe(0);
    expect(rows[1].counts.absent.illness).toBe(0);
  });

  it("명단 순서를 그대로 보존한다", () => {
    const rows = buildAttendanceTally(STUDENTS, []);
    expect(rows.map((r) => r.sid)).toEqual(["20901", "20902"]);
  });

  it("명단 밖 학생(전출 등) 기록은 버린다", () => {
    const rows = buildAttendanceTally(STUDENTS, [
      { studentYearId: "gone", kind: "absent", reason: "illness" },
    ]);
    expect(rows.every((r) => r.total === 0)).toBe(true);
  });

  it("신고서 미제출만 센다(제출했거나 불필요하면 제외)", () => {
    const [ga] = buildAttendanceTally(STUDENTS, [
      { studentYearId: "a", kind: "absent", reason: "illness", reportRequired: true, reportSubmitted: false },
      { studentYearId: "a", kind: "late", reason: "illness", reportRequired: true, reportSubmitted: true },
      { studentYearId: "a", kind: "early_leave", reason: "etc", reportRequired: false, reportSubmitted: false },
    ]);
    expect(ga.unsubmittedReports).toBe(1);
  });
});

describe("sumTallies", () => {
  it("반 전체 열 합계", () => {
    const rows = buildAttendanceTally(STUDENTS, [
      { studentYearId: "a", kind: "absent", reason: "illness" },
      { studentYearId: "b", kind: "absent", reason: "illness" },
      { studentYearId: "b", kind: "absent", reason: "accepted" },
    ]);
    const total = sumTallies(rows);
    expect(total.absent.illness).toBe(2);
    expect(total.absent.accepted).toBe(1);
    expect(total.late.etc).toBe(0);
  });
});

describe("tallyToCsv", () => {
  it("헤더 2줄 + 학생당 1줄, 0 도 값으로 적는다(열 밀림 방지)", () => {
    const rows = buildAttendanceTally(STUDENTS, [
      { studentYearId: "a", kind: "absent", reason: "illness" },
    ]);
    const csv = tallyToCsv(rows, 20);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[1].startsWith("학번,이름,")).toBe(true);
    // 학번,이름,수업일수 + 4성격×4사유 + 미제출 = 3+16+1 = 20열
    expect(lines[2].split(",")).toHaveLength(20);
    expect(lines[2].startsWith("20901,고제나,20,1,0,0,0")).toBe(true);
    // 기록 0인 학생도 0 으로 채워 나온다
    expect(lines[3].startsWith("20902,김보민,20,0,0,0,0")).toBe(true);
  });
});
