"use client";
import { useMemo, useState, useTransition } from "react";
import type { PublicPagePayload } from "@/lib/public";
import { saveElectiveAction } from "../actions";
import { Button } from "@/app/ui/button";
import { Card, TT_WEEKDAYS, TT_WEEKDAY_LABEL, TT_PERIODS, kstWeekday, kstWeekDates } from "../_shared";

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

// ── 시간표(월~금 × 1~7교시) ─────────────────────────────────────────────────
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
  // 오늘 요일 열 강조(KST 날짜 경계). 토·일이면 강조 없음(1~5 만 표시).
  const todayWeekday = useMemo(() => kstWeekday(), []);
  // 요일 헤더에 이번 주(월요일 시작) 날짜 병기 — 접속 시점 기준 자동 최신화.
  const weekDates = useMemo(() => kstWeekDates(), []);

  return (
    <Card title="시간표">
      {slots.length === 0 ? (
        <p className="text-sm text-neutral-400">등록된 시간표가 없습니다.</p>
      ) : (
        <table className="w-full table-fixed border-collapse text-center text-xs">
          <thead>
            <tr>
              <th className="w-8 border border-neutral-200 bg-neutral-50 py-1" />
              {TT_WEEKDAYS.map((w) => (
                <th
                  key={w}
                  className={`border border-neutral-200 py-1 font-normal ${
                    w === todayWeekday
                      ? "bg-blue-100 text-blue-700"
                      : "bg-neutral-50"
                  }`}
                >
                  <div>
                    {TT_WEEKDAY_LABEL[w]}
                    {w === todayWeekday && (
                      <span className="ml-1 rounded bg-blue-600 px-1 text-[9px] text-white align-middle">
                        오늘
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-[10px] ${
                      w === todayWeekday ? "text-blue-500" : "text-neutral-400"
                    }`}
                  >
                    {weekDates[w]}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TT_PERIODS.map((p) => (
              <tr key={p}>
                <th className="border border-neutral-200 bg-neutral-50 py-1 font-normal text-neutral-400">
                  {p}
                </th>
                {TT_WEEKDAYS.map((w) => {
                  const slot = byCell.get(`${w}::${p}`);
                  return (
                    <td
                      key={w}
                      className={`h-10 border border-neutral-200 align-middle ${
                        w === todayWeekday ? "bg-blue-50" : ""
                      }`}
                    >
                      {slot ? (
                        <TimetableCell token={token} slot={slot} />
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function TimetableCell({
  token,
  slot,
}: {
  token: string;
  slot: PublicPagePayload["timetable"][number];
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(slot.electiveMapped ?? "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (slot.isFixed) {
    // 공통과목: 짙은 회색 텍스트
    return <span className="text-neutral-700">{slot.subjectName}</span>;
  }
  // 선택과목 칸: 매핑값 있으면 표시, 없으면 '선택과목' + 토글.
  // AC-6.1: 선택과목은 항상 파란 계열(공통과목 text-neutral-700 과 시각적 구분).
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
    <div className="px-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full truncate rounded px-1 py-0.5 ${
          slot.electiveMapped
            ? "text-blue-700"
            : "text-blue-600 underline decoration-dotted"
        }`}
        title="선택과목 지정"
      >
        {label}
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="과목명"
            className="w-full rounded border border-neutral-300 px-1 py-0.5 text-[11px]"
          />
          <Button
            type="button"
            loading={pending}
            onClick={submit}
            className="w-full px-1 py-0.5 text-[11px]"
          >
            저장
          </Button>
          {err && <p className="text-[10px] text-red-600">{err}</p>}
        </div>
      )}
    </div>
  );
}

// ── 급식(당일) — 메뉴/영양/칼로리 표 (QC v6 ⑤: 영양 중앙·칼로리 마지막 열) ────
function Meals({ meals }: { meals: PublicPagePayload["meals"] }) {
  return (
    <Card title="오늘 급식">
      {meals.length === 0 ? (
        <p className="text-sm text-neutral-400">오늘 급식 정보가 없습니다.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className="border border-neutral-200 bg-neutral-50 px-2 py-1 font-normal">
                메뉴
              </th>
              <th className="w-40 border border-neutral-200 bg-neutral-50 px-2 py-1 font-normal">
                영양
              </th>
              <th className="w-20 border border-neutral-200 bg-neutral-50 px-2 py-1 font-normal">
                칼로리
              </th>
            </tr>
          </thead>
          <tbody>
            {meals.map((m, i) => (
              <tr key={i}>
                <td className="border border-neutral-200 px-2 py-1 align-top whitespace-pre-line">
                  {m.menu}
                </td>
                <td className="border border-neutral-200 px-2 py-1 align-top whitespace-pre-line text-xs text-neutral-600">
                  {m.ntrInfo ?? "-"}
                </td>
                <td className="border border-neutral-200 px-2 py-1 align-top text-neutral-600">
                  {m.calInfo ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
