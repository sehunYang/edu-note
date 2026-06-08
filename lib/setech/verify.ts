/**
 * 붙여넣기 검수 (계획 §3.3 결정2 — 바이트 검수 + 기재 금지 스캔, AC-C).
 *
 * 코워크에서 생성된 텍스트를 교사가 붙여넣으면, 바이트 상한·기재 금지 사항·문체를
 * 검사해 경고를 돌려준다. 경고는 자문(advisory)이며 교사가 최종 판단한다.
 * 단, `over`(상한 초과)와 `empty` 는 저장 전 반드시 해소돼야 하는 차단성 신호다.
 */
import { checkBytes, type ByteCheck } from "@/lib/domain/byte-count";
import type { SpecialNoteType } from "@/lib/domain/types";

export type SetechWarningKind =
  | "over_limit" // 바이트 상한 초과(차단)
  | "empty" // 빈 내용(차단)
  | "prohibited" // 기재 금지 사항 의심
  | "first_person" // 1인칭/감상 표현
  | "student_name_guess"; // 학생 이름/인칭대명사 의심

export interface SetechWarning {
  kind: SetechWarningKind;
  message: string;
  /** 매칭된 원문 일부(있으면). */
  match?: string;
  /** 저장 차단성 여부. */
  blocking: boolean;
}

export interface SetechVerifyResult {
  byteCheck: ByteCheck;
  warnings: SetechWarning[];
  /** 차단성 경고가 하나도 없으면 true(저장 가능). */
  ok: boolean;
}

/** NEIS 기재 금지 사항 패턴(자문 스캔). 라벨→정규식. */
export const PROHIBITED_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "수상/대회 실적", re: /수상|입상|대회\s*(?:수상|입상|\d+\s*등|금상|은상|동상|대상)|경시대회|올림피아드/ },
  { label: "모의고사/학평 성적", re: /모의고사|모의\s*평가|전국연합|학력평가|백분위|표준점수/ },
  { label: "어학/인증 시험", re: /TOEIC|TOEFL|TEPS|토익|토플|텝스|한국사능력검정|HSK|JLPT/i },
  { label: "자격증/인증 취득", re: /자격증|인증서|급수|단증|\d+\s*급\s*(?:취득|합격|자격)/ },
  { label: "논문/출간/특허", re: /논문|학회지|등재|출간|저서|발명\s*특허|특허\s*출원/ },
  { label: "외부 기관/대학 프로그램", re: /영재원|대학\s*(?:주관|연계|부설)|R&E|외부\s*기관/ },
  { label: "보호자 사회·경제 지위", re: /아버지(?:는|가|의)|어머니(?:는|가|의)|부모(?:님)?(?:의)?\s*(?:직업|사업|회사|기업|대표|의사|변호사|교수)/ },
];

/** 1인칭/감상 표현 패턴. */
const FIRST_PERSON_RE = /(?:^|[\s,.])(?:나는|내가|저는|제가|느꼈|기특|대견|뿌듯|훌륭하다고\s*생각)/;

/**
 * 붙여넣은 세특 초안을 검수한다.
 * @param studentName 학생 이름(본문 노출 의심 검사용, 선택).
 */
export function verifyPastedDraft(
  text: string,
  type: SpecialNoteType,
  studentName?: string,
): SetechVerifyResult {
  const trimmed = text.trim();
  const byteCheck = checkBytes(text, type);
  const warnings: SetechWarning[] = [];

  if (trimmed.length === 0) {
    warnings.push({
      kind: "empty",
      message: "내용이 비어 있습니다.",
      blocking: true,
    });
  }

  if (byteCheck.over) {
    warnings.push({
      kind: "over_limit",
      message: `바이트 상한 초과: ${byteCheck.byteCount} / ${byteCheck.byteLimit} (${-byteCheck.remaining}byte 초과)`,
      blocking: true,
    });
  }

  for (const { label, re } of PROHIBITED_PATTERNS) {
    const m = text.match(re);
    if (m) {
      warnings.push({
        kind: "prohibited",
        message: `기재 금지 의심(${label})`,
        match: m[0].trim(),
        blocking: false,
      });
    }
  }

  const fp = text.match(FIRST_PERSON_RE);
  if (fp) {
    warnings.push({
      kind: "first_person",
      message: "1인칭/감상 표현 의심 — 명사형·관찰사실 위주로 다듬으세요.",
      match: fp[0].trim(),
      blocking: false,
    });
  }

  if (studentName && studentName.trim().length >= 2) {
    const name = studentName.trim();
    if (text.includes(name)) {
      warnings.push({
        kind: "student_name_guess",
        message: "본문에 학생 이름이 노출된 것으로 보입니다(주어 생략).",
        match: name,
        blocking: false,
      });
    }
  }

  const ok = !warnings.some((w) => w.blocking);
  return { byteCheck, warnings, ok };
}
