import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { setupState } from "../schema/misc";

/**
 * 세팅실 순차 게이팅 헬퍼 (QC v1 단계0, AC-0.1). setup_state(owner, feature,
 * completedAt) 로 각 단계 완료 여부를 기록·조회한다. 선행 단계가 완료되어야
 * 다음 단계가 해제된다.
 */
type DB = PostgresJsDatabase<typeof schema>;

/** 세팅실 5단계 feature 키(순서 = 게이팅 위계). */
export const SETTING_STAGES = [
  "year", // C1 학년도
  "profile", // C2 교사 기본
  "calendar", // C3 학사일정
  "students", // C4 학생 명단
  "courses", // C5 수업 관리
] as const;

export type SettingStage = (typeof SETTING_STAGES)[number];

/** feature → completedAt(완료시각, 미완료면 부재) 맵. */
export async function getSetupState(
  db: DB,
  ownerId: string,
): Promise<Record<string, Date | null>> {
  const rows = await db
    .select({ feature: setupState.feature, completedAt: setupState.completedAt })
    .from(setupState)
    .where(eq(setupState.ownerId, ownerId));
  const map: Record<string, Date | null> = {};
  for (const r of rows) map[r.feature] = r.completedAt;
  return map;
}

/** 단계 완료 기록(멱등 upsert). completedAt=now. */
export async function markSetupComplete(
  db: DB,
  ownerId: string,
  feature: string,
): Promise<void> {
  const now = new Date();
  await db
    .insert(setupState)
    .values({ ownerId, feature, completedAt: now })
    .onConflictDoUpdate({
      target: [setupState.ownerId, setupState.feature],
      set: { completedAt: now, updatedAt: now },
    });
}

/** 단계 완료 해제(미완료로 되돌림). */
export async function clearSetupComplete(
  db: DB,
  ownerId: string,
  feature: string,
): Promise<void> {
  await db
    .delete(setupState)
    .where(
      and(eq(setupState.ownerId, ownerId), eq(setupState.feature, feature)),
    );
}

/** 단일 단계 완료 여부. */
export async function isStageComplete(
  db: DB,
  ownerId: string,
  feature: string,
): Promise<boolean> {
  const state = await getSetupState(db, ownerId);
  return !!state[feature];
}

/**
 * 해당 단계가 잠금 해제되었는지(= 모든 선행 단계 완료). 첫 단계(year)는 항상 해제.
 * SETTING_STAGES 에 없는 feature 는 게이팅 대상이 아니므로 true.
 */
export async function isStageUnlocked(
  db: DB,
  ownerId: string,
  feature: SettingStage,
): Promise<boolean> {
  const idx = SETTING_STAGES.indexOf(feature);
  if (idx <= 0) return true;
  const state = await getSetupState(db, ownerId);
  for (let i = 0; i < idx; i++) {
    if (!state[SETTING_STAGES[i]]) return false;
  }
  return true;
}

export interface StageStatus {
  feature: SettingStage;
  completed: boolean;
  unlocked: boolean;
}

/** 5단계 전체 상태(네비 렌더용). */
export async function getStageStatuses(
  db: DB,
  ownerId: string,
): Promise<StageStatus[]> {
  const state = await getSetupState(db, ownerId);
  let prevComplete = true;
  return SETTING_STAGES.map((feature, i) => {
    const completed = !!state[feature];
    const unlocked = i === 0 ? true : prevComplete;
    prevComplete = prevComplete && completed;
    return { feature, completed, unlocked };
  });
}
