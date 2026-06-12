import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  listSubjectsWithSections,
  getPlanLength,
  listLessonPlan,
} from "@/lib/db/queries";
import { activeSchoolYear, activeSemester } from "@/lib/domain/school-year";
import { PlanEditor, type SubjectPlanView } from "./plan-editor";

export const dynamic = "force-dynamic";

/**
 * 수업 계획실 (교실 2-2 단계2). 활성 학기 과목 → 차시 1..N 행에 수업내용·핵심개념 기입.
 * 일년 과목은 학기별 독립(과목 행 자체가 학기 분리). `?semester` 로 수동 전환.
 */
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string }>;
}) {
  const ownerId = await getOwnerId();
  const db = getDb();
  const now = new Date();
  const year = activeSchoolYear(now);
  const activeSem = activeSemester(now);
  const sp = await searchParams;
  const sem: 1 | 2 =
    sp.semester === "1" ? 1 : sp.semester === "2" ? 2 : activeSem;

  const subjects = await listSubjectsWithSections(db, ownerId, year, sem);

  // 과목별 차시 N + 기존 계획 행 조립.
  const views: SubjectPlanView[] = await Promise.all(
    subjects.map(async (s) => {
      const [planLength, entries] = await Promise.all([
        getPlanLength(db, ownerId, s.subjectId, year, sem),
        listLessonPlan(db, ownerId, s.subjectId),
      ]);
      return {
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        planLength,
        entries: entries.map((e) => ({
          ordinal: e.ordinal,
          content: e.content ?? "",
          keywords: e.keywords ?? [],
        })),
      };
    }),
  );

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-800">
        수업 계획실 · {sem}학기
        {sem !== activeSem && (
          <span className="ml-2 text-xs text-neutral-400">(과거/타 학기 조회 중)</span>
        )}
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        과목을 선택하면 학기·방학 기준 차시 수(N)를 자동 산출합니다. 차시별로
        수업내용과 핵심개념(해시태그)을 기록하세요.
      </p>

      {views.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-400">
          이 학기에 등록된 과목이 없습니다. 먼저 세팅실에서 수업을 등록하세요.
        </p>
      ) : (
        <PlanEditor subjects={views} />
      )}
    </div>
  );
}
