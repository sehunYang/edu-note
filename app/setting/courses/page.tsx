import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  isStageUnlocked,
  isStageComplete,
  listSubjectsWithSections,
  listEnrollments,
  listSectionRoles,
  listSubjectExams,
  getTeacherTimetable,
  getTeacherProfile,
} from "@/lib/db/queries";
import { activeSchoolYear } from "@/lib/domain/school-year";
import { StageGate } from "../stage-gate";
import { LockedNotice } from "../locked-notice";
import { CoursesManager, type SubjectView } from "./courses-manager";
import { TimetableSync } from "./timetable-sync";
import { WeeklyGrid } from "./weekly-grid";

export const dynamic = "force-dynamic";

/** C5 수업 관리 — 평가설정 100%검증 + 일괄등록 + 시험일 파생 + 분반역할. */
export default async function CoursesStagePage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  if (!(await isStageUnlocked(db, ownerId, "courses"))) return <LockedNotice />;
  const year = activeSchoolYear(new Date());
  const [completed, subjects, slots, profile] = await Promise.all([
    isStageComplete(db, ownerId, "courses"),
    listSubjectsWithSections(db, ownerId, year),
    getTeacherTimetable(db, ownerId, year),
    getTeacherProfile(db, ownerId),
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

      <section className="mt-5 rounded-lg border border-neutral-200 p-4">
        <h3 className="text-sm font-semibold text-neutral-700">컴시간 시간표 동기화</h3>
        <p className="mt-1 text-xs text-neutral-400">
          컴시간알리미 학교·교사명으로 본인 시간표를 가져와 과목·분반을 생성합니다.
        </p>
        <div className="mt-3">
          <TimetableSync
            defaultSchool={profile?.comciganSchool ?? ""}
            defaultTeacher={profile?.comciganTeacher ?? ""}
          />
        </div>
        <WeeklyGrid slots={slots} />
      </section>

      <CoursesManager subjects={views} />
      <StageGate stage="courses" completed={completed} />
    </div>
  );
}
