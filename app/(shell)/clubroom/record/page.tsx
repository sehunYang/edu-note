import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  collectClubRecordSources,
  getOwnerClub,
  listClubRecordDrafts,
} from "@/lib/db/queries";
import { BYTE_LIMITS } from "@/lib/domain/byte-count";
import { RecordClient } from "./record-client";
import { EmptyState } from "@/app/ui/empty-state";

export const metadata = { title: "동아리 생기부 작성" };

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
        <h2 className="text-base">생기부 작성</h2>
        <div className="mt-8">
          <EmptyState actions={[{ href: "/clubroom/create", label: "동아리 개설" }]}>
            아직 개설된 동아리가 없습니다.
          </EmptyState>
        </div>
      </div>
    );
  }

  const [sources, drafts] = await Promise.all([
    collectClubRecordSources(db, ownerId, club.id),
    listClubRecordDrafts(db, ownerId, club.id),
  ]);

  return (
    <div>
      <h2 className="text-base">
        생기부 작성 — {club.name}
      </h2>
      {sources.length === 0 ? (
        <div className="mt-6">
          <EmptyState actions={[{ href: "/clubroom/assign", label: "부원 배정" }]}>
            배정된 부원이 없습니다.
          </EmptyState>
        </div>
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
