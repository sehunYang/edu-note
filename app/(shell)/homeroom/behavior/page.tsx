import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { listHomeroomStudents, listBehaviorNotes } from "@/lib/db/queries";
import { activeSchoolYear } from "@/lib/domain/school-year";
import { BehaviorClient, type HomeroomStudent } from "./behavior-client";
import { EmptyState } from "@/app/ui/empty-state";

export const metadata = { title: "행동특성 기록" };

export const dynamic = "force-dynamic";

/**
 * 행동특성 기록 (교실 2-2 단계5 인접보정, 담임 영역). 기존 /observations 의 행특
 * 스트림을 분리·이전한 비-redirect 홈. 학생 선택은 **담임반 학생만** 제한
 * (listHomeroomStudents). 담임반 미지정이면 안내. 날짜입력·추가·수정·삭제.
 */
export default async function HomeroomBehaviorPage({
  searchParams,
}: {
  searchParams: Promise<{ studentYearId?: string }>;
}) {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = activeSchoolYear(new Date());
  const sp = await searchParams;
  // 넛지 사전선택 딥링크(AC-7.5) — 학생을 받으면 폼에 미리 채운다(없으면 무시).
  const preStudentId = sp.studentYearId ?? "";

  const [homeroomStudents, behaviorNotes] = await Promise.all([
    listHomeroomStudents(db, ownerId, year),
    // 페이지네이션(10개씩)으로 전체를 클라이언트에서 분할하므로 상한 없이 로드.
    listBehaviorNotes(db, ownerId),
  ]);

  // 학생별 누가기록 수 — 생기부 마감 국면에서 "누가 아직 안 됐는지"가 화면에
  // 없으면 32명을 일일이 대조해야 한다. 셀렉트에 건수를 같이 실어 보낸다.
  const countById = new Map(
    behaviorNotes.reduce<[string, number][]>((acc, b) => {
      const found = acc.find(([id]) => id === b.studentYearId);
      if (found) found[1] += 1;
      else acc.push([b.studentYearId, 1]);
      return acc;
    }, []),
  );

  const students: HomeroomStudent[] = homeroomStudents.map((s) => ({
    id: s.id,
    sid: s.sid,
    name: s.name,
    noteCount: countById.get(s.id) ?? 0,
  }));
  const nameById = new Map(students.map((s) => [s.id, `${s.sid} ${s.name}`]));
  const recent = behaviorNotes.map((b) => ({
    id: b.id,
    studentLabel: nameById.get(b.studentYearId) ?? "—",
    notedOn: b.notedOn,
    body: b.body,
    keywords: b.keywords ?? [],
  }));

  return (
    <div>
      <h2 className="text-base">행동특성 기록 ({year})</h2>
      {students.length === 0 ? (
        <div className="mt-6">
          <EmptyState actions={[{ href: "/setting/students", label: "담임 학급·학생 등록" }]}>
            담임반이 지정되어 있지 않습니다.
          </EmptyState>
        </div>
      ) : (
        <BehaviorClient
          students={students}
          recent={recent}
          initialStudentId={preStudentId}
        />
      )}
    </div>
  );
}
