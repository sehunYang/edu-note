/**
 * 브라우저에서 텍스트(CSV)를 파일로 내려받는다. 한글 Excel 호환을 위해 BOM 부착.
 * 클라이언트 컴포넌트의 이벤트 핸들러에서만 호출한다(document/Blob 사용).
 */
export function downloadCsv(content: string, fileName: string): void {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
