/**
 * 학생 활동 배치 (계획 §3.4 activityPlacement, AC-E).
 *
 * tag=both(자율·진로 둘 다) 인 활동은 생성 시 한 곳으로만 확정해야
 * 양쪽 세특에 중복 투입되지 않는다. 기본 정책 = 자율 우선(변경 가능 상수).
 */
import type { ActivityTag, ActivityPlacement } from "./types";

/** both 일 때 기본 배치면. 정책 변경 시 이 상수만 수정. */
export const DEFAULT_BOTH_PLACEMENT: ActivityPlacement = "autonomy";

/** tag → 확정 배치면(1곳). */
export function resolvePlacement(tag: ActivityTag): ActivityPlacement {
  if (tag === "both") return DEFAULT_BOTH_PLACEMENT;
  return tag;
}
