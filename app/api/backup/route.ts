import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { exportOwnerData, writeAudit } from "@/lib/db/queries";

/**
 * 주간 백업 내보내기 라우트 (계획 §6 — 데이터 손실 1차 안전망).
 * 로그인+allowlist(미들웨어 + getOwnerId 이중 가드) 통과 시 owner 데이터를
 * JSON 첨부로 즉시 다운로드한다. 서버에 보존하지 않는다.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = getDb();
  const backup = await exportOwnerData(db, ownerId);
  await writeAudit(db, ownerId, "backup_export", null, {
    tables: Object.keys(backup.tables).length,
  });

  const stamp = backup.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(backup, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="edu-note-backup-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
