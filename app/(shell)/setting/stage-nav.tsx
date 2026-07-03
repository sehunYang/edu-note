"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Stage = {
  feature: string;
  n: number;
  title: string;
  unlocked: boolean;
  completed: boolean;
};

/**
 * 세팅실 단계 네비 (Stage 2-3). 5단계 순차 게이팅(잠금/완료)을 그대로 보존하면서
 * 현재 경로에 해당하는 단계에 활성 인디케이터를 부여한다. 잠금 단계는 비활성
 * span으로, 열린 단계는 활성 여부에 따라 스타일을 달리한 Link로 렌더한다.
 */
export function StageNav({ stages }: { stages: Stage[] }) {
  const pathname = usePathname();
  const base = "flex items-center gap-2 rounded-md border px-3 py-2 text-sm";

  return (
    <nav className="mt-6 flex flex-wrap gap-2" aria-label="세팅 단계">
      {stages.map((s) => {
        if (!s.unlocked) {
          return (
            <span
              key={s.feature}
              aria-disabled
              title="선행 단계를 먼저 완료하세요"
              className={`${base} cursor-not-allowed border-neutral-200 text-neutral-300`}
            >
              🔒 {s.n}. {s.title}
            </span>
          );
        }
        const href = `/setting/${s.feature}`;
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={s.feature}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`${base} transition-colors ${
              active
                ? "border-white/60 bg-white/10 text-white"
                : "border-white/25 text-neutral-700 hover:border-neutral-500 hover:bg-white/10"
            }`}
          >
            <span>
              {s.n}. {s.title}
            </span>
            {s.completed && <span className="text-green-600">✓</span>}
          </Link>
        );
      })}
    </nav>
  );
}
