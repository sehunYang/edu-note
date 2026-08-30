import { describe, it, expect } from "vitest";
import { matchStatus } from "./school-resolve";
import { parseSchoolInfo } from "./neis";
import { parseSchoolSearch } from "./comcigan";

/**
 * 학교 검색 파서 + 0/1/다건 분기 단위테스트 (QC v1 C2, AC-2.3).
 * 동시 해석(resolveSchool)은 네트워크 의존이므로 순수 분기 로직만 고정한다.
 */
describe("matchStatus (0/1/다건 분기)", () => {
  it("0건 → none, 1건 → single, 2건↑ → multiple", () => {
    expect(matchStatus(0)).toBe("none");
    expect(matchStatus(1)).toBe("single");
    expect(matchStatus(2)).toBe("multiple");
    expect(matchStatus(9)).toBe("multiple");
  });
});

// NEIS schoolInfo 응답 구조: { schoolInfo: [ {head:[...]}, {row:[...]} ] }
function neisJson(rows: { office: string; code: string; name: string }[]) {
  return {
    schoolInfo: [
      { head: [{ list_total_count: rows.length }, { RESULT: { CODE: "INFO-000" } }] },
      {
        row: rows.map((r) => ({
          ATPT_OFCDC_SC_CODE: r.office,
          SD_SCHUL_CODE: r.code,
          SCHUL_NM: r.name,
        })),
      },
    ],
  };
}

describe("NEIS parseSchoolInfo + 분기", () => {
  it("단일 매칭", () => {
    const rows = parseSchoolInfo(
      neisJson([{ office: "E10", code: "7530560", name: "한빛고등학교" }]),
    );
    expect(rows).toEqual([
      { officeCode: "E10", schoolCode: "7530560", name: "한빛고등학교" },
    ]);
    expect(matchStatus(rows.length)).toBe("single");
  });

  it("다건 매칭 → multiple(picker fallback)", () => {
    const rows = parseSchoolInfo(
      neisJson([
        { office: "E10", code: "1", name: "해송고등학교" },
        { office: "B10", code: "2", name: "서울해송고등학교" },
      ]),
    );
    expect(rows).toHaveLength(2);
    expect(matchStatus(rows.length)).toBe("multiple");
  });

  it("0건(무데이터 RESULT) → none(수동입력 유지)", () => {
    const rows = parseSchoolInfo({ RESULT: { CODE: "INFO-200" } });
    expect(rows).toEqual([]);
    expect(matchStatus(rows.length)).toBe("none");
  });
});

describe("comcigan parseSchoolSearch + 분기", () => {
  it("단일 매칭", () => {
    const rows = parseSchoolSearch('{"학교검색":[[24966,"인천","한빛고등학교",79119]]}');
    expect(rows).toEqual([
      { regionCode: 24966, region: "인천", name: "한빛고등학교", code: 79119 },
    ]);
    expect(matchStatus(rows.length)).toBe("single");
  });

  it("다건 매칭 → multiple", () => {
    const rows = parseSchoolSearch('{"학교검색":[[1,"a","해송고",2],[3,"c","해송중",4]]}');
    expect(rows).toHaveLength(2);
    expect(matchStatus(rows.length)).toBe("multiple");
  });

  it("0건 → none", () => {
    const rows = parseSchoolSearch('{"학교검색":[]}');
    expect(rows).toEqual([]);
    expect(matchStatus(rows.length)).toBe("none");
  });
});
