"use client";
import { useState, useTransition } from "react";
import { recordAttendanceAction, addAbsenceRangeAction } from "./actions";
import { Button } from "@/app/ui/button";

/**
 * 출결 입력 클라이언트 (QC v3 Part B, AC-7.x). 교시 체크 UI.
 * - 교시 목록 = [조회(0), 1..N]. N 기본값 7(컴시간 기반 일별 교시 수는 US-B13에서 주입).
 * - 지각/조퇴 = 단일 기점(pivot) 라디오.
 * - 결과 = 다중 체크박스(비연속 허용).
 * - 결석 = 하루 전체(교시 입력 없음).
 */
export interface HomeroomStudent {
  id: string;
  sid: string;
  name: string;
}

// 조회=0, 이후 1..7교시. AC-7.2의 컴시간 일별 교시 수는 US-B13에서 연동.
const PERIOD_COUNT = 7;
const PERIODS = Array.from({ length: PERIOD_COUNT + 1 }, (_, i) => i); // [0..7]

function periodLabel(p: number): string {
  return p === 0 ? "조회" : `${p}교시`;
}

export function AttendancePeriodClient({
  students,
  date,
}: {
  students: HomeroomStudent[];
  date: string;
}) {
  const [studentId, setStudentId] = useState("");
  const [kind, setKind] = useState<
    "late" | "early_leave" | "absent_period" | "absent"
  >("late");
  const [reason, setReason] = useState("illness");
  const [noteField, setNoteField] = useState("");
  const [pivotPeriod, setPivotPeriod] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  // 결석 기간 종료일(선택). 비어 있으면 단일 날짜(date)만 기록.
  const [rangeEnd, setRangeEnd] = useState("");
  const [pending, startTransition] = useTransition();

  function toggle(p: number) {
    setSelected((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!studentId) return;

    // 결석 + 종료일 지정 = 기간 입력(수업일마다 자동 생성).
    if (kind === "absent" && rangeEnd && rangeEnd > date) {
      const fd = new FormData();
      fd.set("studentYearId", studentId);
      fd.set("startDate", date);
      fd.set("endDate", rangeEnd);
      fd.set("reason", reason);
      fd.set("noteField", noteField);
      startTransition(async () => {
        await addAbsenceRangeAction(fd);
        setNoteField("");
        setRangeEnd("");
      });
      return;
    }

    const fd = new FormData();
    fd.set("studentYearId", studentId);
    fd.set("date", date);
    fd.set("kind", kind);
    fd.set("reason", reason);
    fd.set("noteField", noteField);
    fd.set("pivotPeriod", String(pivotPeriod));
    for (const p of selected) fd.append("periods", String(p));
    startTransition(async () => {
      await recordAttendanceAction(fd);
      setNoteField("");
      setSelected([]);
      setPivotPeriod(0);
    });
  }

  const showPivot = kind === "late" || kind === "early_leave";
  const showMulti = kind === "absent_period";

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          required
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="">학생 선택</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.sid} {s.name}
            </option>
          ))}
        </select>
        <select
          value={kind}
          onChange={(e) =>
            setKind(e.target.value as typeof kind)
          }
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="late">지각</option>
          <option value="early_leave">조퇴</option>
          <option value="absent_period">결과</option>
          <option value="absent">결석</option>
        </select>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="illness">질병</option>
          <option value="accepted">인정</option>
          <option value="unaccepted">미인정</option>
          <option value="etc">기타</option>
        </select>
        <input
          value={noteField}
          onChange={(e) => setNoteField(e.target.value)}
          placeholder="비고(예: 생리통)"
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <Button
          disabled={pending}
          className="px-3 py-1 text-sm"
        >
          기록
        </Button>
      </div>

      {showPivot && (
        <fieldset className="flex flex-wrap items-center gap-2 text-sm">
          <legend className="mr-2 text-xs text-neutral-500">
            {kind === "late" ? "지각 기점(이 교시까지)" : "조퇴 기점(이 교시부터)"}
          </legend>
          {PERIODS.map((p) => (
            <label key={p} className="flex items-center gap-1">
              <input
                type="radio"
                name="pivot"
                checked={pivotPeriod === p}
                onChange={() => setPivotPeriod(p)}
              />
              {periodLabel(p)}
            </label>
          ))}
        </fieldset>
      )}

      {showMulti && (
        <fieldset className="flex flex-wrap items-center gap-2 text-sm">
          <legend className="mr-2 text-xs text-neutral-500">
            결과 교시(다중 선택)
          </legend>
          {PERIODS.map((p) => (
            <label key={p} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={selected.includes(p)}
                onChange={() => toggle(p)}
              />
              {periodLabel(p)}
            </label>
          ))}
        </fieldset>
      )}

      {kind === "absent" && (
        <fieldset className="flex flex-wrap items-center gap-2 text-sm">
          <legend className="mr-2 text-xs text-neutral-500">
            결석 기간(종료일 비우면 당일만)
          </legend>
          <span className="text-xs text-neutral-500">{date} ~</span>
          <input
            type="date"
            value={rangeEnd}
            min={date}
            onChange={(e) => setRangeEnd(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          />
          <span className="text-xs text-neutral-400">
            기간 지정 시 수업일마다 결석이 자동 생성됩니다.
          </span>
        </fieldset>
      )}
    </form>
  );
}
