import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { activeSemester } from "@/lib/domain/school-year";
import {
  getTeacherTimetable,
  getUpcomingEvents,
  getMealsInRange,
  listSectionsWithProgress,
  collectNudges,
  listPendingReportTiers,
  listStudents,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/** KST 기준 오늘(yyyy-mm-dd)과 요일(1=월..7=일). */
function kstToday(): { date: string; weekday: number } {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const date = kst.toISOString().slice(0, 10);
  const jsDay = kst.getUTCDay(); // 0=일..6=토
  return { date, weekday: jsDay === 0 ? 7 : jsDay };
}

interface MealItem {
  mealType: string;
  menu: string[];
}
function readMeals(payload: unknown): MealItem[] {
  if (payload && typeof payload === "object" && "meals" in payload) {
    const m = (payload as { meals?: unknown }).meals;
    if (Array.isArray(m)) return m as MealItem[];
  }
  return [];
}

/**
 * 오늘의 학교 — 통합 대시보드 (계획 §4 K-1). 오늘 시간표·급식·다가오는 일정·넛지·
 * 미제출 신고서 티어·잔여차시를 한 화면에 집계. 기존 쿼리 계층을 재사용한다.
 */
export default async function TodayPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = new Date().getFullYear();
  const semester = activeSemester(new Date());
  const { date, weekday } = kstToday();

  const [allSlots, events, meals, sections, nudges, pendingTiers, students] =
    await Promise.all([
      getTeacherTimetable(db, ownerId, year, semester),
      getUpcomingEvents(db, ownerId, date, 5),
      getMealsInRange(db, ownerId, date, date),
      listSectionsWithProgress(db, ownerId, year),
      collectNudges(db, ownerId, year),
      listPendingReportTiers(db, ownerId),
      listStudents(db, ownerId, year),
    ]);

  const todaySlots = allSlots
    .filter((s) => s.weekday === weekday)
    .sort((a, b) => a.period - b.period);
  const todayMeals = meals.flatMap((m) => readMeals(m.payload));
  const tierCount = {
    total: pendingTiers.length,
    warning: pendingTiers.filter((t) => t === "warning").length,
    critical: pendingTiers.filter((t) => t === "critical").length,
  };
  const remainingTotal = sections.reduce((acc, s) => acc + s.plannedUpToBoundary, 0);
  const suggestedSid = nudges.unrecordedObservation?.suggestedStudentId;
  const suggested = suggestedSid
    ? students.find((s) => s.id === suggestedSid)
    : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">오늘의 학교</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>
      <p className="mt-1 text-xs text-neutral-400">{date}</p>

      {/* 넛지 요약 */}
      {nudges.hasAny && (
        <section className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <h2 className="font-semibold text-amber-800">해야 할 일</h2>
          <ul className="mt-2 space-y-1">
            {nudges.unrecordedObservation && (
              <li>
                관찰기록 추천: <strong>{suggested ? `${suggested.sid} ${suggested.name}` : "학생"}</strong>{" "}
                외 {Math.max(0, nudges.unrecordedObservation.candidateCount - 1)}명 ·{" "}
                <Link href="/observations" className="underline">
                  기록
                </Link>
              </li>
            )}
            {nudges.behaviorNotes && (
              <li>
                행동특성 미작성 {nudges.behaviorNotes.pendingCount}명(16시 이후) ·{" "}
                <Link href="/observations" className="underline">
                  쓰기
                </Link>
              </li>
            )}
            {nudges.pendingReports && (
              <li>
                미제출 신고서 {nudges.pendingReports.total}건 ·{" "}
                <Link href="/homeroom/attendance" className="underline">
                  확인
                </Link>
              </li>
            )}
          </ul>
        </section>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* 오늘 시간표 */}
        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-semibold text-neutral-700">오늘 시간표</h2>
          {todaySlots.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400">오늘 수업이 없거나 시간표 미동기화.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {todaySlots.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-10 text-neutral-400">{s.period}교시</span>
                  <span>
                    {s.subjectName} <span className="text-neutral-400">{s.label}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 오늘 급식 */}
        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-semibold text-neutral-700">오늘 급식</h2>
          {todayMeals.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400">급식 정보가 없습니다.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {todayMeals.map((m, i) => (
                <li key={i}>
                  <span className="text-neutral-400">{m.mealType}</span>{" "}
                  {m.menu.join(", ")}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 다가오는 학사일정 */}
        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-semibold text-neutral-700">다가오는 학사일정</h2>
          {events.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400">예정된 일정이 없습니다.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {events.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-24 text-neutral-400">{e.date}</span>
                  <span>{e.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 신고서 / 잔여차시 요약 */}
        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-semibold text-neutral-700">신고서 · 차시 요약</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">미제출 신고서</dt>
              <dd>
                {tierCount.total}건
                {tierCount.critical > 0 && (
                  <span className="ml-1 font-semibold text-red-600">심각 {tierCount.critical}</span>
                )}
                {tierCount.warning > 0 && (
                  <span className="ml-1 text-orange-600">위험 {tierCount.warning}</span>
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">남은 차시(전 분반)</dt>
              <dd>{remainingTotal}차시</dd>
            </div>
          </dl>
          <div className="mt-3 flex gap-2 text-xs">
            <Link href="/homeroom/attendance" className="underline text-neutral-500">출결</Link>
            <Link href="/sessions" className="underline text-neutral-500">시수</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
