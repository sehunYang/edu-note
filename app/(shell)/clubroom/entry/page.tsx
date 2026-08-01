import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  getOwnerClub,
  listClubActivityRecords,
  listClubActivitySessions,
  listClubMembers,
} from "@/lib/db/queries";
import { ClubEntryForm } from "./entry-form";
import { EmptyState } from "@/app/ui/empty-state";

export const metadata = { title: "동아리 활동 입력" };

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
        <div className="mt-8">
          <EmptyState actions={[{ href: "/clubroom/create", label: "동아리 개설" }]}>
            아직 개설된 동아리가 없습니다. 먼저 동아리를 만드세요.
          </EmptyState>
        </div>
      </div>
    );
  }

  const [sessions, members, records] = await Promise.all([
    listClubActivitySessions(db, ownerId, club.id),
    listClubMembers(db, ownerId, club.id),
    listClubActivityRecords(db, ownerId, club.id),
  ]);

  const recordByDate = new Map(records.map((r) => [r.activityDate, r]));

  // 일괄 저장 폼에 넘길 평탄한 초기값. 키는 `${날짜}__${studentYearId}`.
  const memoByKey: Record<string, string> = {};
  for (const r of records) {
    for (const o of r.overrides ?? []) {
      memoByKey[`${r.activityDate}__${o.studentYearId}`] = o.body ?? "";
    }
  }

  return (
    <div>
      <h2 className="text-lg font-normal text-neutral-800">
        활동 입력 — {club.name}
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        차시별 공통 활동 내용과 부원별 개별 메모를 기입합니다.
      </p>

      {sessions.length === 0 ? (
        <div className="mt-8">
          <EmptyState actions={[{ href: "/clubroom/plan", label: "활동 계획에서 차시 동기화" }]}>
            차시가 없습니다. 활동 계획에서 차시를 먼저 동기화하세요.
          </EmptyState>
        </div>
      ) : members.length === 0 ? (
        <div className="mt-8">
          <EmptyState actions={[{ href: "/clubroom/assign", label: "부원 배정" }]}>
            배정된 부원이 없습니다. 부원을 먼저 배정하세요.
          </EmptyState>
        </div>
      ) : (
        <ClubEntryForm
          sessions={sessions.map((s) => ({
            id: s.id,
            ordinal: s.ordinal,
            date: s.date,
            plannedActivity: s.plannedActivity ?? null,
            commonBody: recordByDate.get(s.date)?.commonBody ?? "",
          }))}
          members={members.map((m) => ({
            id: m.id,
            studentYearId: m.studentYearId,
            sid: m.sid,
            name: m.name,
          }))}
          memoByKey={memoByKey}
        />
      )}
    </div>
  );
}
