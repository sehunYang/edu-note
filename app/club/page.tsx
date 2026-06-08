import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { listClubs, listClubMembers, listStudents } from "@/lib/db/queries";
import {
  createClubAction,
  deleteClubAction,
  addMemberAction,
  removeMemberAction,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * 동아리 화면 (계획 §4 Phase2-D). 동아리 생성/삭제 + 부원 관리(희망진로 메모).
 * 동아리 활동 세특은 창체활동(area=club) 흐름을 재사용한다.
 */
export default async function ClubPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = new Date().getFullYear();

  const [clubs, students] = await Promise.all([
    listClubs(db, ownerId),
    listStudents(db, ownerId, year),
  ]);

  // 각 동아리 부원 목록을 병렬 조회.
  const memberLists = await Promise.all(
    clubs.map((c) => listClubMembers(db, ownerId, c.id)),
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">동아리 ({year})</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>

      <section className="mt-6 rounded-lg border border-neutral-200 p-5">
        <h2 className="text-sm font-semibold text-neutral-700">새 동아리</h2>
        <form action={createClubAction} className="mt-3 flex flex-wrap gap-2">
          <input
            name="name"
            required
            placeholder="동아리명"
            className="flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm"
          />
          <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700">
            만들기
          </button>
        </form>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-sm font-semibold text-neutral-700">
          동아리 {clubs.length}개
        </h2>
        {clubs.length === 0 ? (
          <p className="text-sm text-neutral-400">아직 동아리가 없습니다.</p>
        ) : (
          clubs.map((c, i) => {
            const members = memberLists[i];
            return (
              <div
                key={c.id}
                className="rounded-lg border border-neutral-200 p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">
                    {c.name}{" "}
                    <span className="text-xs font-normal text-neutral-400">
                      부원 {c.memberCount}명
                    </span>
                  </h3>
                  <form action={deleteClubAction} className="inline">
                    <input type="hidden" name="id" value={c.id} />
                    <button className="text-xs text-red-500 hover:underline">
                      동아리 삭제
                    </button>
                  </form>
                </div>

                {members.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {members.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span>
                          {m.sid} {m.name}
                          {m.desiredCareer && (
                            <span className="ml-2 text-xs text-neutral-400">
                              희망진로: {m.desiredCareer}
                            </span>
                          )}
                        </span>
                        <form action={removeMemberAction} className="inline">
                          <input type="hidden" name="memberId" value={m.id} />
                          <button className="text-xs text-red-400 hover:underline">
                            제거
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}

                {students.length > 0 && (
                  <form
                    action={addMemberAction}
                    className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3"
                  >
                    <input type="hidden" name="clubId" value={c.id} />
                    <select
                      name="studentYearId"
                      required
                      className="rounded border border-neutral-300 px-2 py-1 text-sm"
                    >
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.sid} {s.name}
                        </option>
                      ))}
                    </select>
                    <input
                      name="desiredCareer"
                      placeholder="희망진로(선택)"
                      className="rounded border border-neutral-300 px-2 py-1 text-sm"
                    />
                    <button className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50">
                      부원 추가
                    </button>
                  </form>
                )}
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
