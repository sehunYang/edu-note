import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { listHomeroomStudents, listBehaviorNotes } from "@/lib/db/queries";
import { activeSchoolYear } from "@/lib/domain/school-year";
import { BehaviorClient, type HomeroomStudent } from "./behavior-client";

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

  const students: HomeroomStudent[] = homeroomStudents.map((s) => ({
    id: s.id,
    sid: s.sid,
    name: s.name,
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
      <h2 className="text-lg font-semibold text-neutral-800">행동특성 기록 ({year})</h2>
      <p className="mt-1 text-sm text-neutral-500">
        담임반 학생의 행동특성을 누가기록합니다(매일 16시 후 넛지).
      </p>

      {students.length === 0 ? (
        <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          담임반이 지정되어 있지 않습니다. 세팅실에서 담임 학급·학생을 먼저
          등록하면 행동특성을 기록할 수 있습니다.
        </p>
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
