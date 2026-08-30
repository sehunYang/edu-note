import { describe, it, expect } from "vitest";
import {
  neisDate,
  cleanMealMenu,
  parseSchoolSchedule,
  parseMealService,
  parseSchoolInfo,
  parseHisTimetable,
} from "./neis";

describe("parseSchoolInfo", () => {
  const json = {
    schoolInfo: [
      { head: [{ RESULT: { CODE: "INFO-000" } }] },
      {
        row: [
          {
            ATPT_OFCDC_SC_CODE: "E10",
            SD_SCHUL_CODE: "7310349",
            SCHUL_NM: "한빛고등학교",
          },
        ],
      },
    ],
  };
  it("학교 코드(교육청·학교)와 학교명을 추출", () => {
    expect(parseSchoolInfo(json)).toEqual([
      { officeCode: "E10", schoolCode: "7310349", name: "한빛고등학교" },
    ]);
  });
  it("무데이터는 빈 배열", () => {
    expect(parseSchoolInfo({ RESULT: { CODE: "INFO-200" } })).toEqual([]);
  });
});

describe("neisDate", () => {
  it("YYYYMMDD → YYYY-MM-DD", () => {
    expect(neisDate("20260601")).toBe("2026-06-01");
  });
  it("형식 불일치는 원본 유지", () => {
    expect(neisDate("2026-06-01")).toBe("2026-06-01");
  });
});

describe("cleanMealMenu", () => {
  it("<br/> 분리 + 알레르기 코드 제거", () => {
    const out = cleanMealMenu("쌀밥 (1.5)<br/>미역국 5.6.<br/>김치 (9)");
    expect(out).toEqual(["쌀밥", "미역국", "김치"]);
  });
  it("코드 없는 항목은 그대로", () => {
    expect(cleanMealMenu("백미밥<br/>된장찌개")).toEqual(["백미밥", "된장찌개"]);
  });
  it("빈 항목 제거", () => {
    expect(cleanMealMenu("밥<br/><br/>국")).toEqual(["밥", "국"]);
  });
});

const scheduleJson = {
  SchoolSchedule: [
    { head: [{ list_total_count: 2 }, { RESULT: { CODE: "INFO-000" } }] },
    {
      row: [
        {
          AA_YMD: "20260601",
          EVENT_NM: "지방선거",
          EVENT_CNTNT: "",
          SBTR_DD_SC_NM: "공휴일",
        },
        {
          AA_YMD: "20260602",
          EVENT_NM: "체육대회",
          EVENT_CNTNT: "전교생 운동장",
          SBTR_DD_SC_NM: "",
        },
      ],
    },
  ],
};

describe("parseSchoolSchedule", () => {
  it("행을 정규화하고 날짜 변환", () => {
    const out = parseSchoolSchedule(scheduleJson);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      date: "2026-06-01",
      title: "지방선거",
      content: null,
      isSchoolDay: false, // 공휴일
      dayCategory: "공휴일",
    });
    expect(out[1]).toMatchObject({
      date: "2026-06-02",
      title: "체육대회",
      content: "전교생 운동장",
      isSchoolDay: true, // 평일
      dayCategory: null,
    });
  });

  it("휴업일/토요휴업일은 수업일 아님", () => {
    const j = {
      SchoolSchedule: [
        { head: [{ RESULT: { CODE: "INFO-000" } }] },
        { row: [{ AA_YMD: "20260606", EVENT_NM: "방학", SBTR_DD_SC_NM: "토요휴업일" }] },
      ],
    };
    expect(parseSchoolSchedule(j)[0].isSchoolDay).toBe(false);
  });

  it("무데이터(INFO-200)는 빈 배열", () => {
    const j = { RESULT: { CODE: "INFO-200", MESSAGE: "데이터 없음" } };
    expect(parseSchoolSchedule(j)).toEqual([]);
  });

  it("head 의 RESULT 가 INFO-200 이면 빈 배열", () => {
    const j = {
      SchoolSchedule: [{ head: [{ RESULT: { CODE: "INFO-200" } }] }],
    };
    expect(parseSchoolSchedule(j)).toEqual([]);
  });

  it("형식 불명 입력은 빈 배열(throw 안 함)", () => {
    expect(parseSchoolSchedule(null)).toEqual([]);
    expect(parseSchoolSchedule("nope")).toEqual([]);
    expect(parseSchoolSchedule({})).toEqual([]);
  });
});

describe("parseMealService", () => {
  const mealJson = {
    mealServiceDietInfo: [
      { head: [{ RESULT: { CODE: "INFO-000" } }] },
      {
        row: [
          {
            MLSV_YMD: "20260601",
            MMEAL_SC_NM: "중식",
            DDISH_NM: "쌀밥 (1.5)<br/>미역국 5.6.<br/>제육볶음 (10)",
            CAL_INFO: "850.5 Kcal",
            NTR_INFO: "탄수화물(g) : 100.0<br/>단백질(g) : 30.0",
          },
        ],
      },
    ],
  };

  it("급식 정규화 + 메뉴 코드 제거 + rawMenu 보존", () => {
    const out = parseMealService(mealJson);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      date: "2026-06-01",
      mealType: "중식",
      menu: ["쌀밥", "미역국", "제육볶음"],
      calInfo: "850.5 Kcal",
      ntrInfo: "탄수화물(g) : 100.0\n단백질(g) : 30.0",
    });
    expect(out[0].rawMenu).toContain("쌀밥 (1.5)");
    expect(out[0].rawMenu).toContain("\n");
  });

  it("NTR_INFO 누락 시 ntrInfo=null", () => {
    const j = {
      mealServiceDietInfo: [
        { head: [{ RESULT: { CODE: "INFO-000" } }] },
        {
          row: [
            {
              MLSV_YMD: "20260602",
              MMEAL_SC_NM: "중식",
              DDISH_NM: "백미밥<br/>된장국",
              CAL_INFO: "700 Kcal",
            },
          ],
        },
      ],
    };
    expect(parseMealService(j)[0].ntrInfo).toBeNull();
  });

  it("무데이터는 빈 배열", () => {
    expect(parseMealService({ RESULT: { CODE: "INFO-200" } })).toEqual([]);
  });
});

describe("parseHisTimetable", () => {
  // 실측 필드 구조(한빛고 2-9반) 스냅샷.
  const ttJson = {
    hisTimetable: [
      { head: [{ RESULT: { CODE: "INFO-000" } }] },
      {
        row: [
          {
            ALL_TI_YMD: "20260713",
            GRADE: "2",
            CLASS_NM: "9",
            PERIO: "1",
            ITRT_CNTNT: "일본어",
            CLRM_NM: "2-9",
          },
          {
            ALL_TI_YMD: "20260713",
            GRADE: "2",
            CLASS_NM: "9",
            PERIO: "2",
            ITRT_CNTNT: "문학",
          },
        ],
      },
    ],
  };

  it("날짜·학년·반·교시·수업내용을 정규화", () => {
    const out = parseHisTimetable(ttJson);
    expect(out).toEqual([
      { date: "2026-07-13", grade: 2, classNo: 9, period: 1, subject: "일본어" },
      { date: "2026-07-13", grade: 2, classNo: 9, period: 2, subject: "문학" },
    ]);
  });

  it("빈 수업내용(ITRT_CNTNT) 행은 제외", () => {
    const j = {
      hisTimetable: [
        { head: [{ RESULT: { CODE: "INFO-000" } }] },
        {
          row: [
            { ALL_TI_YMD: "20260713", GRADE: "2", CLASS_NM: "9", PERIO: "3", ITRT_CNTNT: "" },
            { ALL_TI_YMD: "20260713", GRADE: "2", CLASS_NM: "9", PERIO: "4", ITRT_CNTNT: "화학" },
          ],
        },
      ],
    };
    expect(parseHisTimetable(j)).toEqual([
      { date: "2026-07-13", grade: 2, classNo: 9, period: 4, subject: "화학" },
    ]);
  });

  it("학년/반/교시 파싱 불가 행은 제외", () => {
    const j = {
      hisTimetable: [
        { head: [{ RESULT: { CODE: "INFO-000" } }] },
        {
          row: [
            { ALL_TI_YMD: "20260713", GRADE: "", CLASS_NM: "9", PERIO: "1", ITRT_CNTNT: "수학" },
            { ALL_TI_YMD: "20260713", GRADE: "2", CLASS_NM: "9", PERIO: "x", ITRT_CNTNT: "영어" },
          ],
        },
      ],
    };
    expect(parseHisTimetable(j)).toEqual([]);
  });

  it("무데이터/형식불명은 빈 배열(throw 안 함)", () => {
    expect(parseHisTimetable({ RESULT: { CODE: "INFO-200" } })).toEqual([]);
    expect(parseHisTimetable(null)).toEqual([]);
    expect(parseHisTimetable({})).toEqual([]);
  });
});
