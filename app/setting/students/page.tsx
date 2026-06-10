import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  isStageUnlocked,
  isStageComplete,
  listStudents,
  listPendingLinks,
  listClassRoles,
  getTeacherSettings,
} from "@/lib/db/queries";
import { activeSchoolYear } from "@/lib/domain/school-year";
import { StageGate } from "../stage-gate";
import { LockedNotice } from "../locked-notice";
import { StudentRoster } from "./student-roster";

export const dynamic = "force-dynamic";

/** C4 학생 명단 — 동명이인 매칭/상속 큐 + 학급역할 + 담임반 표시 + 공개링크(담임만). */
export default async function StudentsStagePage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  if (!(await isStageUnlocked(db, ownerId, "students"))) return <LockedNotice />;
  const year = activeSchoolYear(new Date());
  const [completed, settings, students, pending] = await Promise.all([
    isStageComplete(db, ownerId, "students"),
    getTeacherSettings(db, ownerId),
    listStudents(db, ownerId, year),
    listPendingLinks(db, ownerId, year),
  ]);

  const homeroom =
    settings?.isHomeroom &&
    settings.homeroomGrade != null &&
    settings.homeroomClassNo != null
      ? { grade: settings.homeroomGrade, classNo: settings.homeroomClassNo }
      : null;

  const rows = await Promise.all(
    students.map(async (s) => ({
      ...s,
      isHomeroom:
        homeroom != null &&
        s.grade === homeroom.grade &&
        s.classNo === homeroom.classNo,
      roles: await listClassRoles(db, ownerId, s.id),
    })),
  );

  return (
    <div>
      <h2 className="text-lg font-semibold">4. 학생 명단 관리</h2>
      <p className="mt-1 text-sm text-neutral-500">
        명단 임포트·동명이인 상속·학급역할·공개 링크를 관리합니다. ({year}학년도)
      </p>
      <StudentRoster students={rows} pending={pending} />
      <StageGate stage="students" completed={completed} />
    </div>
  );
}
