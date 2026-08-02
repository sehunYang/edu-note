"use client";
import { useState, useTransition } from "react";
import { recordAttendanceAction, addAbsenceRangeAction } from "./actions";
import { Button } from "@/app/ui/button";
import { SaveStatus, useSaveStatus } from "@/app/ui/save-status";

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
  const [saved, markSaved] = useSaveStatus();

  const KIND_TEXT: Record<typeof kind, string> = {
    late: "지각",
    early_leave: "조퇴",
    absent_period: "결과",
    absent: "결석",
  };
  const studentLabel = (id: string) => {
    const s = students.find((x) => x.id === id);
    return s ? `${s.sid} ${s.name}` : "학생";
  };

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
      const label = studentLabel(studentId);
      startTransition(async () => {
        await addAbsenceRangeAction(fd);
        markSaved(`${label} ${date}~${rangeEnd} 결석 기록됨`);
        setNoteField("");
        setRangeEnd("");
        setStudentId("");
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
    const label = studentLabel(studentId);
    startTransition(async () => {
      await recordAttendanceAction(fd);
      markSaved(`${label} ${KIND_TEXT[kind]} 기록됨`);
      setNoteField("");
      setSelected([]);
      setPivotPeriod(0);
      // 학생 선택도 초기화 — 남아 있으면 다음 학생으로 바꾸지 않은 채 재클릭해
      // 같은 학생에게 중복 기록이 남는다(실측에서 확인된 오기록 경로).
      setStudentId("");
    });
  }

  const showPivot = kind === "late" || kind === "early_leave";
  const showMulti = kind === "absent_period";

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="학생"
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
        {/* 목록 표의 열 이름과 맞춘다: 종류=지각/조퇴/결과/결석, 사유=질병/인정/… */}
        <select aria-label="출결 종류"
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
        <select aria-label="출결 사유"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="illness">질병</option>
          <option value="accepted">인정</option>
          <option value="unaccepted">미인정</option>
          <option value="etc">기타</option>
        </select>
        <input aria-label="비고(예: 생리통)"
          value={noteField}
          onChange={(e) => setNoteField(e.target.value)}
          placeholder="비고(예: 생리통)"
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <Button
          disabled={pending}
          className="px-3 py-1 text-sm"
        >
          {pending ? "기록 중…" : "기록"}
        </Button>
        <SaveStatus message={saved} />
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
          <input aria-label="결석 종료일"
            type="date"
            value={rangeEnd}
            min={date}
            onChange={(e) => setRangeEnd(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          />
        </fieldset>
      )}
    </form>
  );
}
