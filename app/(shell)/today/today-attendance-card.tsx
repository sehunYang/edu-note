import Link from "next/link";
import {
  AttendancePeriodClient,
  type HomeroomStudent,
} from "../homeroom/attendance/attendance-period-client";
import {
  ATTENDANCE_KIND_CHIP,
  ATTENDANCE_REASON_CHIP,
} from "@/lib/domain/attendance-display";
import type { AttendanceStudentRow } from "@/lib/db/queries";
import type { AttendanceKind, AttendanceReason } from "@/lib/domain/types";

/**
 * 오늘의 학교 — 담임반 출결 빠른 입력 카드. 별도 화면 이동 없이 대시보드에서
 * 학생 선택 → 종류/사유/비고 입력 → 즉시 저장한다(recordAttendanceAction 재사용).
 * 담임반 학생이 0명이면 렌더하지 않는다(요청의 "당연히 담임반만"). 상세(월별/학생
 * 검색/미제출/교외체험)는 하단 링크로 출결 관리실에 연결한다.
 *
 * 입력 폼은 룸의 검증된 `AttendancePeriodClient`를 그대로 재사용해 교시/기간 처리와
 * 신고서 파생 의미를 룸과 100% 동일하게 유지한다(폼 재작성 금지).
 */

const KIND_LABEL: Record<AttendanceKind, string> = {
  late: "지각",
  early_leave: "조퇴",
  absent_period: "결과",
  absent: "결석",
};

const REASON_LABEL: Record<AttendanceReason, string> = {
  illness: "질병",
  accepted: "인정",
  unaccepted: "미인정",
  etc: "기타",
};

export function TodayAttendanceCard({
  students,
  date,
  records,
}: {
  students: HomeroomStudent[];
  date: string;
  records: AttendanceStudentRow[];
}) {
  // 담임반 미보유(홈룸 학생 0명)면 카드 자체를 렌더하지 않는다.
  if (students.length === 0) return null;

  return (
    <section className="rounded-lg border border-neutral-200 p-5 md:col-span-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-normal text-neutral-700">오늘 출결 입력</h2>
        <span className="text-xs text-neutral-400">{date}</span>
      </div>

      <AttendancePeriodClient students={students} date={date} />

      <p className="mt-2 text-xs text-neutral-400">
        질병결석·비고 ‘생리통’은 신고서가 필요합니다(자동 판정).
      </p>

      <div className="mt-4 border-t border-neutral-100 pt-3">
        <h3 className="text-xs font-normal text-neutral-500">
          오늘 기록 {records.length}건
        </h3>
        {records.length === 0 ? (
          <p className="mt-2 text-xs text-neutral-400">
            오늘 입력된 출결이 없습니다.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {records.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="text-neutral-700">
                  {r.sid} {r.name}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${ATTENDANCE_KIND_CHIP[r.kind]}`}
                >
                  {KIND_LABEL[r.kind]}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${ATTENDANCE_REASON_CHIP[r.reason]}`}
                >
                  {REASON_LABEL[r.reason]}
                </span>
                {r.noteField && (
                  <span className="text-xs text-neutral-500">{r.noteField}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 text-xs">
        <Link
          href="/homeroom/attendance"
          className="text-neutral-500 underline"
        >
          출결 관리 전체 →
        </Link>
      </div>
    </section>
  );
}
