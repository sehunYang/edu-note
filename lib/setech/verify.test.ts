import { describe, it, expect } from "vitest";
import { verifyPastedDraft } from "./verify";

describe("verifyPastedDraft", () => {
  it("정상 초안은 ok=true, 차단 경고 없음", () => {
    const r = verifyPastedDraft(
      "산-염기 실험에서 변인을 통제하며 탐구 과정을 주도함.",
      "subject",
    );
    expect(r.ok).toBe(true);
    expect(r.warnings.filter((w) => w.blocking)).toEqual([]);
    expect(r.byteCheck.over).toBe(false);
  });

  it("빈 내용은 차단 경고", () => {
    const r = verifyPastedDraft("   ", "subject");
    expect(r.ok).toBe(false);
    expect(r.warnings.some((w) => w.kind === "empty" && w.blocking)).toBe(true);
  });

  it("상한 초과는 차단 경고", () => {
    const long = "가".repeat(1100); // 3300byte > 3000
    const r = verifyPastedDraft(long, "subject");
    expect(r.ok).toBe(false);
    expect(r.warnings.some((w) => w.kind === "over_limit" && w.blocking)).toBe(
      true,
    );
  });

  it("진로 상한(4200) 적용 — 동일 길이도 통과", () => {
    const text = "가".repeat(1100); // 3300byte < 4200
    expect(verifyPastedDraft(text, "career").ok).toBe(true);
  });

  it("수상 실적은 기재 금지 의심(비차단)", () => {
    const r = verifyPastedDraft("교내외 대회에서 수상하며 역량을 보임.", "subject");
    expect(r.warnings.some((w) => w.kind === "prohibited")).toBe(true);
    expect(r.ok).toBe(true); // 비차단 → 저장 가능(교사 판단)
  });

  it("어학 점수(TOEIC)는 기재 금지 의심", () => {
    const r = verifyPastedDraft("TOEIC 점수가 높음.", "subject");
    expect(r.warnings.some((w) => w.kind === "prohibited")).toBe(true);
  });

  it("모의고사 성적은 기재 금지 의심", () => {
    const r = verifyPastedDraft("모의고사 백분위가 우수함.", "subject");
    expect(r.warnings.some((w) => w.kind === "prohibited")).toBe(true);
  });

  it("1인칭/감상 표현 감지(비차단)", () => {
    const r = verifyPastedDraft("나는 학생이 기특하다고 느꼈다.", "behavior");
    expect(r.warnings.some((w) => w.kind === "first_person")).toBe(true);
  });

  it("본문에 학생 이름 노출 감지", () => {
    const r = verifyPastedDraft("홍길동은 실험을 주도함.", "subject", "홍길동");
    expect(r.warnings.some((w) => w.kind === "student_name_guess")).toBe(true);
  });

  it("이름 미제공 시 이름 경고 없음", () => {
    const r = verifyPastedDraft("실험을 주도함.", "subject");
    expect(r.warnings.some((w) => w.kind === "student_name_guess")).toBe(false);
  });
});
