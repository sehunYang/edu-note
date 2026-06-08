"use client";
import { useState } from "react";

/**
 * 공개 링크 복사 버튼. path(예: /p/<token>)를 받아 현재 origin 기준 절대 URL 을
 * 클립보드에 복사한다(localhost/배포 환경 자동 대응).
 */
export function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // 클립보드 권한 불가 시 fallback(임시 input)
      const el = document.createElement("input");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
      title="공개 링크 복사"
    >
      {copied ? "복사됨 ✓" : "복사"}
    </button>
  );
}
