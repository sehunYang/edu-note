import { describe, it, expect } from "vitest";
import { parseStudentRoster } from "./student-roster";
import { CsvHeaderError } from "./types";

describe("parseStudentRoster", () => {
  it("정상 행 파싱 + 학번에서 학년/반/번호 파생", () => {
    const csv = "학번,이름\n10203,홍길동";
    const result = parseStudentRoster(csv);
    expect(result.errors).toEqual([]);
    expect(result.totalRows).toBe(1);
    expect(result.rows[0]).toEqual({
      sid: "10203",
      name: "홍길동",
      grade: 1,
      classNo: 2,
      number: 3,
      phone: null,
      parentName: null,
      parentPhone: null,
      career: null,
      roles: [],
    });
  });

  it("역할 컬럼: 쉼표 구분 복수 파싱(공란 제외) (AC-C5)", () => {
    // 한 셀에 복수 역할 → CSV 따옴표로 감싼다("반장, 환경부장").
    const csv = '학번,이름,역할\n10101,이영희,"반장, 환경부장 "';
    const { rows } = parseStudentRoster(csv);
    expect(rows[0].roles).toEqual(["반장", "환경부장"]);
    // 역할 컬럼 없으면 빈 배열
    expect(parseStudentRoster("학번,이름\n10101,이영희").rows[0].roles).toEqual([]);
    // 역할 셀 공란이면 빈 배열
    expect(
      parseStudentRoster("학번,이름,역할\n10101,이영희,").rows[0].roles,
    ).toEqual([]);
  });

  it("학번 5자리 끝 = 번호 두자리(앞자리 0 보존)", () => {
    const { rows } = parseStudentRoster("학번,이름\n31507,김철수");
    expect(rows[0]).toMatchObject({ grade: 3, classNo: 15, number: 7 });
  });

  it("선택 컬럼(연락처/보호자/진로) 매핑 및 별칭", () => {
    const csv =
      "학번,성명,휴대전화,보호자명,보호자 연락처,희망진로\n" +
      "10101,이영희,010-1234-5678,이부모,010-9999-8888,교사";
    const { rows } = parseStudentRoster(csv);
    expect(rows[0]).toMatchObject({
      name: "이영희",
      phone: "010-1234-5678",
      parentName: "이부모",
      parentPhone: "010-9999-8888",
      career: "교사",
    });
  });

  it("필수 헤더(학번) 누락 시 CsvHeaderError", () => {
    expect(() => parseStudentRoster("이름\n홍길동")).toThrow(CsvHeaderError);
    try {
      parseStudentRoster("이름\n홍길동");
    } catch (e) {
      expect((e as CsvHeaderError).missing).toEqual(["학번"]);
    }
  });

  it("학번 형식 오류는 행 단위 오류로 보고", () => {
    const { rows, errors } = parseStudentRoster("학번,이름\n123,홍길동\nabcde,김철수");
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({ rowNumber: 2 });
    expect(errors[0].errors[0].field).toBe("학번");
  });

  it("이름 누락 보고", () => {
    const { errors } = parseStudentRoster("학번,이름\n10203,");
    expect(errors[0].errors).toContainEqual({
      field: "이름",
      message: "이름이 비어 있습니다.",
    });
  });

  it("파일 내 학번 중복은 뒤 행에서 오류", () => {
    const csv = "학번,이름\n10203,홍길동\n10203,동명이인";
    const { rows, errors } = parseStudentRoster(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].rowNumber).toBe(3);
    expect(errors[0].errors[0].message).toContain("중복");
  });

  it("명시 학년/반/번호 컬럼이 학번 파생과 불일치하면 오류", () => {
    const csv = "학번,이름,학년,반,번호\n10203,홍길동,2,2,3";
    const { errors } = parseStudentRoster(csv);
    expect(errors[0].errors[0].field).toBe("학년");
    expect(errors[0].errors[0].message).toContain("불일치");
  });

  it("명시 컬럼이 파생과 일치하면 통과", () => {
    const csv = "학번,이름,학년,반,번호\n10203,홍길동,1,2,3";
    const { rows, errors } = parseStudentRoster(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it("잘못된 전화번호 형식 보고", () => {
    const csv = "학번,이름,연락처\n10203,홍길동,전화없음";
    const { errors } = parseStudentRoster(csv);
    expect(errors[0].errors[0].field).toBe("연락처");
  });

  it("정상 행과 오류 행이 함께 있을 때 정상 행은 살린다", () => {
    const csv = "학번,이름\n10203,홍길동\n999,오류\n10204,김철수";
    const { rows, errors, totalRows } = parseStudentRoster(csv);
    expect(totalRows).toBe(3);
    expect(rows.map((r) => r.sid)).toEqual(["10203", "10204"]);
    expect(errors).toHaveLength(1);
    expect(errors[0].rowNumber).toBe(3);
  });
});
