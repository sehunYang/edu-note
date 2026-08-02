import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  isStageUnlocked,
  isStageComplete,
  listStudentRoster,
  listPriorSidsForStudents,
  listSubjectsForStudentYears,
  listPendingLinks,
  listClassRolesForStudents,
  getTeacherSettings,
  listPublicPages,
} from "@/lib/db/queries";
import { activeSchoolYear } from "@/lib/domain/school-year";
import { StageGate } from "../stage-gate";
import { LockedNotice } from "../locked-notice";
import { StudentRoster } from "./student-roster";
import { ImportForm } from "./import-form";

export const metadata = { title: "학생 명단 관리" };

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
    listStudentRoster(db, ownerId, year),
    listPendingLinks(db, ownerId, year),
  ]);

  const homeroom =
    settings?.isHomeroom &&
    settings.homeroomGrade != null &&
    settings.homeroomClassNo != null
      ? { grade: settings.homeroomGrade, classNo: settings.homeroomClassNo }
      : null;

  // P3: N+1 제거 — 학급역할·수강중인수업·과거학번을 1회 배치 조회 후 메모리 그룹핑.
  const ids = students.map((s) => s.id);
  const [rolesByStudent, subjectsByStudent, priorByStudent, allPages] =
    await Promise.all([
      listClassRolesForStudents(db, ownerId, ids),
      listSubjectsForStudentYears(db, ownerId, ids, year),
      listPriorSidsForStudents(db, ownerId, ids, year),
      // AC-12.9: 발급된 공개 토큰을 영속 표시(새로고침에도 유지). 활성(미폐기)만.
      listPublicPages(db, ownerId),
    ]);
  // 학생별 활성(미폐기) 토큰 — 최신순(listPublicPages 정렬)이라 첫 매칭이 최신.
  const tokenByStudent = new Map<string, string>();
  for (const p of allPages) {
    if (p.revokedAt !== null) continue;
    if (!tokenByStudent.has(p.studentYearId)) {
      tokenByStudent.set(p.studentYearId, p.token);
    }
  }
  const rows = students.map((s) => ({
    id: s.id,
    sid: s.sid,
    name: s.name,
    grade: s.grade,
    classNo: s.classNo,
    number: s.number,
    phone: s.phone,
    career: s.career,
    isHomeroom:
      homeroom != null &&
      s.grade === homeroom.grade &&
      s.classNo === homeroom.classNo,
    roles: rolesByStudent.get(s.id) ?? [],
    subjects: (subjectsByStudent.get(s.id) ?? []).map(
      (x) => `${x.semester}학기 ${x.subjectName}`,
    ),
    priorSids: (priorByStudent.get(s.id) ?? []).map(
      (p) => `${p.schoolYear} ${p.sid}`,
    ),
    activeToken: tokenByStudent.get(s.id) ?? null,
  }));

  return (
    <div>
      <h2 className="flex flex-wrap items-baseline gap-2 text-lg">
        4. 학생 명단 관리
        <span className="text-xs text-neutral-400">{year}학년도</span>
      </h2>

      <section className="mt-5 rounded-lg border border-neutral-200 p-4">
        <h3 className="flex flex-wrap items-baseline gap-2 text-sm text-neutral-700">
          CSV 명단 임포트
          {/* 아래 placeholder 가 형식을 보여주지만, 학번에서 학년/반/번호가 나온다는
              것만은 예시로 드러나지 않는다. */}
          <span className="text-xs font-normal text-neutral-400">
            학번 5자리 → 학년/반/번호 자동
          </span>
        </h3>
        <div className="mt-3">
          <ImportForm defaultYear={year} />
        </div>
      </section>

      <StudentRoster students={rows} pending={pending} />
      <StageGate stage="students" completed={completed} />
    </div>
  );
}
