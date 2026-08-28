"use client";
import { useRouter } from "next/navigation";

/**
 * 오늘 입력 날짜 선택 — 고르는 즉시 그 날짜의 출결로 이동한다('이동' 버튼 제거).
 * key={date} 로 네비게이션 후 새 날짜가 입력칸에 반영되게 한다(uncontrolled).
 * 연도를 타이핑하는 중간값(예: 0002-…)으로 튀지 않게 2000년 이후만 이동.
 */
export function AttendanceDateJump({ date }: { date: string }) {
  const router = useRouter();
  return (
    <div className="mt-4 flex items-center gap-2 text-sm">
      <label htmlFor="attendance-date" className="text-neutral-500">
        날짜
      </label>
      <input
        key={date}
        id="attendance-date"
        type="date"
        defaultValue={date}
        onChange={(e) => {
          const v = e.target.value;
          if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v >= "2000-01-01") {
            router.push(`/homeroom/attendance?view=today&date=${v}`);
          }
        }}
        className="rounded border border-neutral-300 px-2 py-1"
      />
    </div>
  );
}
