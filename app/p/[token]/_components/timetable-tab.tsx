"use client";
import { useMemo, useState, useTransition } from "react";
import type { PublicPagePayload } from "@/lib/public";
import { saveElectiveAction } from "../actions";
import { Button } from "@/app/ui/button";
import {
  Card,
  TT_WEEKDAYS,
  TT_WEEKDAY_LABEL,
  TT_PERIODS,
  kstWeekday,
  slotColorKey,
  subjectColorsForTimetable,
} from "../_shared";

export function TimetableTab({
  token,
  slots,
  meals,
}: {
  token: string;
  slots: PublicPagePayload["timetable"];
  meals: PublicPagePayload["meals"];
}) {
  return (
    <>
      <Timetable token={token} slots={slots} />
      <Meals meals={meals} />
    </>
  );
}

// ── 시간표(선택 요일 일간 뷰) ────────────────────────────────────────────────
function Timetable({
  token,
  slots,
}: {
  token: string;
  slots: PublicPagePayload["timetable"];
}) {
  const byCell = useMemo(() => {
    const map = new Map<string, PublicPagePayload["timetable"][number]>();
    for (const s of slots) map.set(`${s.weekday}::${s.period}`, s);
    return map;
  }, [slots]);
  // 과목별 안정 색(주간 전체 등장순 — 홈 탭 오늘 요약과 동일 맵, 오늘의학교 팔레트).
  const subjectColors = useMemo(() => subjectColorsForTimetable(slots), [slots]);
  // 오늘 요일(KST 날짜 경계). 시간표에는 월~금 데이터만 있으므로 토·일이면 월요일 기본 선택.
  const todayWeekday = useMemo(() => kstWeekday(), []);
  const [weekday, setWeekday] = useState<number>(() =>
    todayWeekday >= 6 ? 1 : todayWeekday,
  );

  return (
    <Card title="시간표">
      {slots.length === 0 ? (
        <p className="text-sm text-neutral-400">등록된 시간표가 없습니다.</p>
      ) : (
        <>
          <div className="flex gap-1.5">
            {TT_WEEKDAYS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWeekday(w)}
                className={`min-h-[44px] flex-1 rounded-lg px-3 text-sm ${
                  w === weekday
                    ? "bg-blue-100 text-blue-700"
                    : "text-neutral-500"
                }`}
              >
                {TT_WEEKDAY_LABEL[w]}
                {w === todayWeekday && (
                  <span className="mx-auto mt-0.5 block h-1 w-1 rounded-full bg-blue-500" />
                )}
              </button>
            ))}
          </div>
          <div className="mt-2 space-y-1.5">
            {TT_PERIODS.map((p) => {
              const slot = byCell.get(`${weekday}::${p}`);
              const colorKey = slot ? slotColorKey(slot) : null;
              return (
                <div key={p} className="flex min-h-[44px] items-center gap-3">
                  <span className="w-6 shrink-0 text-sm text-neutral-400">{p}</span>
                  <div className="min-w-0 flex-1">
                    {slot ? (
                      <TimetableCell
                        token={token}
                        slot={slot}
                        color={colorKey ? subjectColors.get(colorKey) : undefined}
                      />
                    ) : (
                      <span className="px-2 text-sm text-neutral-300">-</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

function TimetableCell({
  token,
  slot,
  color,
}: {
  token: string;
  slot: PublicPagePayload["timetable"][number];
  /** 과목별 안정 색(subjectColorsForTimetable). 미지정 선택과목은 undefined. */
  color?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(slot.electiveMapped ?? "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (slot.isFixed) {
    // 공통과목: 과목색 칩 행(오늘의학교 오늘 시간표와 동일 팔레트).
    return (
      <div
        className={`flex min-h-[44px] items-center truncate rounded border px-2 text-sm ${
          color ?? "border-hairline text-neutral-700"
        }`}
      >
        {slot.subjectName}
      </div>
    );
  }
  // 선택과목 행: 매핑값 있으면 과목색 칩, 없으면 '선택과목' 점선 파랑(지정 유도) + 토글.
  const label = slot.electiveMapped ?? "선택과목";

  function submit() {
    const subject = value.trim();
    if (!subject) return;
    setErr(null);
    start(async () => {
      const res = await saveElectiveAction(token, slot.weekday, slot.period, subject);
      if (res.ok) setOpen(false);
      else setErr(res.message);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`min-h-[44px] w-full truncate rounded border px-2 text-left text-sm ${
          slot.electiveMapped && color
            ? color
            : "border-dashed border-blue-300 text-blue-600 underline decoration-dotted"
        }`}
        title="선택과목 지정"
      >
        {label}
      </button>
      {open && (
        <div className="space-y-1 pb-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="과목명"
            className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          />
          <Button
            type="button"
            loading={pending}
            onClick={submit}
            className="min-h-[44px] w-full px-1 text-sm"
          >
            저장
          </Button>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
      )}
    </div>
  );
}

// ── 급식(당일) — 메뉴 리스트 + 칼로리 배지 + 영양정보 접기 ────────────────────
function Meals({ meals }: { meals: PublicPagePayload["meals"] }) {
  return (
    <Card title="오늘 급식">
      {meals.length === 0 ? (
        <p className="text-sm text-neutral-400">오늘 급식 정보가 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {meals.map((m, i) => (
            <MealCard key={m.date ?? i} meal={m} />
          ))}
        </div>
      )}
    </Card>
  );
}

function MealCard({ meal }: { meal: PublicPagePayload["meals"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-hairline p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-neutral-400">{meal.date}</span>
        {meal.calInfo && (
          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
            {meal.calInfo}
          </span>
        )}
      </div>
      <p className="mt-2 whitespace-pre-line text-sm">{meal.menu}</p>
      {meal.ntrInfo && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-2 min-h-[44px] text-xs text-neutral-500 underline decoration-dotted"
          >
            영양정보 {open ? "숨기기" : "보기"}
          </button>
          <div className={`accordion ${open ? "accordion-open" : ""}`}>
            <div>
              <p className="whitespace-pre-line pt-1 text-xs text-neutral-500">
                {meal.ntrInfo}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
