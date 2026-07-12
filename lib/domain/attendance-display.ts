/**
 * 출결 kind/reason 칩 색상(Tailwind). event-kind-display.ts 관례 준수(다크 remap hue만,
 * `bg-*-100 text-*-700`). 출결 화면 기존 색과 충돌 회피: 신고서 상태(emerald/amber,
 * attendance-tables-client.tsx)·마감 tier(orange/red, 같은 파일)는 사용하지 않는다.
 * kind·reason은 별도 컬럼이라 두 그룹 간 hue 재사용(sky/rose)은 허용.
 */
import type { AttendanceKind, AttendanceReason } from "./types";

export const ATTENDANCE_KIND_CHIP: Record<AttendanceKind, string> = {
  late: "bg-sky-100 text-sky-700",
  early_leave: "bg-violet-100 text-violet-700",
  absent_period: "bg-cyan-100 text-cyan-700",
  absent: "bg-rose-100 text-rose-700",
};

export const ATTENDANCE_REASON_CHIP: Record<AttendanceReason, string> = {
  accepted: "bg-teal-100 text-teal-700",
  illness: "bg-sky-100 text-sky-700",
  unaccepted: "bg-rose-100 text-rose-700",
  etc: "bg-neutral-200 text-neutral-700",
};
