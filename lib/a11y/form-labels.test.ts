import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { findUnlabeledControls, findTagEnd } from "./form-labels";

describe("findTagEnd — JSX 여는 태그 끝 찾기", () => {
  it("화살표 함수의 '>' 에 속지 않는다", () => {
    const src = `<input onChange={(e) => set(e)} aria-label="이름" />`;
    expect(findTagEnd(src, 0)).toBe(src.length - 1);
  });
  it("중첩 중괄호를 통과한다", () => {
    const src = `<select onChange={() => { if (a > b) f(); }} aria-label="x" >`;
    expect(findTagEnd(src, 0)).toBe(src.length - 1);
  });
  it("문자열 안의 '>' 를 무시한다", () => {
    const src = `<input placeholder="a > b" />`;
    expect(findTagEnd(src, 0)).toBe(src.length - 1);
  });
  it("닫히지 않으면 -1", () => {
    expect(findTagEnd("<input value={", 0)).toBe(-1);
  });
});

describe("파서 회귀 — 화살표 함수 뒤의 aria-label 을 인식한다", () => {
  it("onChange 뒤에 있는 aria-label 도 통과 처리", () => {
    const src = `<textarea value={b} onChange={(e) => setB(e.target.value)} aria-label="관찰 내용" />`;
    expect(findUnlabeledControls(src)).toHaveLength(0);
  });
});

describe("findUnlabeledControls — 규칙", () => {
  it("aria-label 이 있으면 통과", () => {
    expect(findUnlabeledControls(`<input aria-label="이름" />`)).toHaveLength(0);
  });
  it("aria-labelledby 가 있으면 통과", () => {
    expect(findUnlabeledControls(`<select aria-labelledby="x" />`)).toHaveLength(0);
  });
  it("id 를 가리키는 htmlFor 가 같은 파일에 있으면 통과", () => {
    const src = `<label htmlFor="a">이름</label><input id="a" />`;
    expect(findUnlabeledControls(src)).toHaveLength(0);
  });
  it("표현식 id/htmlFor 짝(id={k} · htmlFor={k})도 통과", () => {
    const src = `<label htmlFor={k}>이름</label><input id={k} />`;
    expect(findUnlabeledControls(src)).toHaveLength(0);
  });
  it("표현식이 서로 다르면 실패", () => {
    const src = `<label htmlFor={a}>이름</label><input id={b} />`;
    expect(findUnlabeledControls(src)).toHaveLength(1);
  });
  it("id 는 있지만 대응하는 htmlFor 가 없으면 실패", () => {
    expect(findUnlabeledControls(`<input id="a" />`)).toHaveLength(1);
  });
  it("플레이스홀더만 있으면 실패(입력 시 사라지므로 라벨이 아님)", () => {
    const found = findUnlabeledControls(`<input placeholder="이름" />`);
    expect(found).toHaveLength(1);
    expect(found[0].tag).toBe("input");
  });
  it("hidden/submit 등 이름이 필요 없는 타입은 면제", () => {
    expect(
      findUnlabeledControls(`<input type="hidden" name="x" /><input type="submit" />`),
    ).toHaveLength(0);
  });
  it("줄 번호를 1-based 로 보고한다", () => {
    expect(findUnlabeledControls(`a\nb\n<input />`)[0].line).toBe(3);
  });
  it("<label>로 감싼 컨트롤은 통과", () => {
    expect(
      findUnlabeledControls(`<label><input type="radio" />조회</label>`),
    ).toHaveLength(0);
  });
  it("label 을 닫은 뒤의 컨트롤은 다시 검사 대상", () => {
    const src = `<label><input type="radio" />조회</label><input />`;
    expect(findUnlabeledControls(src)).toHaveLength(1);
  });
  it("여러 컨트롤을 모두 찾는다", () => {
    expect(
      findUnlabeledControls(`<input /><select /><textarea />`),
    ).toHaveLength(3);
  });
});

/** app 디렉터리의 모든 .tsx 를 재귀 수집. */
function collectTsx(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectTsx(p, acc);
    else if (e.name.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

describe("app 전체 — 라벨 없는 폼 컨트롤 0건 유지", () => {
  it("모든 input/select/textarea 에 프로그래매틱 이름이 있다", () => {
    const root = path.join(process.cwd(), "app");
    const offenders: string[] = [];
    for (const file of collectTsx(root)) {
      const found = findUnlabeledControls(fs.readFileSync(file, "utf8"));
      for (const f of found) {
        offenders.push(
          `${path.relative(process.cwd(), file)}:${f.line} <${f.tag}> ${f.snippet}`,
        );
      }
    }
    expect(offenders, `\n라벨 누락 ${offenders.length}건:\n${offenders.join("\n")}\n`).toEqual([]);
  });
});
