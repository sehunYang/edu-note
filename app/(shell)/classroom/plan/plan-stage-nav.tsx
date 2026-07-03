import Link from "next/link";

/**
 * 수업 계획실 2단계 하위 탭(학기계획 / 차시계획) (QC v4 US-2, AC-1.1).
 * 활성 탭만 진하게 표시. `?semester` 쿼리를 두 링크에 전파한다.
 */
export function PlanStageNav({
  active,
  semester,
}: {
  active: "semester" | "session";
  semester?: string;
}) {
  const qs = semester ? `?semester=${semester}` : "";
  const stages: { key: "semester" | "session"; href: string; label: string }[] = [
    { key: "semester", href: `/classroom/plan/semester${qs}`, label: "1. 학기 계획" },
    { key: "session", href: `/classroom/plan/session${qs}`, label: "2. 차시 계획" },
  ];
  return (
    <nav className="mt-4 flex gap-2" aria-label="수업 계획 단계">
      {stages.map((s) => (
        <Link
          key={s.key}
          href={s.href}
          className={`rounded-md px-3 py-1.5 text-sm ${
            s.key === active
              ? "border border-white/25 bg-transparent text-white"
              : "border border-white/25 text-neutral-600 hover:bg-white/10"
          }`}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
