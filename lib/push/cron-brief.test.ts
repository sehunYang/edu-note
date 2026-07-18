import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  authorizeCron,
  composeBriefingBody,
  distinctTeacherBriefingOwners,
  distinctStudentS3Owners,
} from "./cron-brief";

describe("authorizeCron", () => {
  const secret = "s3cr3t-token";

  it("secret 미설정이면 항상 false", () => {
    expect(authorizeCron(`Bearer ${secret}`, undefined)).toBe(false);
    expect(authorizeCron(`Bearer ${secret}`, "")).toBe(false);
  });

  it("헤더 없음/토큰 없음이면 401(false)", () => {
    expect(authorizeCron(null, secret)).toBe(false);
    expect(authorizeCron("", secret)).toBe(false);
    expect(authorizeCron("Bearer ", secret)).toBe(false);
  });

  it("짧은/틀린 토큰이면 false (RangeError 없이)", () => {
    expect(authorizeCron("Bearer x", secret)).toBe(false);
    expect(authorizeCron("Bearer wrong-token-entirely", secret)).toBe(false);
    // 길이가 secret 과 같지만 값이 다른 경우
    const sameLenWrong = "z".repeat(secret.length);
    expect(authorizeCron(`Bearer ${sameLenWrong}`, secret)).toBe(false);
  });

  it("올바른 토큰이면 true", () => {
    expect(authorizeCron(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("Bearer 접두 없는 원문 토큰은 false", () => {
    expect(authorizeCron(secret, secret)).toBe(false);
  });

  it("어떤 길이 입력에도 RangeError 를 던지지 않는다", () => {
    const sha = createHash("sha256").update("anything").digest("hex");
    expect(() => authorizeCron(`Bearer ${sha}`, secret)).not.toThrow();
    expect(() => authorizeCron("Bearer ", secret)).not.toThrow();
  });
});

describe("composeBriefingBody", () => {
  it("4요소 전부 0이면 null(미발송)", () => {
    expect(
      composeBriefingBody({ lessons: 0, nudges: 0, reports: 0, events: 0 }),
    ).toBeNull();
  });

  it("하나라도 0이 아니면 요약 문자열", () => {
    expect(
      composeBriefingBody({ lessons: 3, nudges: 0, reports: 0, events: 0 }),
    ).toBe("오늘 수업 3개 · 넛지 0건 · 미제출 신고서 0건 · 일정 0건");
    expect(
      composeBriefingBody({ lessons: 2, nudges: 1, reports: 4, events: 5 }),
    ).toBe("오늘 수업 2개 · 넛지 1건 · 미제출 신고서 4건 · 일정 5건");
  });

  it("events 만 있어도 발송(널 아님)", () => {
    expect(
      composeBriefingBody({ lessons: 0, nudges: 0, reports: 0, events: 1 }),
    ).not.toBeNull();
  });
});

describe("오너 집합 도출 — T3/S3 독립성", () => {
  it("teacher: briefing 명시적 false 만 제외, distinct", () => {
    const rows = [
      { ownerId: "A", prefs: { briefing: true } },
      { ownerId: "A", prefs: {} }, // 같은 오너 다른 기기 → distinct
      { ownerId: "B", prefs: { briefing: false } }, // 옵트아웃
      { ownerId: "C", prefs: { instant: false } }, // briefing 미지정 → 켜짐
    ];
    expect(distinctTeacherBriefingOwners(rows).sort()).toEqual(["A", "C"]);
  });

  it("student: s3 명시적 false 만 제외, distinct", () => {
    const rows = [
      { ownerId: "A", prefs: { s3: true } },
      { ownerId: "B", prefs: { s3: false } },
      { ownerId: "C", prefs: {} }, // 미지정 → 켜짐
    ];
    expect(distinctStudentS3Owners(rows).sort()).toEqual(["A", "C"]);
  });

  it("briefing=false 교사도 그 학생의 s3=true 구독이 있으면 S3 대상에 포함(독립성)", () => {
    const teacherRows = [{ ownerId: "T", prefs: { briefing: false } }];
    const studentRows = [{ ownerId: "T", prefs: { s3: true } }];
    // T3 에서는 빠지지만
    expect(distinctTeacherBriefingOwners(teacherRows)).toEqual([]);
    // S3 에서는 포함된다 — 두 집합은 커플링되지 않는다.
    expect(distinctStudentS3Owners(studentRows)).toEqual(["T"]);
  });
});
