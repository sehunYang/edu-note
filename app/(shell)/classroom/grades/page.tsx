import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { listSubjectsWithSections, getGradeView } from "@/lib/db/queries";
import { subjects, performanceItems } from "@/lib/db/schema/classes";
import { activeSchoolYear, activeSemester } from "@/lib/domain/school-year";
import { GradesUploader, type SubjectGradeView } from "./grades-uploader";
import { EmptyState } from "@/app/ui/empty-state";

export const metadata = { title: "성적 기록" };

export const dynamic = "force-dynamic";

/**
 * 성적 기록 (교실 2-2 단계4). 활성 학기 과목별 수행항목 업로드칸 + 지필 활성회차
 * 업로드칸 + 예시 CSV 다운로드 + 업로드 결과·환산 미리보기. `?semester` 로 수동 전환.
 */
export default async function GradesPage({
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
  const sem: 1 | 2 = sp.semester === "1" ? 1 : sp.semester === "2" ? 2 : activeSem;

  const subjectList = await listSubjectsWithSections(db, ownerId, year, sem);

  // 과목별 지필 활성회차 + 수행항목 + 환산 미리보기 조립.
  const views: SubjectGradeView[] = await Promise.all(
    subjectList.map(async (s) => {
      const [sub] = await db
        .select({
          midEnabled: subjects.jipilMidEnabled,
          finalEnabled: subjects.jipilFinalEnabled,
        })
        .from(subjects)
        .where(and(eq(subjects.id, s.subjectId), eq(subjects.ownerId, ownerId)))
        .limit(1);
      const items = await db
        .select({ name: performanceItems.name })
        .from(performanceItems)
        .where(
          and(
            eq(performanceItems.ownerId, ownerId),
            eq(performanceItems.subjectId, s.subjectId),
          ),
        )
        .orderBy(asc(performanceItems.createdAt));
      const grades = await getGradeView(db, ownerId, s.subjectId);
      return {
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        performanceItems: items.map((i) => i.name),
        jipilMidEnabled: sub?.midEnabled ?? false,
        jipilFinalEnabled: sub?.finalEnabled ?? false,
        grades: grades.map((g) => ({
          sid: g.sid,
          name: g.name,
          jipilMid: Math.round(g.jipilMid * 100) / 100,
          jipilFinal: Math.round(g.jipilFinal * 100) / 100,
          performanceByItem: Object.fromEntries(
            Object.entries(g.performanceByItem).map(([k, v]) => [
              k,
              Math.round(v * 100) / 100,
            ]),
          ),
          total: Math.round(g.total * 100) / 100,
        })),
      };
    }),
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base">
          성적 기록 · {sem}학기
          {sem !== activeSem && (
            <span className="ml-2 text-xs text-neutral-400">(과거/타 학기 조회 중)</span>
          )}
        </h2>
        <Link
          href={`/classroom/grades/view?semester=${sem}`}
          className="rounded-full border border-white/25 bg-transparent px-3 py-1 text-xs text-neutral-600 hover:bg-white/10"
        >
          저장 테이블 조회 →
        </Link>
      </div>
      {views.length === 0 ? (
        <div className="mt-6">
          <EmptyState actions={[{ href: "/setting/courses", label: "수업 등록" }]}>
            이 학기에 등록된 과목이 없습니다.
          </EmptyState>
        </div>
      ) : (
        <GradesUploader subjects={views} />
      )}
    </div>
  );
}
