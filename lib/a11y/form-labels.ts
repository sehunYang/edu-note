/**
 * 폼 라벨 정적 검사 (사용성 개선 P1-7). JSX 소스에서 라벨 없는 폼 컨트롤을
 * 찾아낸다 — 순수 함수라 테스트에서 app/**\/*.tsx 전체에 돌려 회귀를 막는다.
 *
 * 이 검사가 생긴 이유: 실측 결과 수업 계획실은 폼 컨트롤 9개 중 라벨이 연결된
 * 것이 0개였고, 7개가 플레이스홀더만 가지고 있었다. 플레이스홀더는 값을 입력하는
 * 순간 사라지므로 라벨이 아니다(WCAG 3.3.2). 화면에 보이는 <label>이 최선이지만,
 * 최소한 프로그래매틱 이름(aria-label / id+htmlFor)은 100% 있어야 한다.
 *
 * <label>로 감싼 컨트롤은 통과시킨다 — 여는/닫는 <label> 태그를 순차 스캔해
 * 깊이를 세고, 컨트롤이 열린 label 안에 있으면 이름이 있는 것으로 본다.
 */

/** 이름이 없어도 되는 컨트롤 타입(사용자가 값을 읽거나 넣지 않는 것). */
const EXEMPT_TYPES = new Set(["hidden", "submit", "reset", "button", "image"]);

export interface UnlabeledControl {
  /** input | select | textarea */
  tag: string;
  /** 소스 파일 내 1-based 줄 번호 */
  line: number;
  /** 진단용 태그 앞부분 */
  snippet: string;
}

/**
 * JSX 여는 태그의 끝(`>`) 오프셋을 찾는다. 단순히 첫 `>` 를 쓰면
 * `onChange={(e) => ...}` 의 화살표에서 잘려 뒤쪽 속성(aria-label 등)을 통째로
 * 놓친다 — 실제로 이 버그 때문에 라벨이 있는 컨트롤이 없는 것으로 잡히고,
 * 자동 수정이 엉뚱한 라벨을 붙였다. 문자열 리터럴과 중괄호 표현식을 건너뛴다.
 */
export function findTagEnd(source: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return i;
  }
  return -1;
}

/** 여는 태그 문자열에서 속성값을 뽑는다. 문자열 리터럴만 대상(중괄호 표현식은 존재 여부만 판단). */
function attrValue(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
  return m ? m[1] : null;
}

function hasAttr(tag: string, name: string): boolean {
  return new RegExp(`\\b${name}\\s*=`).test(tag);
}

/**
 * 소스에서 라벨 없는 폼 컨트롤 목록을 반환한다.
 * 통과 조건: aria-label / aria-labelledby 가 있거나, id 가 있고 같은 파일에
 * 그 id 를 가리키는 htmlFor 가 있거나, 이름이 필요 없는 타입인 경우.
 */
export function findUnlabeledControls(source: string): UnlabeledControl[] {
  // 문자열 리터럴 id 뿐 아니라 표현식 id 도 짝을 맞춘다 — `id={k}` / `htmlFor={k}`
  // 처럼 같은 변수를 쓰는 패턴이 흔한데, 문자열만 보면 이걸 놓친다.
  const htmlForValues = new Set([
    ...[...source.matchAll(/\bhtmlFor\s*=\s*"([^"]*)"/g)].map((m) => m[1]),
    ...[...source.matchAll(/\bhtmlFor\s*=\s*\{([^}]*)\}/g)].map((m) => m[1].trim()),
  ]);
  const out: UnlabeledControl[] = [];

  // <label> 여닫음 위치를 미리 훑어, 임의 오프셋이 label 안인지 O(1)로 판정한다.
  const labelEvents: { at: number; delta: number }[] = [];
  for (const m of source.matchAll(/<label\b|<\/label>/g)) {
    labelEvents.push({ at: m.index!, delta: m[0] === "</label>" ? -1 : 1 });
  }
  const insideLabel = (offset: number): boolean => {
    let depth = 0;
    for (const e of labelEvents) {
      if (e.at > offset) break;
      depth += e.delta;
    }
    return depth > 0;
  };

  for (const m of source.matchAll(/<(input|select|textarea)\b/g)) {
    const start = m.index!;
    const end = findTagEnd(source, start);
    if (end === -1) continue;
    const tag = source.slice(start, end + 1);

    const type = attrValue(tag, "type");
    if (type && EXEMPT_TYPES.has(type)) continue;

    if (hasAttr(tag, "aria-label") || hasAttr(tag, "aria-labelledby")) continue;

    const id =
      attrValue(tag, "id") ?? tag.match(/\bid\s*=\s*\{([^}]*)\}/)?.[1].trim() ?? null;
    if (id && htmlForValues.has(id)) continue;

    if (insideLabel(start)) continue;

    out.push({
      tag: m[1],
      line: source.slice(0, start).split("\n").length,
      snippet: tag.replace(/\s+/g, " ").slice(0, 90),
    });
  }
  return out;
}
