import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  listSubjectsWithSections,
  getPlanView,
  listLessonUnits,
  listExamTargets,
  listExamSegmentPlans,
} from "@/lib/db/queries";
import { activeSchoolYear, activeSemester } from "@/lib/domain/school-year";
import { PlanStageNav } from "../plan-stage-nav";
import { SemesterEditor, type SubjectSemesterView } from "./semester-editor";
import { EmptyState } from "@/app/ui/empty-state";

export const metadata = { title: "학기 계획" };

export const dynamic = "force-dynamic";

/**
 * 수업 계획실 · 학기 계획 단계 (QC v4 US-2, AC-1.1~1.5). 과목별로
 * 세부단원(대/중/소 + 핵심개념 + 최소차시) 트리와 시험별 목표진도(소단원 범위)를 편집한다.
 */
export default async function SemesterPlanPage({
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

  const views: SubjectSemesterView[] = await Promise.all(
    subjects.map(async (s) => {
      const [planView, units, targets, segmentPlans] = await Promise.all([
        getPlanView(db, ownerId, s.subjectId, year, sem),
        listLessonUnits(db, ownerId, s.subjectId),
        listExamTargets(db, ownerId, s.subjectId),
        listExamSegmentPlans(db, ownerId, s.subjectId),
      ]);
      // 세팅실에서 체크된 시험 차수(1/2). examLabel 마커가 있으면 해당 차수 존재.
      const examSet = new Set<number>();
      for (const o of planView.ordinals) {
        if (o.examLabel === "1차") examSet.add(1);
        else if (o.examLabel === "2차") examSet.add(2);
      }
      const examOrdinals = Array.from(examSet).sort();
      return {
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        examOrdinals,
        repLength: planView.length,
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
        examTargets: targets.map((t) => ({
          examOrdinal: t.examOrdinal,
          fromCode: t.unitFromCode,
          toCode: t.unitToCode,
        })),
        segmentPlans: segmentPlans.map((p) => ({
          examOrdinal: p.examOrdinal,
          plannedPeriods: p.plannedPeriods,
          slackPeriods: p.slackPeriods,
        })),
      };
    }),
  );

  return (
    <div>
      <h2 className="text-base">
        수업 계획실 · {sem}학기
        {sem !== activeSem && (
          <span className="ml-2 text-xs text-neutral-400">(과거/타 학기 조회 중)</span>
        )}
      </h2>
      <PlanStageNav active="semester" semester={sp.semester} />

      {views.length === 0 ? (
        <div className="mt-6">
          <EmptyState actions={[{ href: "/setting/courses", label: "수업 등록" }]}>
            이 학기에 등록된 과목이 없습니다.
          </EmptyState>
        </div>
      ) : (
        <SemesterEditor subjects={views} />
      )}
    </div>
  );
}
