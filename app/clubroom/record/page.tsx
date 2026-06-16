import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  collectClubRecordSources,
  getOwnerClub,
  listClubRecordDrafts,
} from "@/lib/db/queries";
import { BYTE_LIMITS } from "@/lib/domain/byte-count";
import { RecordClient } from "./record-client";

export const dynamic = "force-dynamic";

/**
 * 생기부 작성 (QC v5 c9 D.6, AC-9.7). 부원별 동아리 활동 원천자료(공통+개별 병합)를
 * 표시하고, 편집 후 초안(specialNoteDrafts type='club', 3000byte)을 저장한다.
 * 저장된 초안 목록을 함께 노출한다.
 */
export default async function ClubroomRecordPage() {
  const ownerId = await getOwnerId();
  const db = getDb();

  const club = await getOwnerClub(db, ownerId);
  if (!club) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-neutral-800">생기부 작성</h2>
        <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          아직 개설된 동아리가 없습니다. <strong>동아리 개설</strong> 탭에서 먼저
          동아리를 만드세요.
        </p>
      </div>
    );
  }

  const [sources, drafts] = await Promise.all([
    collectClubRecordSources(db, ownerId, club.id),
    listClubRecordDrafts(db, ownerId, club.id),
  ]);

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-800">
        생기부 작성 — {club.name}
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        부원별 동아리 활동 원천자료(공통 + 개별)를 참고해 생기부 본문을 작성하고
        초안으로 저장합니다(상한 {BYTE_LIMITS["club"]}byte).
      </p>

      {sources.length === 0 ? (
        <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          배정된 부원이 없습니다. <strong>부원 배정</strong> 탭에서 부원을 먼저
          배정하세요.
        </p>
      ) : (
        <RecordClient
          byteLimit={BYTE_LIMITS["club"]}
          sources={sources.map((s) => ({
            studentYearId: s.studentYearId,
            label: `${s.sid} ${s.name}`,
            club: s.club,
          }))}
          drafts={drafts.map((d) => ({
            id: d.id,
            studentYearId: d.studentYearId,
            content: d.content,
            byteCount: d.byteCount,
            byteLimit: d.byteLimit,
          }))}
        />
      )}
    </div>
  );
}
