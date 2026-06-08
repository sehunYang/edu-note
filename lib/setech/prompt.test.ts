import { describe, it, expect } from "vitest";
import { buildSetechPrompt } from "./prompt";
import type { SetechSourceBundle } from "./types";

const base: SetechSourceBundle = {
  studentName: "홍길동",
  noteType: "subject",
  subjectName: "통합과학",
  observations: ["산-염기 실험에서 변인 통제를 주도함"],
  performances: [
    { name: "탐구보고서", score: "A", prose: "오차 원인을 정량 분석함" },
    { name: "발표", score: null, prose: null },
  ],
  activities: ["과학 동아리 연계 추가 실험 설계"],
  extraNotes: ["수업 후 질문 적극적"],
  keywords: ["탐구", "변인통제"],
};

describe("buildSetechPrompt", () => {
  it("유형 라벨·바이트 상한·과목명을 헤더에 포함", () => {
    const out = buildSetechPrompt(base);
    expect(out).toContain("교과 세부능력 및 특기사항");
    expect(out).toContain("과목: 통합과학");
    expect(out).toContain("바이트 상한: 3000");
  });

  it("진로 유형은 상한 4200, 과목명 미표기", () => {
    const out = buildSetechPrompt({ ...base, noteType: "career", subjectName: null });
    expect(out).toContain("진로활동 특기사항");
    expect(out).toContain("4200");
    expect(out).not.toContain("과목:");
  });

  it("관찰/수행평가/활동/메모/키워드 섹션을 렌더", () => {
    const out = buildSetechPrompt(base);
    expect(out).toContain("## 관찰 기록");
    expect(out).toContain("산-염기 실험");
    expect(out).toContain("## 수행평가");
    expect(out).toContain("탐구보고서 (점수: A): 오차 원인을 정량 분석함");
    expect(out).toContain("발표"); // 점수/줄글 없어도 이름만
    expect(out).toContain("## 활동 기입");
    expect(out).toContain("## 추가 메모");
    expect(out).toContain("## 키워드");
  });

  it("빈 섹션은 생략", () => {
    const out = buildSetechPrompt({
      ...base,
      observations: [],
      performances: [],
      activities: [],
      extraNotes: [],
      keywords: [],
    });
    expect(out).not.toContain("## 관찰 기록");
    expect(out).not.toContain("## 수행평가");
  });

  it("공백뿐인 항목은 필터", () => {
    const out = buildSetechPrompt({ ...base, observations: ["  ", "유효 관찰"] });
    const bullets = out.split("\n").filter((l) => l.startsWith("- 유효 관찰"));
    expect(bullets).toHaveLength(1);
  });

  it("지침 텍스트가 있으면 작성 지침 섹션 삽입", () => {
    const out = buildSetechPrompt(base, { guidelineText: "명사형으로 끝낼 것" });
    expect(out).toContain("## 작성 지침");
    expect(out).toContain("명사형으로 끝낼 것");
  });

  it("지침 미제공 시 지침 섹션 없음", () => {
    expect(buildSetechPrompt(base)).not.toContain("## 작성 지침");
  });
});
