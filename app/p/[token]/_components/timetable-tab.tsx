"use client";
import { useMemo, useState, useTransition } from "react";
import type { PublicPagePayload } from "@/lib/public";
import { saveElectiveAction } from "../actions";
import { Button } from "@/app/ui/button";
import { neisFreshnessBadge } from "@/lib/domain/timetable-freshness";
import {
  classifyWeeklyOverlay,
  buildAliasMapFromPairs,
  isSpecialTimetableEntry,
  vacationWeekdays,
  type OverlayResult,
} from "@/lib/domain/timetable-actual";
import {
  Card,
  TT_WEEKDAYS,
  TT_WEEKDAY_LABEL,
  TT_PERIODS,
  kstToday,
  kstWeekday,
  slotColorKey,
  subjectColorsForTimetable,
} from "../_shared";

export function TimetableTab({
  token,
  slots,
  meals,
  weeklyActual,
  weeklyActualSyncedAt,
  subjectAliasPairs,
}: {
  token: string;
  slots: PublicPagePayload["timetable"];
  meals: PublicPagePayload["meals"];
  weeklyActual: PublicPagePayload["weeklyActual"];
  weeklyActualSyncedAt: string | null;
  subjectAliasPairs: PublicPagePayload["subjectAliasPairs"];
}) {
  return (
    <>
      <Timetable
        token={token}
        slots={slots}
        weeklyActual={weeklyActual}
        weeklyActualSyncedAt={weeklyActualSyncedAt}
        subjectAliasPairs={subjectAliasPairs}
      />
      <Meals meals={meals} />
    </>
  );
}

// ── 시간표(선택 요일 일간 뷰) ────────────────────────────────────────────────
function Timetable({
  token,
  slots,
  weeklyActual,
  weeklyActualSyncedAt,
  subjectAliasPairs,
}: {
  token: string;
  slots: PublicPagePayload["timetable"];
  weeklyActual: PublicPagePayload["weeklyActual"];
  weeklyActualSyncedAt: string | null;
  subjectAliasPairs: PublicPagePayload["subjectAliasPairs"];
}) {
  const byCell = useMemo(() => {
    const map = new Map<string, PublicPagePayload["timetable"][number]>();
    for (const s of slots) map.set(`${s.weekday}::${s.period}`, s);
    return map;
  }, [slots]);
  // NEIS '이번 주 실제' (weekday,period)→과목(선택과목 특별활동 폴백 판정용 원본).
  const actualByCell = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of weeklyActual) {
      if (a.subjectName.trim().length > 0) {
        map.set(`${a.weekday}::${a.period}`, a.subjectName);
      }
    }
    return map;
  }, [weeklyActual]);
  // 표준↔실제 변화 분류(별칭 학습으로 어휘 표기차 제거). 공통과목(isFixed)만 대상 —
  // 선택과목은 학생별 매핑이라 NEIS 반 단위와 정합이 안 맞아 제외한다.
  const overlayByCell = useMemo(() => {
    const std = slots
      .filter((s) => s.isFixed)
      .map((s) => ({ weekday: s.weekday, period: s.period, subject: s.subjectName }));
    const act = weeklyActual.map((a) => ({
      weekday: a.weekday,
      period: a.period,
      subject: a.subjectName,
    }));
    // 별칭은 누적 주간 집계(subjectAliasPairs)로 학습 — 이번 주만으로 학습하지 않는다.
    const alias = buildAliasMapFromPairs(subjectAliasPairs);
    return classifyWeeklyOverlay(std, act, alias);
  }, [slots, weeklyActual, subjectAliasPairs]);
  // 방학 요일(이번 주 NEIS 실제가 전부 방학인 요일). 그 요일은 시간표 칸 대신 방학 안내.
  const vacationDays = useMemo(
    () =>
      vacationWeekdays(
        weeklyActual.map((a) => ({
          weekday: a.weekday,
          period: a.period,
          subject: a.subjectName,
        })),
      ),
    [weeklyActual],
  );
  // 방학 요일의 표시 라벨(그 요일 첫 '방학' 슬롯 원문 — "여름방학" 등). 빈 subjectName 은
  // 건너뛰어 빈 라벨을 피한다(dto 는 빈 문자열을 허용 — 첫 슬롯이 비면 라벨이 사라진다).
  const vacationLabelByDay = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of weeklyActual) {
      const v = a.subjectName.trim();
      if (v && vacationDays.has(a.weekday) && !m.has(a.weekday)) {
        m.set(a.weekday, v);
      }
    }
    return m;
  }, [weeklyActual, vacationDays]);
  // 과목별 안정 색(주간 전체 등장순 — 홈 탭 오늘 요약과 동일 맵, 오늘의학교 팔레트).
  const subjectColors = useMemo(() => subjectColorsForTimetable(slots), [slots]);
  // 오늘 요일(KST 날짜 경계). 시간표에는 월~금 데이터만 있으므로 토·일이면 월요일 기본 선택.
  const todayWeekday = useMemo(() => kstWeekday(), []);
  const badge = useMemo(
    () => neisFreshnessBadge(weeklyActualSyncedAt, kstToday()),
    [weeklyActualSyncedAt],
  );
  const [weekday, setWeekday] = useState<number>(() =>
    todayWeekday >= 6 ? 1 : todayWeekday,
  );

  return (
    <Card title="시간표">
      {badge && (
        <p
          className={`-mt-1 mb-2 text-xs ${badge.stale ? "text-amber-600" : "text-neutral-400"}`}
        >
          {badge.label} · 이번 주 실제 반영
        </p>
      )}
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
          {vacationDays.has(weekday) ? (
            <div className="mt-2 flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-xl border border-amber-200 bg-amber-50 py-8 text-amber-700">
              <span className="text-3xl">🏖️</span>
              <span className="text-base font-normal">
                {vacationLabelByDay.get(weekday) ?? "방학"}
              </span>
              <span className="text-xs text-amber-600/80">수업이 없습니다</span>
            </div>
          ) : (
          <div className="mt-2 space-y-1.5">
            {TT_PERIODS.map((p) => {
              const slot = byCell.get(`${weekday}::${p}`);
              const colorKey = slot ? slotColorKey(slot) : null;
              // 표준에 없는 칸이라도 NEIS 실제가 있으면 보여준다 — 방학·행사처럼 '표준이
              // 사라진' 정보가 학생에게 가장 중요한데, 표준 칸 기준으로만 그리면 영영
              // 안 보인다(담임반 표준이 조각나 있을 때도 이 경로가 화면을 채운다).
              const actualOnly = !slot ? actualByCell.get(`${weekday}::${p}`) : undefined;
              return (
                <div key={p} className="flex min-h-[44px] items-center gap-3">
                  <span className="w-6 shrink-0 text-sm text-neutral-400">{p}</span>
                  <div className="min-w-0 flex-1">
                    {slot ? (
                      <TimetableCell
                        token={token}
                        slot={slot}
                        color={colorKey ? subjectColors.get(colorKey) : undefined}
                        actual={actualByCell.get(`${weekday}::${p}`)}
                        overlay={overlayByCell.get(`${weekday}::${p}`)}
                      />
                    ) : actualOnly ? (
                      // 특별활동·행사만 ★ 앰버로 강조하고, 정규과목은 중립 표기 —
                      // 마커가 아무데나 붙으면 신호 가치가 사라진다(overlayMarker 체계 일관).
                      isSpecialTimetableEntry(actualOnly) ? (
                        <div className="flex min-h-[44px] items-center truncate rounded border border-amber-300 bg-amber-50 px-2 text-sm text-amber-800">
                          <span className="truncate">{actualOnly} ★</span>
                        </div>
                      ) : (
                        <div className="flex min-h-[44px] items-center truncate rounded border border-hairline px-2 text-sm text-neutral-700">
                          <span className="truncate">{actualOnly}</span>
                        </div>
                      )
                    ) : (
                      <span className="px-2 text-sm text-neutral-300">-</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </>
      )}
    </Card>
  );
}

/** 변화 종류별 마커: 교환은 ⇄, 없어진 교시는 ✕, 특별활동·대체는 ★. */
function overlayMarker(kind: OverlayResult["kind"]): string {
  if (kind === "swap") return "⇄";
  if (kind === "none") return "✕";
  return "★";
}

function TimetableCell({
  token,
  slot,
  color,
  actual,
  overlay,
}: {
  token: string;
  slot: PublicPagePayload["timetable"][number];
  /** 과목별 안정 색(subjectColorsForTimetable). 미지정 선택과목은 undefined. */
  color?: string;
  /** NEIS 이번 주 실제 과목 원본(선택과목 특별활동 폴백 판정용). */
  actual?: string;
  /** 공통과목 표준↔실제 변화 분류(classifyWeeklyOverlay). 변화 없으면 undefined. */
  overlay?: OverlayResult;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(slot.electiveMapped ?? "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (slot.isFixed) {
    // 공통과목: 과목색 칩 행(오늘의학교 오늘 시간표와 동일 팔레트).
    // 표준과 다른 변화(특별활동·교시교환·대체)면 실제를 앞세우고 앰버 강조.
    // 어휘 표기차(일어↔일본어 등)는 별칭 학습으로 걸러져 강조되지 않는다(overlay=undefined).
    if (overlay) {
      return (
        <div className="min-h-[44px] truncate rounded border border-amber-300 bg-amber-50 px-2 py-1 text-sm text-amber-800">
          <span className="truncate">
            {overlay.kind === "none" ? "수업 없음" : overlay.actual}{" "}
            {overlayMarker(overlay.kind)}
          </span>
          <span className="ml-1 text-xs text-amber-600/80">표준 {slot.subjectName}</span>
        </div>
      );
    }
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
  // 선택과목은 분류기 제외 — NEIS 실제가 '특별활동/행사'일 때만 강조(반 단위 특별항목).
  const label = slot.electiveMapped ?? "선택과목";
  const differs =
    actual != null &&
    actual.trim().length > 0 &&
    isSpecialTimetableEntry(actual) &&
    actual !== (slot.electiveMapped ?? "");

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
          differs
            ? "border-amber-300 bg-amber-50 text-amber-800"
            : slot.electiveMapped && color
              ? color
              : "border-dashed border-blue-300 text-blue-600 underline decoration-dotted"
        }`}
        title="선택과목 지정"
      >
        {label}
        {differs && (
          <span className="ml-1 text-xs text-amber-600">· 실제 {actual} ★</span>
        )}
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
