import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  isStageUnlocked,
  isStageComplete,
  listSubjectsWithSections,
  listEnrollmentsForYear,
  listSectionRolesForEnrollments,
  listSubjectExamsForYear,
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

  // P3: N+1 제거 — 연도·집합 단위 배치 조회 후 메모리 조립(쿼리 수 데이터 무관 상수).
  const [examsBySubject, enrollmentsBySection] = await Promise.all([
    listSubjectExamsForYear(db, ownerId, year),
    listEnrollmentsForYear(db, ownerId, year),
  ]);
  const allEnrollmentIds = [...enrollmentsBySection.values()]
    .flat()
    .map((e) => e.enrollmentId);
  const rolesByEnrollment = await listSectionRolesForEnrollments(
    db,
    ownerId,
    allEnrollmentIds,
  );

  const views: SubjectView[] = subjects.map((s) => ({
    subjectId: s.subjectId,
    subjectName: s.subjectName,
    exams: examsBySubject.get(s.subjectId) ?? [],
    sections: s.sections.map((sec) => ({
      id: sec.id,
      label: sec.label,
      enrollments: (enrollmentsBySection.get(sec.id) ?? []).map((e) => ({
        ...e,
        roles: rolesByEnrollment.get(e.enrollmentId) ?? [],
      })),
    })),
  }));

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
