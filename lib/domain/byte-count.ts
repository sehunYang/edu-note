/**
 * 바이트 카운터 (계획 §3.4 byteCount, 제약 §3).
 *
 * 규칙: 한글 = 3, 줄바꿈 = 2, 그 외(영문/숫자/특수/공백) = 1.
 * 상한은 NEIS 실제값의 2배(초안 여유). 클라이언트 UI 에서도 그대로 사용한다.
 */
import type { SpecialNoteType } from "./types";

// 한글: 음절(AC00–D7A3) + 자모(1100–11FF, 3130–318F, A960–A97F, D7B0–D7FF)
const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]/;

export const BYTE_PER = {
  hangul: 3,
  linebreak: 2,
  other: 1,
} as const;

/** 특기사항 유형별 바이트 상한 (계획 §3.4). */
export const BYTE_LIMITS: Record<SpecialNoteType, number> = {
  autonomy: 3000, // 자율
  club: 3000, // 동아리
  career: 4200, // 진로
  subject: 3000, // 교과세특
  behavior: 3000, // 행동발달
};

/** 문자열의 NEIS 바이트 수를 센다. \r\n / \r 은 줄바꿈 1회(2byte)로 정규화. */
export function byteLength(text: string): number {
  const normalized = text.replace(/\r\n?/g, "\n");
  let total = 0;
  for (const ch of normalized) {
    if (ch === "\n") total += BYTE_PER.linebreak;
    else if (HANGUL.test(ch)) total += BYTE_PER.hangul;
    else total += BYTE_PER.other;
  }
  return total;
}

export interface ByteCheck {
  byteCount: number;
  byteLimit: number;
  remaining: number;
  over: boolean;
}

/** 유형 상한 대비 검사 결과. */
export function checkBytes(text: string, type: SpecialNoteType): ByteCheck {
  const byteCount = byteLength(text);
  const byteLimit = BYTE_LIMITS[type];
  return {
    byteCount,
    byteLimit,
    remaining: byteLimit - byteCount,
    over: byteCount > byteLimit,
  };
}
