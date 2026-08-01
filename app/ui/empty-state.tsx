import Link from "next/link";

/**
 * 빈 상태 안내 + 다음 행동 링크 (사용성 개선 P2-14).
 *
 * 이전 빈 상태들은 갈 곳을 말로만 알려줬다 — 예: "세팅실 학사일정에 시험(1차/2차)을
 * 등록하고, 수업 관리의 평가설정에서 …" 를 읽고 사용자가 직접 세팅실을 찾아
 * 들어가야 했다. 안내 문구 옆에 실제 링크를 붙여 1클릭으로 잇는다.
 */
export function EmptyState({
  children,
  actions = [],
  tone = "amber",
}: {
  children: React.ReactNode;
  actions?: { href: string; label: string }[];
  tone?: "amber" | "neutral";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-neutral-200 text-neutral-500";

  return (
    <div className={`rounded-lg border p-4 text-sm ${toneClass}`}>
      <p>{children}</p>
      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="inline-flex min-h-11 items-center rounded-full border border-current px-3 text-xs hover:bg-white/10"
            >
              {a.label} →
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
