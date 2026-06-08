import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  getTeacherNeisConfig,
  getUpcomingEvents,
  getMealsInRange,
} from "@/lib/db/queries";
import { CalendarSyncForm } from "./sync-form";

export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
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

/** 캘린더 화면 (계획 §4 E). NEIS 학사일정·급식 동기화 + 다가오는 일정/급식. */
export default async function CalendarPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const today = todayStr();

  const [config, events, meals] = await Promise.all([
    getTeacherNeisConfig(db, ownerId),
    getUpcomingEvents(db, ownerId, today, 15),
    getMealsInRange(db, ownerId, today, addDays(today, 7)),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">학사일정 · 급식</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>

      <section className="mt-6 rounded-lg border border-neutral-200 p-5">
        <h2 className="text-sm font-semibold text-neutral-700">NEIS 동기화</h2>
        <p className="mt-1 text-xs text-neutral-400">
          학사일정(수업일 판정)과 급식을 NEIS 개방포털에서 가져옵니다.
          {config?.lastCalendarSyncAt && (
            <>
              {" "}마지막 동기화:{" "}
              {new Date(config.lastCalendarSyncAt).toLocaleString("ko-KR")}
            </>
          )}
        </p>
        <div className="mt-3">
          <CalendarSyncForm defaultSchool={config?.neisSchoolName ?? ""} />
        </div>
      </section>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="text-sm font-semibold text-neutral-700">다가오는 학사일정</h2>
          {events.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-400">
              일정이 없습니다. 위에서 동기화하세요.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-sm">
              {events.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-24 shrink-0 text-neutral-400">{e.date}</span>
                  <span>{e.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-neutral-700">이번 주 급식</h2>
          {meals.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-400">급식 정보가 없습니다.</p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {meals.map((m) => (
                <li key={m.date}>
                  <div className="text-neutral-400">{m.date}</div>
                  {readMeals(m.payload).map((meal, j) => (
                    <div key={j} className="ml-2">
                      <span className="text-xs text-neutral-500">
                        {meal.mealType}
                      </span>{" "}
                      {meal.menu.join(", ")}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
