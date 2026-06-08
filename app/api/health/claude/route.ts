import { NextResponse } from "next/server";
import { getClaudeClient, CLAUDE_MODELS } from "@/lib/integrations/claude";

/**
 * 실행 전 검증 엔드포인트 (계획 §0 / §6 assumptions-to-verify).
 *
 * 목적: 선택한 배포 호스트(Vercel)의 서버 런타임에서 Anthropic API 로의
 * egress 가 차단되지 않고 200 OK 가 돌아오는지 증명한다.
 * (Cloudflare 는 이 호출에서 403 으로 차단되어 탈락했음.)
 *
 * 성공 시: { ok: true, model, reply, latencyMs }
 * 실패 시: { ok: false, error } + 적절한 상태코드
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    const client = getClaudeClient();
    const message = await client.messages.create({
      model: CLAUDE_MODELS.sonnet,
      max_tokens: 16,
      messages: [
        {
          role: "user",
          content: "Reply with exactly: EDU_NOTE_OK",
        },
      ],
    });

    const reply = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    return NextResponse.json({
      ok: true,
      model: message.model,
      reply,
      latencyMs: Date.now() - startedAt,
    });
  } catch (err) {
    const status =
      typeof err === "object" && err !== null && "status" in err
        ? Number((err as { status?: unknown }).status) || 500
        : 500;
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startedAt,
      },
      { status },
    );
  }
}
