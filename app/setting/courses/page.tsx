import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  isStageUnlocked,
  isStageComplete,
  listSubjectsWithSections,
  listEnrollmentsForYear,
  listSectionRolesForEnrollments,
  listSubjectExamsForYear,
  getEvalSettingsForYear,
  getTeacherTimetable,
  getTeacherProfile,
  listStudents,
} from "@/lib/db/queries";
import { activeSchoolYear, activeSemester } from "@/lib/domain/school-year";
import { StageGate } from "../stage-gate";
import { LockedNotice } from "../locked-notice";
import { CoursesManager, type SubjectView } from "./courses-manager";
import { TimetableSync } from "./timetable-sync";
import { WeeklyGrid } from "./weekly-grid";

export const dynamic = "force-dynamic";

/** C5 수업 관리 — 학기 모델 + 평가설정 100%검증 + 일괄등록 + 시험일 파생 + 분반역할. */
export default async function CoursesStagePage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string }>;
}) {
  const ownerId = await getOwnerId();
  const db = getDb();
  if (!(await isStageUnlocked(db, ownerId, "courses"))) return <LockedNotice />;
  const now = new Date();
  const year = activeSchoolYear(now);
  const activeSem = activeSemester(now);
  // 기본=활성 학기, ?semester=1|2 로 과거/타 학기 조회.
  const sp = await searchParams;
  const semester = sp.semester === "1" ? 1 : sp.semester === "2" ? 2 : activeSem;
  const [completed, subjects, slots, profile] = await Promise.all([
    isStageComplete(db, ownerId, "courses"),
    listSubjectsWithSections(db, ownerId, year, semester),
    getTeacherTimetable(db, ownerId, year, semester),
    getTeacherProfile(db, ownerId),
  ]);

  // P3: N+1 제거 — 연도·학기·집합 단위 배치 조회 후 메모리 조립(쿼리 수 데이터 무관 상수).
  const [examsBySubject, enrollmentsBySection, evalBySubject, students] =
    await Promise.all([
      listSubjectExamsForYear(db, ownerId, year, semester),
      listEnrollmentsForYear(db, ownerId, year, semester),
      getEvalSettingsForYear(db, ownerId, year, semester),
      listStudents(db, ownerId, year),
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
    eval: evalBySubject.get(s.subjectId) ?? null,
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
        학년도 {semester}학기{semester !== activeSem && " · 과거 학기 조회 중"})
      </p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {[1, 2].map((s) => (
          <Link
            key={s}
            href={`/setting/courses?semester=${s}`}
            className={
              s === semester
                ? "rounded bg-neutral-800 px-2 py-1 text-white"
                : "rounded border border-neutral-300 px-2 py-1 text-neutral-600 hover:bg-neutral-50"
            }
          >
            {s}학기{s === activeSem && " (현재)"}
          </Link>
        ))}
      </div>

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

      <CoursesManager subjects={views} students={students} />
      <StageGate stage="courses" completed={completed} />
    </div>
  );
}
