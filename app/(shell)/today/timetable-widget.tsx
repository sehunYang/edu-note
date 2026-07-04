import type { TimetableViewSlot } from "@/lib/db/queries";

/**
 * 오늘 시간표 위젯 (AC-7.7) — 수업마다 색상 + 표준 교시 시간을 표시한다.
 * 표시 전용: 오늘 슬롯(교시순 정렬 완료)을 props로 받는다.
 */

// 교시별 표준 수업 시간(AC-7.7 시간 표기). 학교별 차이는 있으나 일반 중·고 기준.
const PERIOD_TIMES: Record<number, string> = {
  1: "09:00",
  2: "10:00",
  3: "11:00",
  4: "12:00",
  5: "13:50",
  6: "14:50",
  7: "15:50",
};

// 수업마다 다른 색(AC-7.7). 과목별로 안정적 색을 배정(neutral-friendly 팔레트).
const SLOT_COLORS = [
  "bg-rose-50 border-rose-200 text-rose-700",
  "bg-sky-50 border-sky-200 text-sky-700",
  "bg-amber-50 border-amber-200 text-amber-700",
  "bg-emerald-50 border-emerald-200 text-emerald-700",
  "bg-violet-50 border-violet-200 text-violet-700",
  "bg-cyan-50 border-cyan-200 text-cyan-700",
  "bg-orange-50 border-orange-200 text-orange-700",
  "bg-teal-50 border-teal-200 text-teal-700",
];

export function TimetableWidget({
  todaySlots,
  className,
}: {
  todaySlots: TimetableViewSlot[];
  className?: string;
}) {
  // 과목별 안정적 색 인덱스(AC-7.7).
  const colorBySubject = new Map<string, string>();
  let colorIdx = 0;
  for (const s of todaySlots) {
    if (!colorBySubject.has(s.subjectName)) {
      colorBySubject.set(s.subjectName, SLOT_COLORS[colorIdx % SLOT_COLORS.length]);
      colorIdx += 1;
    }
  }

  return (
    <section className={`rounded-lg border border-neutral-200 p-4 ${className ?? ""}`}>
      <h2 className="text-sm font-normal text-neutral-700">오늘 시간표</h2>
      {todaySlots.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-400">오늘 수업이 없거나 시간표 미동기화.</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {todaySlots.map((s, i) => (
            <li
              key={i}
              className={`flex items-center gap-3 rounded border px-2 py-1.5 ${
                colorBySubject.get(s.subjectName) ?? "border-neutral-200"
              }`}
            >
              <span className="w-16 shrink-0 text-xs opacity-70">
                {s.period}교시
                {PERIOD_TIMES[s.period] && (
                  <span className="ml-1">{PERIOD_TIMES[s.period]}</span>
                )}
              </span>
              <span className="font-normal">
                {s.subjectName} <span className="opacity-70">{s.label}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
