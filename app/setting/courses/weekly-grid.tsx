import type { TimetableViewSlot } from "@/lib/db/queries";

const WEEKDAYS = ["월", "화", "수", "목", "금"];

/** 주간 시간표 그리드 (C5 세팅실로 이관, 읽기 전용). 동기화된 슬롯을 요일×교시로 표시. */
export function WeeklyGrid({ slots }: { slots: TimetableViewSlot[] }) {
  if (slots.length === 0) {
    return (
      <p className="mt-3 text-sm text-neutral-400">
        아직 시간표가 없습니다. 위에서 컴시간 동기화를 실행하세요.
      </p>
    );
  }

  const maxPeriod = slots.reduce((m, s) => Math.max(m, s.period), 0);
  const cell = new Map<string, { subjectName: string; label: string }>();
  for (const s of slots) {
    cell.set(`${s.weekday}-${s.period}`, {
      subjectName: s.subjectName,
      label: s.label,
    });
  }

  return (
    <table className="mt-4 w-full border-collapse text-center text-sm">
      <thead>
        <tr className="text-neutral-400">
          <th className="border border-neutral-200 px-2 py-1 font-normal">교시</th>
          {WEEKDAYS.map((w) => (
            <th key={w} className="border border-neutral-200 px-2 py-1 font-normal">
              {w}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: maxPeriod }, (_, i) => i + 1).map((p) => (
          <tr key={p}>
            <td className="border border-neutral-200 px-2 py-2 text-neutral-400">
              {p}
            </td>
            {WEEKDAYS.map((_, wi) => {
              const c = cell.get(`${wi + 1}-${p}`);
              return (
                <td key={wi} className="border border-neutral-200 px-2 py-2">
                  {c ? (
                    <span>
                      <span className="font-normal">{c.subjectName}</span>
                      <br />
                      <span className="text-xs text-neutral-400">{c.label}</span>
                    </span>
                  ) : (
                    <span className="text-neutral-200">·</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
