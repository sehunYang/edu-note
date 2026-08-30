import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  isStageUnlocked,
  isStageComplete,
  getEventsWithAttrs,
  getUpcomingEvents,
  getMealsInRange,
} from "@/lib/db/queries";
import { activeSchoolYear, schoolYearRange } from "@/lib/domain/school-year";
import { StageGate } from "../stage-gate";
import { LockedNotice } from "../locked-notice";
import { CalendarAttrs } from "./calendar-attrs";
import { kstDateString } from "@/lib/domain/kst";
import { neisEnabled } from "@/lib/config/features";
import { FeatureOff } from "@/app/ui/feature-off";

export const metadata = { title: "학사일정 설정" };

export const dynamic = "force-dynamic";

function todayStr(): string {
  return kstDateString();
}
function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface MealItem {
  mealType: string;
  menu: string[];
  calInfo: string | null;
}
function readMeals(payload: unknown): MealItem[] {
  if (payload && typeof payload === "object" && "meals" in payload) {
    const m = (payload as { meals?: unknown }).meals;
    if (Array.isArray(m)) return m as MealItem[];
  }
  return [];
}

/** C3 학사 일정 + 키워드 — NEIS 동기화 + 자동 분류 보정 + 다가오는 일정·급식 조회. */
export default async function CalendarStagePage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  if (!(await isStageUnlocked(db, ownerId, "calendar"))) return <LockedNotice />;
  const neisOn = await neisEnabled();
  const range = schoolYearRange(activeSchoolYear(new Date()));
  const today = todayStr();
  const [completed, events, upcoming, meals] = await Promise.all([
    isStageComplete(db, ownerId, "calendar"),
    getEventsWithAttrs(db, ownerId, range.start, range.end),
    getUpcomingEvents(db, ownerId, today, 15),
    getMealsInRange(db, ownerId, today, addDays(today, 7)),
  ]);

  return (
    <div>
      <h2 className="text-lg">3. 학사 일정 + 키워드</h2>
      {!neisOn && (
        <FeatureOff
          title="나이스 연동이 꺼져 있습니다"
          description="학사일정과 급식을 자동으로 가져오려면 나이스 인증키가 필요합니다. 일정은 직접 입력해서 쓸 수도 있습니다."
          howTo="나이스 교육정보 개방포털에서 무료로 즉시 발급됩니다. 발급받은 키를 세팅실 → 시스템 상태에서 등록하세요."
          href="https://open.neis.go.kr"
          linkLabel="인증키 발급받기"
        />
      )}
      <CalendarAttrs events={events} />

      <div className="mt-8 grid gap-8 [&>*]:min-w-0 md:grid-cols-2">
        <section>
          <h3 className="text-sm text-neutral-700">다가오는 학사일정</h3>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-400">
              일정이 없습니다. 위에서 동기화하세요.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-sm">
              {upcoming.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-24 shrink-0 text-neutral-400">{e.date}</span>
                  <span>{e.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-sm text-neutral-700">이번 주 급식</h3>
          {meals.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-400">급식 정보가 없습니다.</p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {meals.map((m) => (
                <li key={m.date}>
                  <div className="text-neutral-400">{m.date}</div>
                  {readMeals(m.payload).map((meal, j) => (
                    <div key={j} className="ml-2">
                      <span className="text-xs text-neutral-500">{meal.mealType}</span>{" "}
                      {meal.menu.join(", ")}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <StageGate stage="calendar" completed={completed} />
    </div>
  );
}
