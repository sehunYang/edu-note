import { CountUp } from "@/app/ui/count-up";

/**
 * 허브 요약 통계 위젯 (Stage 3-2) — 3종 지표를 CountUp으로 표시한다. 표시 전용:
 * 수치는 페이지가 기존 쿼리(진척도·넛지·상담 예약)를 조합해 props로 주입한다.
 *  ① 주간 진도율(%)  ② 오늘 미기록 관찰(건)  ③ 이번 주 상담 예약(건)
 */
export function SummaryWidget({
  progressPercent,
  unrecordedObservations,
  weeklyReservations,
  className,
}: {
  progressPercent: number;
  unrecordedObservations: number;
  weeklyReservations: number;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-neutral-200 p-4 ${className ?? ""}`}>
      <h2 className="text-sm text-neutral-700">요약 통계</h2>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
        <Stat label="주간 진도율">
          <CountUp value={progressPercent} suffix="%" />
        </Stat>
        <Stat label="오늘 미기록 관찰">
          <CountUp value={unrecordedObservations} suffix="건" />
        </Stat>
        <Stat label="이번 주 상담 예약">
          <CountUp value={weeklyReservations} suffix="건" />
        </Stat>
      </dl>
    </section>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-neutral-100 bg-neutral-50 p-3">
      <dd className="text-2xl font-normal tracking-tight text-neutral-800">
        {children}
      </dd>
      <dt className="mt-1 text-xs text-neutral-500">{label}</dt>
    </div>
  );
}
