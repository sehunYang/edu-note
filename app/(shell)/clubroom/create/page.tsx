import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { getOwnerClub } from "@/lib/db/queries";
import { createClubAction, deleteClubAction } from "./actions";
import { Button } from "@/app/ui/button";

export const dynamic = "force-dynamic";

/**
 * 동아리 개설 (QC v5 c9 D.2, AC-9.3). 교사 단일 동아리 전제 — 동아리가 없으면
 * 개설 폼을, 있으면 현황 카드 + 삭제 버튼을 노출한다. getOwnerId+getDb 로드 →
 * 서버액션(createClubAction/deleteClubAction).
 */
export default async function ClubroomCreatePage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const club = await getOwnerClub(db, ownerId);

  return (
    <div>
      <h2 className="text-lg font-normal text-neutral-800">동아리 개설</h2>
      <p className="mt-1 text-sm text-neutral-500">
        담당 동아리를 1개 만듭니다. 부원 배정·활동 계획·활동 입력·생기부 작성은
        동아리를 만든 뒤 사용할 수 있습니다.
      </p>

      {club ? (
        <section className="mt-6 rounded-lg border border-neutral-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-normal text-neutral-800">{club.name}</h3>
              <p className="mt-1 text-xs text-neutral-400">
                부원 {club.memberCount}명
              </p>
            </div>
            <form action={deleteClubAction} className="inline">
              <input type="hidden" name="id" value={club.id} />
              <button className="text-xs text-red-500 hover:underline">
                동아리 삭제
              </button>
            </form>
          </div>
          <p className="mt-3 text-xs text-neutral-400">
            동아리를 삭제하면 부원·활동 차시가 함께 삭제됩니다.
          </p>
        </section>
      ) : (
        <section className="mt-6 rounded-lg border border-neutral-200 p-5">
          <h3 className="text-sm font-normal text-neutral-700">새 동아리</h3>
          <form action={createClubAction} className="mt-3 flex flex-wrap gap-2">
            <input
              name="name"
              required
              placeholder="동아리명"
              className="flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm"
            />
            <Button className="px-3 py-1.5 text-sm">
              만들기
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}
