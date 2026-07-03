"use client";
import { Button } from "@/app/ui/button";


/**
 * 인쇄 버튼 (계획 §4 Phase2-K-2 인쇄실). 브라우저 인쇄 대화상자를 띄운다.
 * `print:hidden` 으로 인쇄 결과물에서는 자신이 빠진다.
 */
export function PrintButton() {
  return (
    <Button
      onClick={() => window.print()}
      className="px-3 py-1.5 text-sm print:hidden"
    >
      인쇄 / PDF 저장
    </Button>
  );
}
