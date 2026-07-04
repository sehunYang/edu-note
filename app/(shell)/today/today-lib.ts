import type { TimetableViewSlot } from "@/lib/db/queries";

/**
 * 오늘의 학교 · 허브 공용 헬퍼 (Stage 3-2에서 today/page.tsx 인라인 로직을 추출).
 * 표시 로직은 위젯 컴포넌트가, 데이터 준비(fetch·가공)는 각 페이지가 담당한다.
 */

/** KST 기준 오늘(yyyy-mm-dd)과 요일(1=월..7=일). */
export function kstToday(): { date: string; weekday: number } {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const date = kst.toISOString().slice(0, 10);
  const jsDay = kst.getUTCDay(); // 0=일..6=토
  return { date, weekday: jsDay === 0 ? 7 : jsDay };
}

export interface MealItem {
  mealType: string;
  menu: string[];
  calInfo: string | null;
  ntrInfo: string | null;
}

export function readMeals(payload: unknown): MealItem[] {
  if (payload && typeof payload === "object" && "meals" in payload) {
    const m = (payload as { meals?: unknown }).meals;
    if (Array.isArray(m)) {
      return m.map((x) => {
        const o = (x ?? {}) as Record<string, unknown>;
        return {
          mealType: typeof o.mealType === "string" ? o.mealType : "",
          menu: Array.isArray(o.menu) ? (o.menu as string[]) : [],
          calInfo: typeof o.calInfo === "string" ? o.calInfo : null,
          ntrInfo: typeof o.ntrInfo === "string" ? o.ntrInfo : null,
        };
      });
    }
  }
  return [];
}

/** date(yyyy-mm-dd)가 속한 ISO 주의 월요일~일요일(yyyy-mm-dd). 진척도/상담 집계 공용. */
export function weekRange(date: string): { weekStart: string; weekEnd: string } {
  const now = new Date(date + "T00:00:00Z");
  const dow = now.getUTCDay(); // 0=일..6=토
  const sinceMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - sinceMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
  };
}

/** 오늘 요일 슬롯만 교시순으로 정렬(시간표 위젯 입력). */
export function todaySlotsFor(
  slots: TimetableViewSlot[],
  weekday: number,
): TimetableViewSlot[] {
  return slots
    .filter((s) => s.weekday === weekday)
    .sort((a, b) => a.period - b.period);
}
