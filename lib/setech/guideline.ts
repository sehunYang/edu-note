import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * 세특 작성 지침 로더 (계획 §3.3 — 레포 자산 파일).
 * /content/세특 작성 지침.md 를 읽어 프롬프트 번들에 삽입한다.
 * 파일 부재 시 빈 문자열(번들에서 지침 섹션 생략)로 graceful fallback.
 */
const GUIDELINE_PATH = path.join(
  process.cwd(),
  "content",
  "세특 작성 지침.md",
);

let _cache: string | null = null;

export async function loadGuideline(): Promise<string> {
  if (_cache !== null) return _cache;
  try {
    _cache = await readFile(GUIDELINE_PATH, "utf8");
  } catch {
    _cache = "";
  }
  return _cache;
}
