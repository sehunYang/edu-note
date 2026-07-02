import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { isStageComplete, listSchoolYears } from "@/lib/db/queries";
import { activeSchoolYear, schoolYearRange } from "@/lib/domain/school-year";
import { StageGate } from "../stage-gate";
import { LegacyYears } from "./legacy-years";

export const dynamic = "force-dynamic";

/** C1 학년도 — 활성 학년도 자동 산정 + 레거시 연도 조회/삭제 + 단계 완료. */
export default async function YearStagePage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = activeSchoolYear(new Date());
  const range = schoolYearRange(year);
  const [completed, years] = await Promise.all([
    isStageComplete(db, ownerId, "year"),
    listSchoolYears(db, ownerId),
  ]);

  return (
    <div>
      <h2 className="text-lg font-normal">1. 학년도</h2>
      <p className="mt-1 text-sm text-neutral-500">
        활성 학년도는 오늘 날짜로 자동 산정됩니다(3/1 경계).
      </p>

      <div className="mt-5 rounded-lg border border-neutral-200 p-5">
        <div className="text-3xl font-normal tracking-tight">{year}학년도</div>
        <p className="mt-1 text-sm text-neutral-500">
          {range.start} ~ {range.end}
        </p>
        <p className="mt-3 text-xs text-neutral-400">
          새 학년도(3/1) 진입 시 활성 세팅이 빈 상태로 시작하며, 과거 데이터는
          레거시로 보존됩니다.
        </p>
      </div>

      <section className="mt-8">
        <h3 className="text-sm font-normal text-neutral-700">
          레거시 연도 (조회 · 연도 단위 삭제)
        </h3>
        <p className="mt-1 text-xs text-neutral-400">
          연도 삭제 시 이후 연도가 상속·참조하는 영속 학생과 기록은 보존됩니다.
        </p>
        <LegacyYears years={years} activeYear={year} />
      </section>

      <StageGate stage="year" completed={completed} />
    </div>
  );
}
