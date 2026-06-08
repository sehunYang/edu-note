/**
 * 세특 유형 한글 표기 + 바이트 상한 묶음 (계획 §3.4).
 * byteLimit 의 단일 진실원은 /lib/domain/byte-count(BYTE_LIMITS).
 */
import type { SpecialNoteType } from "@/lib/domain/types";
import { BYTE_LIMITS } from "@/lib/domain/byte-count";

export const NOTE_TYPE_LABEL: Record<SpecialNoteType, string> = {
  autonomy: "자율활동 특기사항",
  club: "동아리활동 특기사항",
  career: "진로활동 특기사항",
  subject: "교과 세부능력 및 특기사항",
  behavior: "행동특성 및 종합의견",
};

export function noteTypeLabel(type: SpecialNoteType): string {
  return NOTE_TYPE_LABEL[type];
}

export function noteByteLimit(type: SpecialNoteType): number {
  return BYTE_LIMITS[type];
}
