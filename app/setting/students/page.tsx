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
} from "@/lib/db/queries";
import { activeSchoolYear } from "@/lib/domain/school-year";
import { StageGate } from "../stage-gate";
import { LockedNotice } from "../locked-notice";
import { StudentRoster } from "./student-roster";
import { ImportForm } from "./import-form";

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
  const [rolesByStudent, subjectsByStudent, priorByStudent] = await Promise.all([
    listClassRolesForStudents(db, ownerId, ids),
    listSubjectsForStudentYears(db, ownerId, ids, year),
    listPriorSidsForStudents(db, ownerId, ids, year),
  ]);
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
  }));

  return (
    <div>
      <h2 className="text-lg font-semibold">4. 학생 명단 관리</h2>
      <p className="mt-1 text-sm text-neutral-500">
        명단 임포트·동명이인 상속·학급역할·공개 링크를 관리합니다. ({year}학년도)
      </p>

      <section className="mt-5 rounded-lg border border-neutral-200 p-4">
        <h3 className="text-sm font-semibold text-neutral-700">CSV 명단 임포트</h3>
        <p className="mt-1 text-xs text-neutral-400">
          헤더에 <code>학번</code>·<code>이름</code> 필수. 학번 5자리에서 학년/반/번호가
          자동 산출됩니다. 임포트 후 아래에서 동명이인 매칭을 실행하세요.
        </p>
        <div className="mt-3">
          <ImportForm defaultYear={year} />
        </div>
      </section>

      <StudentRoster students={rows} pending={pending} />
      <StageGate stage="students" completed={completed} />
    </div>
  );
}
