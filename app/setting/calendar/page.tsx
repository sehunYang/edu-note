import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  isStageUnlocked,
  isStageComplete,
  getEventsWithAttrs,
} from "@/lib/db/queries";
import { activeSchoolYear, schoolYearRange } from "@/lib/domain/school-year";
import { StageGate } from "../stage-gate";
import { LockedNotice } from "../locked-notice";
import { CalendarAttrs } from "./calendar-attrs";

export const dynamic = "force-dynamic";

/** C3 학사 일정 + 키워드 — NEIS 동기화 + 시험/방학/동아리 자동 분류 보정. */
export default async function CalendarStagePage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  if (!(await isStageUnlocked(db, ownerId, "calendar"))) return <LockedNotice />;
  const range = schoolYearRange(activeSchoolYear(new Date()));
  const [completed, events] = await Promise.all([
    isStageComplete(db, ownerId, "calendar"),
    getEventsWithAttrs(db, ownerId, range.start, range.end),
  ]);

  return (
    <div>
      <h2 className="text-lg font-semibold">3. 학사 일정 + 키워드</h2>
      <p className="mt-1 text-sm text-neutral-500">
        NEIS 학사일정을 동기화하고 시험·방학·동아리 속성을 보정합니다.
      </p>
      <CalendarAttrs events={events} />
      <StageGate stage="calendar" completed={completed} />
    </div>
  );
}
