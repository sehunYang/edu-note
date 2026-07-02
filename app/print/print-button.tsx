"use client";

/**
 * 인쇄 버튼 (계획 §4 Phase2-K-2 인쇄실). 브라우저 인쇄 대화상자를 띄운다.
 * `print:hidden` 으로 인쇄 결과물에서는 자신이 빠진다.
 */
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-full border border-white/25 bg-transparent px-3 py-1.5 text-sm text-white hover:bg-white/10 print:hidden"
    >
      인쇄 / PDF 저장
    </button>
  );
}
