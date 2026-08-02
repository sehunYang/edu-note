import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { isStageComplete, listSchoolYears } from "@/lib/db/queries";
import { activeSchoolYear, schoolYearRange } from "@/lib/domain/school-year";
import { StageGate } from "../stage-gate";
import { LegacyYears } from "./legacy-years";

export const metadata = { title: "학년도 설정" };

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
      <h2 className="text-lg">1. 학년도</h2>

      <div className="mt-5 rounded-lg border border-neutral-200 p-5">
        <div className="text-3xl font-normal tracking-tight">{year}학년도</div>
        <p className="mt-1 text-sm text-neutral-500">
          {range.start} ~ {range.end}
          {/* 입력칸이 없는 이유 — 고를 수 없는 값이라는 사실만 알리면 충분하다. */}
          <span className="ml-2 text-xs text-neutral-400">오늘 날짜로 자동 산정</span>
        </p>
      </div>

      <section className="mt-8">
        <h3 className="flex flex-wrap items-baseline gap-2 text-sm text-neutral-700">
          레거시 연도
          <span className="text-xs text-neutral-400">
            삭제해도 이후 연도가 참조하는 학생·기록은 보존
          </span>
        </h3>
        <LegacyYears years={years} activeYear={year} />
      </section>

      <StageGate stage="year" completed={completed} />
    </div>
  );
}
