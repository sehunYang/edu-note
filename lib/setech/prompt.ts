/**
 * 코워크 프롬프트 번들 어셈블러 (계획 §3.3 결정2, §4 C).
 *
 * 순수 함수: 원천 데이터 묶음 + 지침 텍스트 → 클립보드에 복사할 프롬프트 문자열.
 * 서버 Claude 호출이 아니라, 교사가 이 텍스트를 코워크(Claude Code)에 붙여넣는다.
 */
import { noteByteLimit, noteTypeLabel } from "./labels";
import type { SetechSourceBundle, SetechPerformance } from "./types";

function section(title: string, lines: string[]): string {
  if (lines.length === 0) return "";
  const body = lines
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => `- ${l}`)
    .join("\n");
  return body.length === 0 ? "" : `## ${title}\n${body}\n`;
}

function performanceLine(p: SetechPerformance): string {
  let line = p.name.trim();
  if (p.score != null && String(p.score).trim().length > 0) {
    line += ` (점수: ${String(p.score).trim()})`;
  }
  if (p.prose != null && p.prose.trim().length > 0) {
    line += `: ${p.prose.trim()}`;
  }
  return line;
}

export interface BuildPromptOptions {
  /** /content/세특 작성 지침.md 의 내용. 비우면 지침 섹션 생략. */
  guidelineText?: string;
}

/** 원천 묶음 → 코워크에 붙여넣을 프롬프트 텍스트. */
export function buildSetechPrompt(
  bundle: SetechSourceBundle,
  options: BuildPromptOptions = {},
): string {
  const label = noteTypeLabel(bundle.noteType);
  const limit = noteByteLimit(bundle.noteType);
  const subject =
    bundle.noteType === "subject" && bundle.subjectName
      ? ` (과목: ${bundle.subjectName.trim()})`
      : "";

  const blocks: string[] = [];

  blocks.push(
    `# 세특 생성 요청 — ${label}${subject}\n` +
      `아래 지침과 원천 자료를 바탕으로 학생부 특기사항 초안을 작성해 주세요.`,
  );

  blocks.push(
    `## 작성 조건\n` +
      `- 유형: ${label}\n` +
      `- 바이트 상한: ${limit} (한글3·영숫특공백1·줄바꿈2)\n` +
      `- 명사형 종결(~함/~음), 1인칭·감상·학생 이름 미사용\n` +
      `- 기재 금지(수상·모의고사 성적·인증시험·외부기관·보호자 정보) 절대 제외\n` +
      `- 구체 활동 → 역량 연결의 흐름으로 개별화`,
  );

  if (options.guidelineText && options.guidelineText.trim().length > 0) {
    blocks.push(`## 작성 지침\n${options.guidelineText.trim()}`);
  }

  blocks.push(
    section("관찰 기록", bundle.observations),
    section("수행평가", bundle.performances.map(performanceLine)),
    section("활동 기입", bundle.activities),
    section("추가 메모", bundle.extraNotes),
    section("키워드", bundle.keywords),
  );

  blocks.push(
    `## 출력\n` +
      `- 위 자료만 사용(없는 사실 창작 금지).\n` +
      `- ${limit}바이트 이내의 완성된 ${label} 본문만 출력.`,
  );

  return blocks.filter((b) => b.trim().length > 0).join("\n\n");
}
