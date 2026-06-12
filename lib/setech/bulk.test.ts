import { describe, it, expect } from "vitest";
import {
  buildBulkSetechSource,
  toBulkCsv,
  parseBulkResultCsv,
  type BulkSourceRow,
} from "./bulk";
import type { SetechSourceBundle } from "./types";

/**
 * 세특 일괄 CSV 단위테스트 (교실 2-2 단계7).
 * 핵심 단언: 원천에 숫자 점수 부재(AC-S4), CSV에 점수 컬럼 부재, 결과 CSV
 * 학번+과목+본문 라운드트립 + 형식오류 행 graceful(errors[]).
 */

function bundle(over: Partial<SetechSourceBundle> = {}): SetechSourceBundle {
  return {
    studentName: "홍길동",
    noteType: "subject",
    subjectName: "물리학",
    observations: ["실험 데이터를 표로 정리하고 오차 원인을 분석함"],
    performances: [
      { name: "탐구보고서", score: "95", prose: "변인 통제를 정확히 적용함" },
      { name: "구술평가", score: "20", prose: null },
    ],
    activities: [],
    extraNotes: ["방과후 자기주도 탐구를 지속함"],
    keywords: ["탐구", "분석"],
    ...over,
  };
}

describe("buildBulkSetechSource — 점수 제외(AC-S4)", () => {
  it("수행 점수는 드롭하고 prose만 남긴다", () => {
    const src = buildBulkSetechSource(bundle());
    expect(src.performanceProse).toEqual(["변인 통제를 정확히 적용함"]);
    // BulkSetechSource 어디에도 score 키가 없어야 한다.
    expect(JSON.stringify(src)).not.toContain("score");
    expect(JSON.stringify(src)).not.toContain("95");
    expect(JSON.stringify(src)).not.toContain("20");
  });

  it("관찰·추가입력·키워드를 보존한다", () => {
    const src = buildBulkSetechSource(bundle());
    expect(src.observations).toContain("실험 데이터를 표로 정리하고 오차 원인을 분석함");
    expect(src.extraNotes).toContain("방과후 자기주도 탐구를 지속함");
    expect(src.keywords).toEqual(["탐구", "분석"]);
  });

  it("공란 prose는 제외한다", () => {
    const src = buildBulkSetechSource(
      bundle({ performances: [{ name: "x", score: "10", prose: "  " }] }),
    );
    expect(src.performanceProse).toHaveLength(0);
  });
});

describe("toBulkCsv — 점수 컬럼 부재(AC-S4)", () => {
  const rows: BulkSourceRow[] = [
    {
      sid: "20703",
      name: "홍길동",
      subject: "물리학",
      source: buildBulkSetechSource(bundle()),
    },
  ];

  it("헤더에 점수/원점수 컬럼이 없다", () => {
    const csv = toBulkCsv(rows);
    const header = csv.split("\n")[0];
    expect(header).toBe("학번,이름,과목,원천자료,세특본문");
    expect(header).not.toContain("점수");
    expect(header).not.toContain("원점수");
  });

  it("CSV 본문 어디에도 숫자 점수가 노출되지 않는다", () => {
    const csv = toBulkCsv(rows);
    expect(csv).not.toContain("95");
    expect(csv).not.toContain("점수: 20");
    // 원천 텍스트에는 관찰·서술만.
    expect(csv).toContain("변인 통제를 정확히 적용함");
    expect(csv).toContain("실험 데이터를 표로 정리");
  });
});

describe("parseBulkResultCsv — 라운드트립 + graceful", () => {
  it("학번+과목+본문을 round-trip 한다", () => {
    const text =
      "학번,과목,세특본문\n" +
      "20703,물리학,관찰 사실을 바탕으로 탐구 역량을 보여 줌\n";
    const r = parseBulkResultCsv(text);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toEqual({
      sid: "20703",
      subject: "물리학",
      content: "관찰 사실을 바탕으로 탐구 역량을 보여 줌",
    });
    expect(r.errors).toHaveLength(0);
  });

  it("따옴표로 감싼 콤마·줄바꿈 포함 본문을 보존한다", () => {
    const text =
      '학번,과목,세특본문\n' +
      '20703,물리학,"변인을 통제하고, 오차를 분석함"\n';
    const r = parseBulkResultCsv(text);
    expect(r.rows[0].content).toBe("변인을 통제하고, 오차를 분석함");
  });

  it("학번 형식오류·과목공란·본문공란은 errors[]로 라우팅", () => {
    const text =
      "학번,과목,세특본문\n" +
      "999,물리학,본문있음\n" + // 학번 형식 오류
      "20703,,본문있음\n" + // 과목 공란
      "20704,물리학,\n"; // 본문 공란
    const r = parseBulkResultCsv(text);
    expect(r.rows).toHaveLength(0);
    expect(r.errors).toHaveLength(3);
    expect(r.totalRows).toBe(3);
  });

  it("필수 헤더 누락은 throw(CsvHeaderError)", () => {
    expect(() => parseBulkResultCsv("학번,과목\n20703,물리학\n")).toThrow();
  });
});
