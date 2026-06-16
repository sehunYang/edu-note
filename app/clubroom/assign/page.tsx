import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { getOwnerClub, listClubMembers, listStudents } from "@/lib/db/queries";
import { addClubMemberAction, removeClubMemberAction } from "./actions";
import { AssignClient } from "./assign-client";

export const dynamic = "force-dynamic";

/**
 * 부원 배정 (QC v5 c9 D.3, AC-9.4). 연도 전체 명단(listStudents)에서 체크/토글로
 * 학생을 선택해 단일 동아리에 배정한다. 외부/타반 학생도 명단 선등록 후 후보가
 * 된다. 현재 부원은 listClubMembers 로 표시하고 개별 제거(removeClubMemberAction).
 */
export default async function ClubroomAssignPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = new Date().getFullYear();

  const club = await getOwnerClub(db, ownerId);
  if (!club) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-neutral-800">부원 배정</h2>
        <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          아직 개설된 동아리가 없습니다. <strong>동아리 개설</strong> 탭에서 먼저
          동아리를 만드세요.
        </p>
      </div>
    );
  }

  const [students, members] = await Promise.all([
    listStudents(db, ownerId, year),
    listClubMembers(db, ownerId, club.id),
  ]);

  const memberIds = new Set(members.map((m) => m.studentYearId));
  const candidates = students
    .filter((s) => !memberIds.has(s.id))
    .map((s) => ({ id: s.id, label: `${s.sid} ${s.name}` }));

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-800">
        부원 배정 — {club.name}
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        {year}학년도 전체 명단에서 부원을 선택해 배정합니다. 명단에 없는 외부·타반
        학생은 세팅실에서 먼저 등록하면 후보로 나타납니다.
      </p>

      <section className="mt-6">
        <h3 className="text-sm font-semibold text-neutral-700">
          현재 부원 {members.length}명
        </h3>
        {members.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">
            아직 배정된 부원이 없습니다.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span>
                  {m.sid} {m.name}
                </span>
                <form action={removeClubMemberAction} className="inline">
                  <input type="hidden" name="memberId" value={m.id} />
                  <button className="text-xs text-red-400 hover:underline">
                    제거
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 border-t border-neutral-100 pt-6">
        <h3 className="text-sm font-semibold text-neutral-700">부원 추가</h3>
        {candidates.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">
            배정 가능한 학생이 없습니다(명단 전원이 이미 부원).
          </p>
        ) : (
          <AssignClient candidates={candidates} action={addClubMemberAction} />
        )}
      </section>
    </div>
  );
}
