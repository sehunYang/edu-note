"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface SectionOption {
  sectionId: string;
  label: string;
  subjectName: string;
}

/**
 * 통계실 성적 분석 분반 셀렉터 (client). `classroom/semester-selector.tsx`와 동일
 * 패턴 — `?section=`을 URL searchParam으로 관리하고 다른 파라미터(semester 등)는
 * 보존한 채 router.push 한다.
 */
export function SectionSelector({
  sections,
  selectedSectionId,
}: {
  sections: SectionOption[];
  selectedSectionId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(sectionId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", sectionId);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={selectedSectionId}
      onChange={(e) => select(e.target.value)}
      aria-label="분반 선택"
      className="max-w-full rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm"
    >
      {sections.map((s) => (
        <option key={s.sectionId} value={s.sectionId}>
          {s.subjectName} · {s.label}
        </option>
      ))}
    </select>
  );
}
