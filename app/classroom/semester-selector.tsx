"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * 교실 학기 셀렉터 (client). Next.js App Router는 searchParams를 layout에 주입하지
 * 않으므로 셀렉터를 client로 두고 useSearchParams로 직접 읽는다. `?semester=1|2`를
 * 토글하며 현재 pathname을 보존한 채 router.push 한다(courses/page.tsx와 동일 파라미터명).
 * 기본 표시값 = searchParams 값, 없으면 defaultSemester(layout이 activeSemester 주입).
 */
export function SemesterSelector({
  defaultSemester,
}: {
  defaultSemester: 1 | 2;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get("semester");
  const current: 1 | 2 = raw === "1" ? 1 : raw === "2" ? 2 : defaultSemester;

  function select(sem: 1 | 2) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("semester", String(sem));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div
      className="inline-flex rounded-md border border-neutral-300 p-0.5"
      role="group"
      aria-label="학기 선택"
    >
      {([1, 2] as const).map((sem) => {
        const active = current === sem;
        return (
          <button
            key={sem}
            type="button"
            onClick={() => select(sem)}
            aria-pressed={active}
            className={`rounded px-3 py-1 text-sm ${
              active
                ? "bg-neutral-800 text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {sem}학기
          </button>
        );
      })}
    </div>
  );
}
