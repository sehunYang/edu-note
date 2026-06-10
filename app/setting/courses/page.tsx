import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  isStageUnlocked,
  isStageComplete,
  listSubjectsWithSections,
  listEnrollments,
  listSectionRoles,
  listSubjectExams,
} from "@/lib/db/queries";
import { activeSchoolYear } from "@/lib/domain/school-year";
import { StageGate } from "../stage-gate";
import { LockedNotice } from "../locked-notice";
import { CoursesManager, type SubjectView } from "./courses-manager";

export const dynamic = "force-dynamic";

/** C5 수업 관리 — 평가설정 100%검증 + 일괄등록 + 시험일 파생 + 분반역할. */
export default async function CoursesStagePage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  if (!(await isStageUnlocked(db, ownerId, "courses"))) return <LockedNotice />;
  const year = activeSchoolYear(new Date());
  const [completed, subjects] = await Promise.all([
    isStageComplete(db, ownerId, "courses"),
    listSubjectsWithSections(db, ownerId, year),
  ]);

  const views: SubjectView[] = await Promise.all(
    subjects.map(async (s) => ({
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      exams: await listSubjectExams(db, ownerId, s.subjectId),
      sections: await Promise.all(
        s.sections.map(async (sec) => ({
          id: sec.id,
          label: sec.label,
          enrollments: await Promise.all(
            (await listEnrollments(db, ownerId, sec.id)).map(async (e) => ({
              ...e,
              roles: await listSectionRoles(db, ownerId, e.enrollmentId),
            })),
          ),
        })),
      ),
    })),
  );

  return (
    <div>
      <h2 className="text-lg font-semibold">5. 수업 관리</h2>
      <p className="mt-1 text-sm text-neutral-500">
        분반별 평가설정(100% 검증)·수강 일괄등록·시험일·역할을 관리합니다. ({year}
        학년도)
      </p>
      <CoursesManager subjects={views} />
      <StageGate stage="courses" completed={completed} />
    </div>
  );
}
