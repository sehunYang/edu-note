import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { listHomeroomStudents, listHomeroomActivities } from "@/lib/db/queries";
import { activeSchoolYear } from "@/lib/domain/school-year";
import { schoolYearRange } from "@/lib/domain/school-year";
import { getEventsWithAttrs } from "@/lib/db/queries/calendar";
import {
  ActivitiesClient,
  type HomeroomStudent,
  type SelfActivityEvent,
  type ActivityEntry,
} from "./activities-client";
import { EmptyState } from "@/app/ui/empty-state";

export const metadata = { title: "자율·진로활동" };

export const dynamic = "force-dynamic";

/**
 * 자율·진로활동 (담임 교실, US-B11). 학사일정 self_activity/career_activity 이벤트 +
 * 담임반 학생 목록 + 저장 내역을 서버에서 로드해 클라이언트에 전달.
 */
export default async function HomeroomActivitiesPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = activeSchoolYear(new Date());
  const { start, end } = schoolYearRange(year);

  const [homeroomStudents, allEvents, savedRows] = await Promise.all([
    listHomeroomStudents(db, ownerId, year),
    getEventsWithAttrs(db, ownerId, start, end),
    (async () => {
      const members = await listHomeroomStudents(db, ownerId, year);
      if (members.length === 0) return [];
      return listHomeroomActivities(
        db,
        ownerId,
        members.map((m) => m.id),
      );
    })(),
  ]);

  const students: HomeroomStudent[] = homeroomStudents.map((s) => ({
    id: s.id,
    sid: s.sid,
    name: s.name,
  }));

  const nameById = new Map(students.map((s) => [s.id, `${s.sid} ${s.name}`]));

  // 학사일정 자율/진로 활동 이벤트만 필터
  const selfActivityEvents: SelfActivityEvent[] = allEvents
    .filter(
      (e) => e.eventKind === "self_activity" || e.eventKind === "career_activity",
    )
    .map((e) => ({
      id: e.id,
      date: e.date,
      title: e.title,
      eventKind: e.eventKind,
    }));

  const entries: ActivityEntry[] = savedRows.map((r) => ({
    id: r.id,
    studentYearId: r.studentYearId,
    studentLabel: nameById.get(r.studentYearId) ?? "—",
    tag: r.tag,
    placement: r.placement,
    body: r.body,
    createdAt: r.createdAt,
  }));

  return (
    <div>
      <h2 className="text-base">
        자율·진로활동 ({year})
      </h2>
      {students.length === 0 ? (
        <div className="mt-6">
          <EmptyState actions={[{ href: "/setting/students", label: "담임 학급·학생 등록" }]}>
            담임반이 지정되어 있지 않습니다.
          </EmptyState>
        </div>
      ) : (
        <ActivitiesClient
          students={students}
          events={selfActivityEvents}
          entries={entries}
        />
      )}
    </div>
  );
}
