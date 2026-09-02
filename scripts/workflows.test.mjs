import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";

/**
 * GitHub Actions 워크플로 검증.
 *
 * 왜 있는가: 업데이트 전달 워크플로가 **유효하지 않은 YAML 인 채로 배포됐다**.
 * `run: |` 블록 안에 heredoc 을 쓰면서 본문 줄의 들여쓰기가 0 이었고, 그러면 YAML
 * 리터럴 블록이 거기서 끊긴다. 파일이 통째로 무효라 GitHub 은 "Invalid workflow file"
 * 로 표시하고 Actions 탭에 띄우지도 않는다. 당시 검증은 "탭 없음 + 필수 키 존재"만
 * 봤고 그게 통과시켰다. 워크플로는 교사 전원의 업데이트 경로라 조용히 죽으면 아무도
 * 모른다. 그래서 실제 파서로 확인한다.
 */
const DIR = path.join(process.cwd(), ".github", "workflows");
const WORKFLOW = path.join(DIR, "upstream-sync.yml");
const SCRIPT = path.join(process.cwd(), "scripts", "upstream-sync.sh");
const TEMPLATE = path.join(process.cwd(), "lib", "setup", "workflow-template.ts");

const files = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));

describe("워크플로 파일", () => {
  it("검사할 파일이 있다", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    describe(file, () => {
      const text = readFileSync(path.join(DIR, file), "utf8");

      it("유효한 YAML 이다", () => {
        expect(() => load(text)).not.toThrow();
      });

      it("탭 문자가 없다 (YAML 은 탭 들여쓰기를 금지한다)", () => {
        expect(text).not.toMatch(/\t/);
      });

      it("run 블록 안에 heredoc 이 없다 — 블록을 끊어 파일을 무효로 만든다", () => {
        expect(text).not.toMatch(/<<-?\s*['"]?[A-Z]+['"]?\s*$/m);
      });

      it("트리거와 job 이 정의돼 있다", () => {
        // YAML 1.1 에서 맨 앞의 `on:` 은 불리언 true 키로 파싱된다.
        const doc = load(text);
        const triggers = doc.on ?? doc[true];
        expect(triggers).toBeTruthy();
        expect(Object.keys(doc.jobs ?? {}).length).toBeGreaterThan(0);
      });
    });
  }
});

describe("업데이트 전달 워크플로", () => {
  // 파싱을 it 안에서 한다. describe 본문에서 던지면 수집 단계가 죽어 "no tests" 만
  // 보이고 무엇이 왜 깨졌는지 알 수 없다.
  const read = () => {
    const doc = load(readFileSync(WORKFLOW, "utf8"));
    return { doc, triggers: doc.on ?? doc[true], job: doc.jobs.sync };
  };

  it("수동 실행 버튼이 있다 — 교사가 기다리지 않고 확인할 수 있어야 한다", () => {
    expect(read().triggers).toHaveProperty("workflow_dispatch");
  });

  it("정기 확인이 걸려 있다", () => {
    expect(read().triggers.schedule?.[0]?.cron).toBeTruthy();
  });

  it("PR 을 만들 권한을 선언한다", () => {
    const { doc } = read();
    expect(doc.permissions["pull-requests"]).toBe("write");
    expect(doc.permissions.contents).toBe("write");
  });

  it("전체 이력을 받아온다 — 얕은 체크아웃이면 병합 판정이 불가능하다", () => {
    const { job } = read();
    const checkout = job.steps.find((s) => (s.uses ?? "").startsWith("actions/checkout"));
    expect(checkout.with["fetch-depth"]).toBe(0);
  });

  it("로직은 scripts/upstream-sync.sh 를 호출한다", () => {
    const { job } = read();
    const runs = job.steps.map((s) => s.run ?? "").join("\n");
    expect(runs).toContain("scripts/upstream-sync.sh");
  });

  it("짧다 — 교사가 클릭 한 번으로 만들 수 있어야 한다", () => {
    // Vercel Deploy 버튼은 .github/ 를 전달하지 못한다. 그래서 교사가 이 파일을 직접
    // 만들어야 하고, 앱은 내용을 URL 에 담아 GitHub 편집기를 열어 준다. 파일이 길면
    // 그 URL 이 감당하지 못한다. 로직을 스크립트로 뺀 이유다.
    expect(readFileSync(WORKFLOW, "utf8").length).toBeLessThan(1500);
  });
});

describe("scripts/upstream-sync.sh — 실제 동기화 로직", () => {
  const script = () => readFileSync(SCRIPT, "utf8");

  it("원본 저장소에서는 작업하지 않고 이유를 남긴다", () => {
    // 조용히 끝내면 "아무 일도 안 했다"는 혼란만 남는다(실제로 겪음).
    expect(script()).toContain("GITHUB_REPOSITORY");
    expect(script()).toContain("::notice::");
  });

  it("이력이 없는 복제본도 처리한다 (unrelated histories)", () => {
    expect(script()).toContain("merge-base");
    expect(script()).toContain("read-tree");
  });

  it("파괴적 마이그레이션을 표기 규칙으로 찾아 경고한다", () => {
    expect(script()).toContain("DESTRUCTIVE");
  });

  it("PR 생성에 실패하면 켜야 할 설정과 직접 여는 링크를 알려준다", () => {
    expect(script()).toContain("approve pull requests");
    expect(script()).toContain("/compare/");
  });

  it(".github 는 동기화에서 제외한다 — 포함하면 push 가 거부돼 업데이트가 통째로 실패한다", () => {
    // GITHUB_TOKEN 은 워크플로 파일을 만들거나 고칠 수 없다(PAT 필요). 원본의 워크플로가
    // 한 글자만 달라져도 push 가 "refusing to allow a GitHub App to create or update
    // workflow" 로 거부된다.
    const s = script();
    expect(s).toContain("WORKFLOW_CHANGED");
    expect(s).toMatch(/git checkout "\$BASE" -- \.github/);
  });

  it("실행 요약에 결과를 남긴다 — 로그를 펼치지 않아도 보여야 한다", () => {
    const s = script();
    expect(s).toContain("GITHUB_STEP_SUMMARY");
    expect(s).toContain("${MODE}");
  });

  it("adopt 모드에서는 커밋 수를 세지 않는다 — 이력이 없어 늘 원본 전체 수가 나온다", () => {
    // 실측(2026-09-01): Vercel 이 만든 저장소는 이력을 물려받지 않아 adopt 였고,
    // "원본에 이 저장소에 없는 커밋: 129개" 라는 의미 없는 숫자가 매번 나왔다.
    // adopt 에서는 내용을 직접 비교한다.
    const s = script();
    expect(s).toContain("':(exclude).github'");
  });
});

describe("앱에 내장된 워크플로 사본", () => {
  it("실제 파일과 글자 단위로 같다", () => {
    // 교사 저장소에는 .github 가 없어 디스크에서 읽을 수 없다. 그래서 앱이 문자열로
    // 들고 있는데, 실제 파일과 어긋나면 교사가 낡은 워크플로를 설치하게 된다.
    const onDisk = readFileSync(WORKFLOW, "utf8");
    const embedded = readFileSync(TEMPLATE, "utf8");
    const m = embedded.match(/export const UPSTREAM_SYNC_WORKFLOW = ("(?:[^"\\]|\\.)*");/);
    expect(m).toBeTruthy();
    expect(JSON.parse(m[1])).toBe(onDisk);
  });
});
