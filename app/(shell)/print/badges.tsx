import type { JipilTrend, SectionRank } from "@/lib/domain/student-report";

/** 인쇄실 학생 목록·상세 화면 공용 플래그 배지(범위 화면 + 상세 화면에서 재사용). */
export function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-normal ${cls}`}>{label}</span>
  );
}

export function TrendBadge({ trend }: { trend: JipilTrend }) {
  if (trend === null) return null;
  const map: Record<Exclude<JipilTrend, null>, { label: string; cls: string }> = {
    up: { label: "↑ 지필", cls: "bg-green-100 text-green-700" },
    down: { label: "↓ 지필", cls: "bg-red-100 text-red-700" },
    flat: { label: "→ 지필", cls: "bg-neutral-100 text-neutral-600" },
  };
  const m = map[trend];
  return <Badge label={m.label} cls={m.cls} />;
}

export function RankBadge({ rank }: { rank: SectionRank }) {
  if (rank === null) return null;
  const map: Record<Exclude<SectionRank, null>, { label: string; cls: string }> = {
    high: { label: "상위", cls: "bg-green-100 text-green-700" },
    mid: { label: "중위", cls: "bg-neutral-100 text-neutral-600" },
    low: { label: "하위", cls: "bg-orange-100 text-orange-700" },
  };
  const m = map[rank];
  return <Badge label={m.label} cls={m.cls} />;
}
