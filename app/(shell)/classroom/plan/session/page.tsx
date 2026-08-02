import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  listSubjectsWithSections,
  getPlanView,
  getRemainingToExam,
  listLessonPlan,
  listLessonUnits,
  isSemesterPlanComplete,
} from "@/lib/db/queries";
import { computeUnitOrdinalSum } from "@/lib/domain/lesson-plan";
import { activeSchoolYear, activeSemester } from "@/lib/domain/school-year";
import { PlanStageNav } from "../plan-stage-nav";
import { EmptyState } from "@/app/ui/empty-state";
import { SessionEditor, type SubjectSessionView } from "./session-editor";

export const metadata = { title: "차시 계획" };

export const dynamic = "force-dynamic";

/**
 * 수업 계획실 · 차시 계획 단계 (QC v4 US-2, AC-1.6~1.10). 차시별 수업내용·핵심개념 +
 * 6자리 단원 코드/토글 자동채움 + 일괄 저장 + 최소차시 초과 검증 모달.
 * 학기 계획(세부단원 1개 이상)이 완료된 과목만 편집 가능(AC-1.1 게이트).
 */
export default async function SessionPlanPage({
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
  // KST 오늘(시험까지 남은 차시 카운터 기준).
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const views: SubjectSessionView[] = await Promise.all(
    subjects.map(async (s) => {
      const [planView, entries, units, complete, remaining] = await Promise.all([
        getPlanView(db, ownerId, s.subjectId, year, sem),
        listLessonPlan(db, ownerId, s.subjectId),
        listLessonUnits(db, ownerId, s.subjectId),
        isSemesterPlanComplete(db, ownerId, s.subjectId),
        getRemainingToExam(db, ownerId, s.subjectId, year, sem, today),
      ]);
      return {
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        semesterComplete: complete,
        planLength: planView.length,
        // QC v6 ① — 세부단원 최소차시 합 = 총 차시 수(AC-1.2).
        totalOrdinals: computeUnitOrdinalSum(units),
        // QC v6 ① — 시험까지 남은 차시(AC-1.3). 대표분반 없으면 null.
        remaining,
        ordinals: planView.ordinals.map((o) => ({
          ordinal: o.ordinal,
          month: o.month,
          weekOfMonth: o.weekOfMonth,
          examLabel: o.examLabel,
        })),
        entries: entries.map((e) => ({
          ordinal: e.ordinal,
          content: e.content ?? "",
          keywords: e.keywords ?? [],
          unitId: e.unitId,
        })),
        units: units.map((u) => ({
          id: u.id,
          majorNo: u.majorNo,
          midNo: u.midNo,
          minorNo: u.minorNo,
          majorName: u.majorName,
          midName: u.midName,
          minorName: u.minorName,
          keywords: u.keywords ?? [],
          minOrdinals: u.minOrdinals,
        })),
      };
    }),
  );

  const anyComplete = views.some((v) => v.semesterComplete);

  return (
    <div>
      <h2 className="text-base">
        수업 계획실 · {sem}학기
        {sem !== activeSem && (
          <span className="ml-2 text-xs text-neutral-400">(과거/타 학기 조회 중)</span>
        )}
      </h2>
      <PlanStageNav active="session" semester={sp.semester} />

      {views.length === 0 ? (
        <div className="mt-6">
          <EmptyState actions={[{ href: "/setting/courses", label: "수업 등록" }]}>
            이 학기에 등록된 과목이 없습니다.
          </EmptyState>
        </div>
      ) : !anyComplete ? (
        <div className="mt-6">
          <EmptyState
            actions={[
              {
                href: `/classroom/plan/semester${sp.semester ? `?semester=${sp.semester}` : ""}`,
                label: "학기 계획에서 단원 등록",
              },
            ]}
          >
            아직 학기 계획(세부 단원)이 등록된 과목이 없습니다.
          </EmptyState>
        </div>
      ) : (
        <SessionEditor subjects={views} />
      )}
    </div>
  );
}
