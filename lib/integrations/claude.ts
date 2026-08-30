import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { anthropicApiKey } from "@/lib/config/env";

/**
 * 서버 전용 Claude 클라이언트.
 *
 * 계획 §3.1/§3.2: ANTHROPIC_API_KEY 는 서버 env 에만 존재하며 클라이언트 번들에
 * 절대 노출되지 않는다. `server-only` 임포트로 클라이언트 컴포넌트에서의 사용을
 * 빌드타임에 차단한다.
 */

export const CLAUDE_MODELS = {
  // 깊은 추론/긴 세특: Opus. 표준 생성: Sonnet.
  opus: "claude-opus-4-8",
  sonnet: "claude-sonnet-4-6",
} as const;

export type ClaudeModel = (typeof CLAUDE_MODELS)[keyof typeof CLAUDE_MODELS];

let cachedClient: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  const apiKey = anthropicApiKey();
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY 가 설정되지 않았습니다. 서버 env 에 등록하세요.",
    );
  }
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey });
  }
  return cachedClient;
}
