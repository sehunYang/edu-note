import { describe, it, expect } from "vitest";
import { buildWorkflowSetupUrl } from "./status";
import { UPSTREAM_SYNC_WORKFLOW } from "./workflow-template";

/**
 * 업데이트 워크플로 설치 링크 (배포판 S6).
 *
 * Vercel Deploy 버튼은 저장소를 복제할 때 .github/ 를 전달하지 못한다(GitHub 이
 * 워크플로 파일 푸시에 별도 권한을 요구한다 — 실배포에서 확인). 그래서 교사가 그
 * 파일 하나를 직접 만들어야 하는데, 이 링크가 내용까지 채워진 편집기를 열어 줘서
 * [Commit changes] 한 번으로 끝나게 한다.
 */
const REPO = { owner: "hong", slug: "edu-note", branch: "main" };

describe("buildWorkflowSetupUrl", () => {
  it("교사의 저장소에 새 파일 편집기를 연다", () => {
    const url = new URL(buildWorkflowSetupUrl(REPO)!);
    expect(url.origin).toBe("https://github.com");
    expect(url.pathname).toBe("/hong/edu-note/new/main");
  });

  it("경로와 내용을 미리 채운다 — 복사·붙여넣기가 없어야 한다", () => {
    const url = new URL(buildWorkflowSetupUrl(REPO)!);
    expect(url.searchParams.get("filename")).toBe(".github/workflows/upstream-sync.yml");
    expect(url.searchParams.get("value")).toBe(UPSTREAM_SYNC_WORKFLOW);
  });

  it("기본 브랜치가 main 이 아니어도 그 브랜치로 연다", () => {
    const url = new URL(buildWorkflowSetupUrl({ ...REPO, branch: "master" })!);
    expect(url.pathname).toBe("/hong/edu-note/new/master");
  });

  it("브라우저가 감당할 길이다 — 워크플로가 길면 이 방식이 무너진다", () => {
    // 로직을 scripts/upstream-sync.sh 로 뺀 이유가 이것이다.
    expect(buildWorkflowSetupUrl(REPO)!.length).toBeLessThan(4000);
  });

  it("저장소 정보를 모르면 null — 화면은 수동 안내로 대체한다", () => {
    // Vercel 프로젝트 설정에서 시스템 환경변수 접근이 꺼져 있으면 알 수 없다.
    expect(buildWorkflowSetupUrl(null)).toBeNull();
  });
});
