import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  listSubjectsWithSections,
  listStudents,
  listDrafts,
  listExtraNotes,
  listEnrolledStudentsForSubject,
} from "@/lib/db/queries";
import { activeSchoolYear, activeSemester } from "@/lib/domain/school-year";
import { SetechBulkClient } from "./setech-bulk-client";
import { EmptyState } from "@/app/ui/empty-state";

export const metadata = { title: "세특 작성" };

export const dynamic = "force-dynamic";

/**
 * 세특 작성 (교실 2-2 단계7). 과목·분반별 원천자료 CSV 내보내기 → 코워크 →
 * 결과 CSV 재업로드(학번+과목 매칭, 행별 검수). 학생×과목 추가입력 지원.
 * 서버에서 AI 호출 없음(코워크 외부 생성).
 */
export default async function SetechPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string }>;
}) {
  const sp = await searchParams;
  const sem =
    sp.semester === "1" ? 1 : sp.semester === "2" ? 2 : activeSemester(new Date());
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = activeSchoolYear(new Date());

  const [subjects, students, drafts, extraNotes] = await Promise.all([
    listSubjectsWithSections(db, ownerId, year, sem),
    listStudents(db, ownerId, year),
    listDrafts(db, ownerId),
    listExtraNotes(db, ownerId),
  ]);

  // AC-4.2 과목별 수강생 필터용 맵(subjectId → 수강 studentYearId[]).
  const enrollmentBySubject: Record<string, string[]> = {};
  await Promise.all(
    subjects.map(async (s) => {
      const enrolled = await listEnrolledStudentsForSubject(db, ownerId, s.subjectId);
      enrollmentBySubject[s.subjectId] = enrolled.map((e) => e.studentYearId);
    }),
  );

  return (
    <div>
      <h2 className="text-base">
        세특 작성 · {sem}학기
      </h2>
      {subjects.length === 0 ? (
        <div className="mt-6">
          <EmptyState actions={[{ href: "/setting/courses", label: "수업 등록" }]}>
            {sem}학기 과목이 없습니다.
          </EmptyState>
        </div>
      ) : (
        <SetechBulkClient
          semester={sem}
          subjects={subjects.map((s) => ({
            id: s.subjectId,
            name: s.subjectName,
            sections: s.sections,
          }))}
          students={students.map((s) => ({ id: s.id, label: `${s.sid} ${s.name}` }))}
          enrollmentBySubject={enrollmentBySubject}
          drafts={drafts.map((d) => ({
            id: d.id,
            studentYearId: d.studentYearId,
            content: d.content,
            byteCount: d.byteCount,
            byteLimit: d.byteLimit,
          }))}
          extraNotes={extraNotes.map((n) => ({
            id: n.id,
            studentYearId: n.studentYearId,
            subjectId: n.subjectId,
            body: n.body,
          }))}
        />
      )}
    </div>
  );
}
