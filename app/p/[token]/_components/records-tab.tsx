"use client";
import { useState, useTransition } from "react";
import type {
  PublicAttendance2D,
  PublicAttendanceRecord,
  PublicCounselSlot,
} from "@/lib/public";
import {
  reserveCounselAction,
  requestCounselCancelAction,
} from "../actions";
import { Button } from "@/app/ui/button";
import {
  Card,
  KIND_ROWS,
  REASON_COLS,
  KIND_TO_RECORD_KIND,
  REASON_LABEL,
  periodsLabel,
} from "../_shared";

export function RecordsTab({
  token,
  matrix,
  records,
  counselSlots,
}: {
  token: string;
  matrix: PublicAttendance2D;
  records: PublicAttendanceRecord[];
  counselSlots: PublicCounselSlot[];
}) {
  return (
    <>
      <Attendance2DTable matrix={matrix} records={records} />
      <CounselSlots token={token} slots={counselSlots} />
    </>
  );
}

// ── 출결 2D(성격×사유) ──────────────────────────────────────────────────────
/**
 * 출결 성격별 색(오늘의학교 톤 맞춤). remap 된 hue 만 사용 — 지각 amber,
 * 조퇴 cyan, 결과 violet, 결석 red. 캘린더 event_kind 칩과는 별개 축(출결 전용).
 */
const KIND_STYLE: Record<
  keyof PublicAttendance2D,
  { dot: string; count: string; hover: string; detailBorder: string }
> = {
  late: {
    dot: "bg-amber-400",
    count: "text-amber-700",
    hover: "hover:bg-amber-50",
    detailBorder: "border-l-amber-300",
  },
  earlyLeave: {
    dot: "bg-cyan-400",
    count: "text-cyan-700",
    hover: "hover:bg-cyan-50",
    detailBorder: "border-l-cyan-300",
  },
  absentPeriod: {
    dot: "bg-violet-400",
    count: "text-violet-700",
    hover: "hover:bg-violet-50",
    detailBorder: "border-l-violet-300",
  },
  absent: {
    dot: "bg-red-400",
    count: "text-red-700",
    hover: "hover:bg-red-50",
    detailBorder: "border-l-red-300",
  },
};

function Attendance2DTable({
  matrix,
  records,
}: {
  matrix: PublicAttendance2D;
  records: PublicAttendanceRecord[];
}) {
  // 클릭한 칸(성격×사유). 0 아닌 칸만 열 수 있다.
  const [sel, setSel] = useState<{
    kind: keyof PublicAttendance2D;
    kindLabel: string;
    reason: keyof PublicAttendance2D["late"];
  } | null>(null);

  // 노출 필드는 날짜·교시·사유 카테고리뿐 — 교사 메모(note_field)는 서버부터 미포함.
  const detailRecords = sel
    ? records.filter(
        (r) => r.kind === KIND_TO_RECORD_KIND[sel.kind] && r.reason === sel.reason,
      )
    : [];

  return (
    <Card title="출결">
      <p className="mb-2 text-xs text-neutral-400">
        0이 아닌 칸을 누르면 날짜별 상세를 확인할 수 있어요.
      </p>
      <table className="w-full border-collapse text-center text-sm">
        <thead>
          <tr>
            <th className="border border-neutral-200 bg-neutral-50 px-3 py-3" />
            {REASON_COLS.map(([, label]) => (
              <th
                key={label}
                className="border border-neutral-200 bg-neutral-50 px-3 py-3 font-normal"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {KIND_ROWS.map(([kind, kindLabel]) => (
            <tr key={kind}>
              <th className="border border-neutral-200 bg-neutral-50 px-3 py-3 font-normal text-neutral-500">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${KIND_STYLE[kind].dot}`}
                  />
                  {kindLabel}
                </span>
              </th>
              {REASON_COLS.map(([reason]) => {
                const count = matrix[kind][reason];
                return (
                  <td key={reason} className="border border-neutral-200 p-0">
                    {count > 0 ? (
                      <button
                        type="button"
                        onClick={() => setSel({ kind, kindLabel, reason })}
                        className={`w-full px-3 py-3 text-sm font-normal underline decoration-dotted underline-offset-2 transition ${KIND_STYLE[kind].count} ${KIND_STYLE[kind].hover}`}
                        title={`${kindLabel}(${REASON_LABEL[reason]}) 상세 보기`}
                      >
                        {count}
                      </button>
                    ) : (
                      <span className="block px-3 py-3 text-sm text-neutral-300">
                        {count}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {/* 출결 상세: 모달 대신 표 아래 인라인 패널(.accordion 계약 — 항상 마운트,
          단일 자식 래퍼, 내부 콘텐츠만 조건부 렌더). */}
      <div className={`accordion mt-2 ${sel ? "accordion-open" : ""}`}>
        <div>
          {sel && (
            <div className="pt-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm text-neutral-800">
                  {sel.kindLabel} · {REASON_LABEL[sel.reason]}{" "}
                  <span className="text-sm text-neutral-400">
                    {detailRecords.length}회
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => setSel(null)}
                  className="inline-flex min-h-[44px] items-center text-xs text-neutral-400 hover:text-neutral-700"
                >
                  닫기
                </button>
              </div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {detailRecords.length === 0 && (
                  <li className="text-xs text-neutral-400">
                    상세 기록을 불러오지 못했습니다. 선생님께 문의해 주세요.
                  </li>
                )}
                {detailRecords.map((r, i) => (
                  <li
                    key={i}
                    className={`flex items-center justify-between rounded border border-neutral-200 border-l-2 px-3 py-2 ${KIND_STYLE[sel.kind].detailBorder}`}
                  >
                    <span className="text-neutral-700">{r.date}</span>
                    <span className="text-xs text-neutral-500">
                      {periodsLabel(r.periods) ?? sel.kindLabel}
                      {" · "}
                      {REASON_LABEL[sel.reason]}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-neutral-400">
                기록이 실제와 다르면 담임 선생님께 확인을 요청하세요.
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── 상담 신청 ───────────────────────────────────────────────────────────────
function CounselSlots({
  token,
  slots,
}: {
  token: string;
  slots: PublicCounselSlot[];
}) {
  return (
    <Card title="상담 신청">
      {slots.length === 0 ? (
        <p className="text-sm text-neutral-400">신청 가능한 상담 일정이 없습니다.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {slots.map((s) => (
            <CounselSlotRow key={s.date} token={token} slot={s} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function CounselSlotRow({
  token,
  slot,
}: {
  token: string;
  slot: PublicCounselSlot;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function reserve() {
    setErr(null);
    start(async () => {
      const res = await reserveCounselAction(token, slot.date);
      if (!res.ok) setErr(res.message);
    });
  }

  function requestCancel() {
    setErr(null);
    start(async () => {
      const res = await requestCounselCancelAction(token, slot.date);
      if (!res.ok) setErr(res.message);
    });
  }

  return (
    <li className="flex min-h-[44px] items-center justify-between gap-2 rounded border border-hairline px-3 py-2">
      <span>
        {slot.date}{" "}
        <span className="text-xs text-neutral-400">잔여 {slot.remaining}</span>
      </span>
      {slot.reserved ? (
        <span className="flex items-center gap-2">
          {err && <span role="status" className="text-xs text-red-600">{err}</span>}
          <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
            신청됨
          </span>
          {slot.cancelRequested ? (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
              취소 요청됨
            </span>
          ) : (
            <Button
              type="button"
              disabled={pending}
              onClick={requestCancel}
              className="min-h-[44px] px-4 text-xs disabled:opacity-40"
            >
              {pending ? "요청…" : "취소 요청"}
            </Button>
          )}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {err && <span role="status" className="text-xs text-red-600">{err}</span>}
          <Button
            type="button"
            disabled={pending || slot.remaining <= 0}
            onClick={reserve}
            className="min-h-[44px] px-4 text-xs disabled:opacity-40"
          >
            {pending ? "신청…" : "신청"}
          </Button>
        </span>
      )}
    </li>
  );
}
