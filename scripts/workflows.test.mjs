import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";

/**
 * GitHub Actions 워크플로 파일 검증.
 *
 * 왜 있는가: 업데이트 전달 워크플로가 **유효하지 않은 YAML 인 채로 배포됐다**.
 * `run: |` 블록 안에 heredoc(<<'BODY')을 쓰면서 본문 줄의 들여쓰기가 0 이었고,
 * 그러면 YAML 리터럴 블록이 거기서 끊긴다. 파일이 통째로 무효라 GitHub 은
 * "Invalid workflow file" 로 표시하고 Actions 탭에 나타나지도 않는다.
 *
 * 당시 검증은 "탭 문자 없음 + 필수 키 존재"만 봤고 그게 통과시켰다. 워크플로는
 * 교사 전원의 업데이트 경로라, 조용히 죽으면 아무도 모른다. 그래서 실제 파서로
 * 확인한다.
 */
const DIR = path.join(process.cwd(), ".github", "workflows");
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
        // 본문 들여쓰기를 지키는 heredoc 도 가능하지만, 한 번 데인 패턴이라
        // 아예 금지하고 들여쓴 echo 로 파일에 쓰는 방식만 쓴다.
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
  // 파싱을 it 안에서 한다. describe 본문에서 던지면 수집 단계가 통째로 죽어
  // "no tests" 만 보이고 무엇이 왜 깨졌는지 알 수 없다(위 파일 검증이 잡아 주긴 하지만
  // 실패 메시지가 읽히는 편이 낫다).
  const read = () => {
    const doc = load(readFileSync(path.join(DIR, "upstream-sync.yml"), "utf8"));
    return { doc, triggers: doc.on ?? doc[true], job: doc.jobs.sync };
  };

  it("수동 실행 버튼이 있다 — 교사가 기다리지 않고 확인할 수 있어야 한다", () => {
    const { triggers } = read();
    expect(triggers).toHaveProperty("workflow_dispatch");
  });

  it("정기 확인이 걸려 있다", () => {
    const { triggers } = read();
    expect(triggers.schedule?.[0]?.cron).toBeTruthy();
  });

  it("원본 저장소에서는 돌지 않는다", () => {
    const { job } = read();
    expect(job.if).toContain("github.repository !=");
  });

  it("PR 을 만들 권한을 선언한다", () => {
    const { doc } = read();
    expect(doc.permissions["pull-requests"]).toBe("write");
    expect(doc.permissions.contents).toBe("write");
  });

  it("이력이 없는 복제본도 처리한다 (unrelated histories)", () => {
    const { job } = read();
    const runs = job.steps.map((s) => s.run ?? "").join("\n");
    expect(runs).toContain("merge-base");
    expect(runs).toContain("read-tree");
  });

  it("전체 이력을 받아온다 — 얕은 체크아웃이면 병합 판정이 불가능하다", () => {
    const { job } = read();
    const checkout = job.steps.find((s) => (s.uses ?? "").startsWith("actions/checkout"));
    expect(checkout.with["fetch-depth"]).toBe(0);
  });

  it("파괴적 마이그레이션을 표기 규칙으로 찾아 경고한다", () => {
    const { job } = read();
    const runs = job.steps.map((s) => s.run ?? "").join("\n");
    expect(runs).toContain("DESTRUCTIVE");
  });
});
