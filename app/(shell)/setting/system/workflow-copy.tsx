"use client";
import { useState } from "react";

/**
 * 워크플로 내용 복사 (배포판 S6 보조 경로).
 *
 * `GitHub 에서 켜기` 링크는 파일 경로와 내용을 미리 채운 편집기를 연다. 다만 GitHub 이
 * 내용까지 채워 주는지는 환경에 따라 확실하지 않아, 빈 편집기가 뜨더라도 교사가 막히지
 * 않도록 같은 화면에서 내용을 복사할 수 있게 둔다. 링크가 잘 동작하면 이 부분은
 * 접힌 채로 지나가면 된다.
 */
export function WorkflowCopy({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 권한이 없으면 아래 본문을 직접 선택해 복사하면 된다.
      setCopied(false);
    }
  }

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-neutral-500">
        편집기가 비어 있나요? 내용 복사하기
      </summary>
      <div className="mt-2">
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-hairline px-3 py-1.5 text-xs hover:bg-white/5"
        >
          {copied ? "복사됨 ✓" : "클립보드로 복사"}
        </button>
        <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-hairline bg-black/30 p-3 text-[0.6875rem] leading-relaxed text-neutral-600">
          {content}
        </pre>
        <p className="mt-2 text-xs text-neutral-500">
          위 내용을 편집기에 붙여넣고 <b className="font-medium">Commit changes</b> 를
          누르세요. 파일 경로는 <code>.github/workflows/upstream-sync.yml</code> 입니다.
        </p>
      </div>
    </details>
  );
}
