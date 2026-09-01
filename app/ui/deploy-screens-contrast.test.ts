import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 배포판 화면의 글자 대비 검사.
 *
 * 왜 있는가: 이 프로젝트는 다크 전환을 **Tailwind 색 스케일 재정의**로 했다. 그래서
 * `neutral-300` 이 밝은 회색이 아니라 `#3a3d42`(어두움)이고, `neutral-800` 이 거의
 * 흰색이다. 표준 Tailwind 감각으로 `text-neutral-300` 을 본문에 쓰면 어두운 배경에
 * 어두운 글씨가 된다.
 *
 * 실제로 그렇게 만들어 배포했고, 설치 화면이 "누리끼리해서 안 보인다"는 지적을
 * 받았다. 계산해 보니 경고 배너가 1.74:1, 본문이 1.82:1 이었다(WCAG AA 는 4.5:1).
 *
 * 앱 전체에는 `text-neutral-300` 을 '비활성/0값'의 흐림 표현으로 일부러 쓰는 곳이
 * 있어 일괄 금지할 수 없다. 그래서 **배포판에서 새로 만든 화면만** 검사한다.
 */
const ROOT = process.cwd();
const CANVAS = "#0a0a0a"; // tailwind.config.ts 의 canvas
const MIN_RATIO = 4.5; // WCAG AA (본문)

/** 배포판에서 새로 만든 화면 — 교사가 설치 중 처음 보는 것들이라 특히 중요하다. */
const SCREENS = [
  "app/setup/page.tsx",
  "app/setup/setup-form.tsx",
  "app/login/page.tsx",
  "app/login/magic-link-form.tsx",
  "app/(shell)/setting/system/page.tsx",
  "app/(shell)/setting/system/neis-key-form.tsx",
  "app/ui/feature-off.tsx",
];

/**
 * tailwind.config.ts 에서 재정의된 색 스케일을 읽는다.
 *
 * 색군 이름을 하나씩 찾는다 — 통째로 훑으면 바깥 블록(`theme: {`)이 먼저 잡혀
 * 안쪽 색군을 삼킨다(처음에 그렇게 만들어 neutral 을 통째로 놓쳤다).
 */
const COLORS = ["neutral", "amber", "red", "emerald"] as const;

function parseScale(): Record<string, Record<string, string>> {
  const cfg = readFileSync(path.join(ROOT, "tailwind.config.ts"), "utf8");
  const scale: Record<string, Record<string, string>> = {};
  for (const name of COLORS) {
    const block = new RegExp(`\\n\\s+${name}: \\{([\\s\\S]*?)\\},`).exec(cfg);
    if (!block) continue;
    const shades: Record<string, string> = {};
    for (const s of block[1].matchAll(/(\d+): "(#[0-9a-fA-F]{6})"/g)) shades[s[1]] = s[2];
    if (Object.keys(shades).length > 0) scale[name] = shades;
  }
  return scale;
}

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(ch[0]) + 0.7152 * f(ch[1]) + 0.0722 * f(ch[2]);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const scale = parseScale();

describe("색 스케일 전제", () => {
  it("이 프로젝트의 neutral 은 반전돼 있다 — 낮은 숫자가 어둡다", () => {
    // 이 전제가 깨지면(예: 표준 스케일로 되돌리면) 아래 검사의 의미가 달라진다.
    expect(luminance(scale.neutral["300"])).toBeLessThan(luminance(scale.neutral["700"]));
  });

  it("amber 도 마찬가지다", () => {
    expect(luminance(scale.amber["200"])).toBeLessThan(luminance(scale.amber["800"]));
  });
});

describe("배포판 화면의 글자 대비", () => {
  for (const file of SCREENS) {
    it(`${file} — 모든 글자색이 캔버스 위에서 ${MIN_RATIO}:1 이상`, () => {
      const src = readFileSync(path.join(ROOT, file), "utf8");
      const failures: string[] = [];

      for (const m of src.matchAll(/(?:hover:)?text-(neutral|amber|red|emerald)-(\d{2,3})\b/g)) {
        const hex = scale[m[1]]?.[m[2]];
        if (!hex) continue; // 스케일에 없는 값은 표준 Tailwind — 여기선 다루지 않는다
        const ratio = contrast(hex, CANVAS);
        if (ratio < MIN_RATIO) {
          failures.push(`${m[0]} (${hex}) = ${ratio.toFixed(2)}:1`);
        }
      }

      expect(failures).toEqual([]);
    });
  }
});
