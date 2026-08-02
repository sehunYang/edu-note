import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  listStudents,
  listSubjectsWithSections,
  listSubjectObservations,
} from "@/lib/db/queries";
import { activeSchoolYear, activeSemester } from "@/lib/domain/school-year";
import { ObservationsClient, type SectionOption } from "./observations-client";
import { EmptyState } from "@/app/ui/empty-state";

export const metadata = { title: "교과 관찰" };

export const dynamic = "force-dynamic";

/**
 * 교과 관찰 (교실 2-2 단계5). /observations 에서 격상 — 분반 필수귀속·학생↔분반
 * 자동매칭·분반→학생 필터·날짜입력·수정/삭제. `?semester` 로 활성 학기 수동 전환.
 * 행특(행동특성)은 담임 영역 `/homeroom/behavior` 로 분리됨.
 */
export default async function ClassroomObservationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    semester?: string;
    studentYearId?: string;
    sectionId?: string;
  }>;
}) {
  const ownerId = await getOwnerId();
  const db = getDb();
  const now = new Date();
  const year = activeSchoolYear(now);
  const activeSem = activeSemester(now);
  const sp = await searchParams;
  const sem: 1 | 2 = sp.semester === "1" ? 1 : sp.semester === "2" ? 2 : activeSem;
  // 넛지 사전선택 딥링크(AC-7.3) — 학생·분반을 받으면 폼에 미리 채운다(없으면 무시).
  const preStudentId = sp.studentYearId ?? "";
  const preSectionId = sp.sectionId ?? "";

  const [students, subjectsWithSections, observations] = await Promise.all([
    listStudents(db, ownerId, year),
    listSubjectsWithSections(db, ownerId, year, sem),
    // 페이지네이션(10개씩)으로 전체를 클라이언트에서 분할하므로 상한 없이 로드.
    listSubjectObservations(db, ownerId),
  ]);

  // 활성 학기 분반 옵션(과목명 + 라벨) 평탄화.
  const sectionOptions: SectionOption[] = subjectsWithSections.flatMap((s) =>
    s.sections.map((sec) => ({
      sectionId: sec.id,
      label: sec.label,
      subjectName: s.subjectName,
    })),
  );

  const studentOptions = students.map((s) => ({
    id: s.id,
    sid: s.sid,
    name: s.name,
  }));

  // 최근 관찰 표시용 이름·분반 맵.
  const nameById = new Map(students.map((s) => [s.id, `${s.sid} ${s.name}`]));
  const sectionById = new Map(
    sectionOptions.map((s) => [s.sectionId, `${s.subjectName} ${s.label}`]),
  );
  const recent = observations.map((o) => ({
    id: o.id,
    studentLabel: nameById.get(o.studentYearId) ?? "—",
    sectionLabel: o.sectionId ? (sectionById.get(o.sectionId) ?? "") : "",
    observedOn: o.observedOn,
    body: o.body,
    keywords: o.keywords ?? [],
  }));

  return (
    <div>
      <h2 className="text-base">
        교과 관찰 · {sem}학기
        {sem !== activeSem && (
          <span className="ml-2 text-xs text-neutral-400">(과거/타 학기 조회 중)</span>
        )}
      </h2>
      {sectionOptions.length === 0 ? (
        <div className="mt-6">
          <EmptyState actions={[{ href: "/setting/courses", label: "수업·분반 등록" }]}>
            이 학기에 등록된 분반이 없습니다.
          </EmptyState>
        </div>
      ) : (
        <ObservationsClient
          semester={sem}
          students={studentOptions}
          sections={sectionOptions}
          recent={recent}
          initialStudentId={preStudentId}
          initialSectionId={preSectionId}
        />
      )}
    </div>
  );
}
