import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  getOwnerClub,
  reconcileClubActivitySessions,
} from "@/lib/db/queries";
import { reconcileAction, updatePlanAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * 활동 계획 (QC v5 c9 D.4, AC-9.5). 진입 시 club 캘린더 이벤트 → 차시 동기화
 * (reconcileClubActivitySessions, (clubId,date) 키로 plannedActivity 보존)한 뒤
 * 차시 목록(ordinal+날짜)을 표시한다. 각 차시 예정활동을 입력/저장한다.
 */
export default async function ClubroomPlanPage() {
  const ownerId = await getOwnerId();
  const db = getDb();

  const club = await getOwnerClub(db, ownerId);
  if (!club) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-neutral-800">활동 계획</h2>
        <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          아직 개설된 동아리가 없습니다. <strong>동아리 개설</strong> 탭에서 먼저
          동아리를 만드세요.
        </p>
      </div>
    );
  }

  // 진입 시 차시 동기화(학사일정 club 이벤트 기준, plannedActivity 보존).
  const sessions = await reconcileClubActivitySessions(db, ownerId, club.id);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-800">
          활동 계획 — {club.name}
        </h2>
        <form action={reconcileAction} className="inline">
          <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50">
            차시 동기화
          </button>
        </form>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        학사일정의 동아리 활동일을 차시로 자동 생성합니다. 차시마다 예정 활동을
        기입하세요.
      </p>

      {sessions.length === 0 ? (
        <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          동아리 활동일이 없습니다. 세팅실 학사일정에서 동아리 활동일을 등록한 뒤
          차시 동기화를 누르세요.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="rounded-lg border border-neutral-200 p-4"
            >
              <div className="text-xs text-neutral-400">
                {s.ordinal}차시 · {s.date}
              </div>
              <form
                action={updatePlanAction}
                className="mt-2 flex flex-wrap items-center gap-2"
              >
                <input type="hidden" name="sessionId" value={s.id} />
                <input
                  name="plannedActivity"
                  defaultValue={s.plannedActivity ?? ""}
                  placeholder="예정 활동"
                  className="flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm"
                />
                <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
                  저장
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
