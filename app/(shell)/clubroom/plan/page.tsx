import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  getOwnerClub,
  reconcileClubActivitySessions,
} from "@/lib/db/queries";
import { reconcileAction, updatePlanAction } from "./actions";
import { Button } from "@/app/ui/button";
import { EmptyState } from "@/app/ui/empty-state";

export const metadata = { title: "동아리 활동 계획" };

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
        <h2 className="text-base">활동 계획</h2>
        <div className="mt-8">
          <EmptyState actions={[{ href: "/clubroom/create", label: "동아리 개설" }]}>
            아직 개설된 동아리가 없습니다. 먼저 동아리를 만드세요.
          </EmptyState>
        </div>
      </div>
    );
  }

  // 진입 시 차시 동기화(학사일정 club 이벤트 기준, plannedActivity 보존).
  const sessions = await reconcileClubActivitySessions(db, ownerId, club.id);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base">
          활동 계획 — {club.name}
        </h2>
        <form action={reconcileAction} className="inline">
          <Button className="px-3 py-1.5 text-sm text-neutral-700">
            차시 동기화
          </Button>
        </form>
      </div>
      <p className="mt-0.5 text-xs text-neutral-400">
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
                <input aria-label="예정 활동"
                  name="plannedActivity"
                  defaultValue={s.plannedActivity ?? ""}
                  placeholder="예정 활동"
                  className="flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm"
                />
                <Button className="px-3 py-1.5 text-sm">
                  저장
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
