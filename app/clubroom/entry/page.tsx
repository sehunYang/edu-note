import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  getOwnerClub,
  listClubActivityRecords,
  listClubActivitySessions,
  listClubMembers,
} from "@/lib/db/queries";
import { saveCommonAction, saveOverrideAction } from "./actions";
import { Button } from "@/app/ui/button";

export const dynamic = "force-dynamic";

/**
 * 활동 입력 (QC v5 c9 D.5, AC-9.6). 차시(날짜)별 공통내용 + 부원별 개별 메모를
 * 입력한다. 차시는 활동 계획에서 동기화된 club_activity_sessions 기준. 기존 입력은
 * listClubActivityRecords 로 prefill 한다.
 */
export default async function ClubroomEntryPage() {
  const ownerId = await getOwnerId();
  const db = getDb();

  const club = await getOwnerClub(db, ownerId);
  if (!club) {
    return (
      <div>
        <h2 className="text-lg font-normal text-neutral-800">활동 입력</h2>
        <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          아직 개설된 동아리가 없습니다. <strong>동아리 개설</strong> 탭에서 먼저
          동아리를 만드세요.
        </p>
      </div>
    );
  }

  const [sessions, members, records] = await Promise.all([
    listClubActivitySessions(db, ownerId, club.id),
    listClubMembers(db, ownerId, club.id),
    listClubActivityRecords(db, ownerId, club.id),
  ]);

  const recordByDate = new Map(records.map((r) => [r.activityDate, r]));

  return (
    <div>
      <h2 className="text-lg font-normal text-neutral-800">
        활동 입력 — {club.name}
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        차시별 공통 활동 내용과 부원별 개별 메모를 기입합니다.
      </p>

      {sessions.length === 0 ? (
        <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          차시가 없습니다. <strong>활동 계획</strong> 탭에서 차시를 먼저
          동기화하세요.
        </p>
      ) : members.length === 0 ? (
        <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          배정된 부원이 없습니다. <strong>부원 배정</strong> 탭에서 부원을 먼저
          배정하세요.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {sessions.map((s) => {
            const rec = recordByDate.get(s.date);
            const overrideByStudent = new Map(
              (rec?.overrides ?? []).map((o) => [o.studentYearId, o.body]),
            );
            return (
              <section
                key={s.id}
                className="rounded-lg border border-neutral-200 p-4"
              >
                <div className="text-xs text-neutral-400">
                  {s.ordinal}차시 · {s.date}
                  {s.plannedActivity && (
                    <span className="ml-2">예정: {s.plannedActivity}</span>
                  )}
                </div>

                <form action={saveCommonAction} className="mt-2">
                  <input type="hidden" name="activityDate" value={s.date} />
                  <label className="text-xs font-normal text-neutral-600">
                    공통 내용
                  </label>
                  <textarea
                    name="commonBody"
                    defaultValue={rec?.commonBody ?? ""}
                    rows={2}
                    className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5 text-sm"
                  />
                  <Button className="mt-1 px-3 py-1 text-sm">
                    공통 저장
                  </Button>
                </form>

                <div className="mt-4 space-y-2 border-t border-neutral-100 pt-3">
                  <p className="text-xs font-normal text-neutral-600">
                    부원별 개별 메모
                  </p>
                  {members.map((m) => (
                    <form
                      key={m.id}
                      action={saveOverrideAction}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input
                        type="hidden"
                        name="activityDate"
                        value={s.date}
                      />
                      <input
                        type="hidden"
                        name="studentYearId"
                        value={m.studentYearId}
                      />
                      {rec && (
                        <input type="hidden" name="recordId" value={rec.id} />
                      )}
                      <span className="w-32 shrink-0 text-sm text-neutral-600">
                        {m.sid} {m.name}
                      </span>
                      <input
                        name="body"
                        defaultValue={overrideByStudent.get(m.studentYearId) ?? ""}
                        placeholder="개별 메모(선택)"
                        className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
                      />
                      <Button className="px-3 py-1 text-sm">
                        저장
                      </Button>
                    </form>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
