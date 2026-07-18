import { describe, it, expect } from "vitest";
import { filterActiveStudentTargets, prefEnabled } from "./targeting";

describe("filterActiveStudentTargets", () => {
  const NOW = new Date("2026-07-18T00:00:00Z");

  it("활성 링크(폐기 없음·만료 없음)는 통과", () => {
    const rows = [{ revokedAt: null, expiresAt: null, id: "a" }];
    expect(filterActiveStudentTargets(rows, NOW)).toEqual(rows);
  });

  it("만료 시각이 미래인 링크는 통과", () => {
    const rows = [
      { revokedAt: null, expiresAt: new Date("2026-07-19T00:00:00Z"), id: "a" },
    ];
    expect(filterActiveStudentTargets(rows, NOW)).toHaveLength(1);
  });

  it("폐기된 링크(revokedAt !== null)는 제외", () => {
    const rows = [{ revokedAt: new Date("2026-07-01T00:00:00Z"), expiresAt: null, id: "a" }];
    expect(filterActiveStudentTargets(rows, NOW)).toHaveLength(0);
  });

  it("만료된 링크(expiresAt <= now)는 제외", () => {
    const rows = [
      { revokedAt: null, expiresAt: new Date("2026-07-17T00:00:00Z"), id: "a" },
    ];
    expect(filterActiveStudentTargets(rows, NOW)).toHaveLength(0);
  });

  it("만료 시각이 정확히 now 이면 제외(경계)", () => {
    const rows = [{ revokedAt: null, expiresAt: NOW, id: "a" }];
    expect(filterActiveStudentTargets(rows, NOW)).toHaveLength(0);
  });

  it("활성/폐기/만료 혼합에서 활성만 남긴다", () => {
    const rows = [
      { revokedAt: null, expiresAt: null, id: "active" },
      { revokedAt: new Date("2026-07-01T00:00:00Z"), expiresAt: null, id: "revoked" },
      { revokedAt: null, expiresAt: new Date("2026-07-10T00:00:00Z"), id: "expired" },
    ];
    const out = filterActiveStudentTargets(rows, NOW);
    expect(out.map((r) => r.id)).toEqual(["active"]);
  });

  it("now 기본값(현재 시각)으로도 동작", () => {
    const rows = [{ revokedAt: null, expiresAt: null, id: "a" }];
    expect(filterActiveStudentTargets(rows)).toHaveLength(1);
  });
});

describe("prefEnabled", () => {
  it("prefs[key] === false 이면 false", () => {
    expect(prefEnabled({ instant: false }, "instant")).toBe(false);
  });

  it("prefs[key] === true 이면 true", () => {
    expect(prefEnabled({ instant: true }, "instant")).toBe(true);
  });

  it("prefs[key] 미정의면 기본 true(옵트아웃 모델)", () => {
    expect(prefEnabled({ briefing: false }, "instant")).toBe(true);
  });

  it("빈 객체는 true", () => {
    expect(prefEnabled({}, "instant")).toBe(true);
  });

  it("prefs 가 null 이면 true", () => {
    expect(prefEnabled(null, "instant")).toBe(true);
  });

  it("prefs 가 undefined 이면 true", () => {
    expect(prefEnabled(undefined, "instant")).toBe(true);
  });

  it("prefs 가 객체가 아니면(문자열) true", () => {
    expect(prefEnabled("nope", "instant")).toBe(true);
  });

  it("prefs[key] 가 falsy 이지만 false 아님(0)이면 true", () => {
    expect(prefEnabled({ instant: 0 }, "instant")).toBe(true);
  });
});
