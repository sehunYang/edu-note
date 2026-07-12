"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { HistogramBin } from "@/lib/domain/stats-insights";
import type { PerformanceItemFill } from "@/lib/db/queries/stats-insights";

/**
 * 통계실 성적 분석 차트 3종 (통계실·인쇄실 재구축 AD-3/AD-6). recharts 클라이언트
 * 컴포넌트 — `app/(shell)/stats/ui/` 밖에서 import 금지(공개 번들 격리 관례).
 * 다크 remap 팔레트 톤을 명시 주입(recharts 기본 라이트 팔레트 미사용).
 */

// 다크 remap 팔레트 상수(tailwind.config.ts 원본 hex, 차트 전용 명시 주입).
const COLOR_BLUE = "#60a5fa";
const COLOR_GREEN = "#4ade80";
const COLOR_RED = "#f87171";
const COLOR_AMBER = "#fbbf24";
const COLOR_VIOLET = "#a78bfa";
const COLOR_HAIRLINE = "#212327";
const COLOR_MUTE = "#7d8187";
const COLOR_BODY = "#dadbdf";

const tooltipStyle = {
  background: "#191919",
  border: `1px solid ${COLOR_HAIRLINE}`,
  borderRadius: 6,
  color: COLOR_BODY,
  fontSize: 12,
};

/** 점수 히스토그램(구간별 학생 수). */
export function HistogramChart({ bins }: { bins: HistogramBin[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={bins} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke={COLOR_HAIRLINE} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke={COLOR_HAIRLINE} tick={{ fill: COLOR_MUTE, fontSize: 11 }} />
        <YAxis allowDecimals={false} stroke={COLOR_HAIRLINE} tick={{ fill: COLOR_MUTE, fontSize: 11 }} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: COLOR_BODY }}
          formatter={(value) => [`${Number(value)}명`, "학생 수"]}
        />
        <Bar dataKey="count" fill={COLOR_BLUE} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface SectionComparisonDatum {
  label: string;
  avg: number;
  current: boolean;
}

/** 같은 과목 분반 간 평균 비교(현재 분반 강조). */
export function SectionComparisonChart({ data }: { data: SectionComparisonDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke={COLOR_HAIRLINE} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke={COLOR_HAIRLINE} tick={{ fill: COLOR_MUTE, fontSize: 11 }} />
        <YAxis allowDecimals={false} stroke={COLOR_HAIRLINE} tick={{ fill: COLOR_MUTE, fontSize: 11 }} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: COLOR_BODY }}
          formatter={(value) => [Number(value).toFixed(1), "평균 총점"]}
        />
        <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.label} fill={d.current ? COLOR_VIOLET : COLOR_BLUE} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** 수행평가 항목별 입력률(가로 막대, 입력률 구간별 색상). */
export function PerformanceFillChart({ items }: { items: PerformanceItemFill[] }) {
  const data = items.map((it) => ({
    name: it.name,
    rate: it.totalStudents === 0 ? 0 : Math.round((it.filledCount / it.totalStudents) * 1000) / 10,
    filledCount: it.filledCount,
    totalStudents: it.totalStudents,
  }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 44)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
      >
        <CartesianGrid stroke={COLOR_HAIRLINE} strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          unit="%"
          stroke={COLOR_HAIRLINE}
          tick={{ fill: COLOR_MUTE, fontSize: 11 }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={96}
          stroke={COLOR_HAIRLINE}
          tick={{ fill: COLOR_MUTE, fontSize: 11 }}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: COLOR_BODY }}
          formatter={(value, _name, item) => {
            const payload = item.payload as { filledCount: number; totalStudents: number };
            return [
              `${Number(value)}% (${payload.filledCount}/${payload.totalStudents}명)`,
              "입력률",
            ];
          }}
        />
        <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
          {data.map((d) => (
            <Cell
              key={d.name}
              fill={d.rate >= 80 ? COLOR_GREEN : d.rate >= 50 ? COLOR_AMBER : COLOR_RED}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
