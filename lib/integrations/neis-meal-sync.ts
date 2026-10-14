import "server-only";
import { and, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { fetchMealService } from "./neis-client";
import { upsertMealCache } from "@/lib/db/queries";

/**
 * NEIS 급식 자동 갱신 (daily-brief 크론 단계).
 *
 * 급식은 학교가 NEIS 에 **월 단위로** 올리므로, 세팅실 학사일정 sync 시점에 아직 없던
 * 달의 급식은 수동 재동기화 전까지 meal_cache 에 들어오지 않았다(오늘 급식 공란 버그).
 * 매일 이번 달 1일 ~ 다음 달 말일을 다시 받아 upsert 한다. 비수업일도 스킵하지 않는다
 * (방학 중 등록된 다음 달 급식을 미리 받아두기 위함). NEIS 코드가 설정된 오너만 대상.
 * NEIS 클라이언트는 Result 라 throw 없음 — 오너별 실패는 집계만 하고 계속한다.
 */

type DB = ReturnType<typeof getDb>;

export interface NeisMealSyncSummary {
  owners: number;
  daysWritten: number;
  fetchFailures: number;
}

/** today(yyyy-mm-dd) → 이번 달 1일 ~ 다음 달 말일(YYYYMMDD). */
export function mealSyncRangeYmd(today: string): { fromYmd: string; toYmd: string } {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)); // 1..12
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m + 1, 0)); // 다음 달 말일
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  return { fromYmd: ymd(from), toYmd: ymd(to) };
}

/** 크론 진입점. today = KST yyyy-mm-dd(호출측 산출). DB 오류는 상위 try/catch 로 격리. */
export async function syncNeisMeals(
  db: DB,
  today: string,
): Promise<NeisMealSyncSummary> {
  const summary: NeisMealSyncSummary = { owners: 0, daysWritten: 0, fetchFailures: 0 };
  const { fromYmd, toYmd } = mealSyncRangeYmd(today);

  const owners = await db
    .select({
      ownerId: schema.teacherProfile.ownerId,
      officeCode: schema.teacherProfile.neisOfficeCode,
      schoolCode: schema.teacherProfile.neisSchoolCode,
    })
    .from(schema.teacherProfile)
    .where(
      and(
        isNotNull(schema.teacherProfile.neisOfficeCode),
        isNotNull(schema.teacherProfile.neisSchoolCode),
      ),
    );

  for (const o of owners) {
    if (!o.officeCode || !o.schoolCode) continue;
    summary.owners += 1;
    const res = await fetchMealService(
      { officeCode: o.officeCode, schoolCode: o.schoolCode },
      fromYmd,
      toYmd,
    );
    if (!res.ok) {
      summary.fetchFailures += 1;
      continue;
    }
    // 무데이터면 upsert 0건 — 기존 캐시는 지우지 않는다.
    summary.daysWritten += await upsertMealCache(db, o.ownerId, res.data);
  }
  return summary;
}
