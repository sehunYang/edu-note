import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  listHomeroomStudents,
  listAttendanceByDate,
  listAttendanceByMonth,
  searchAttendanceByStudent,
  listUnsubmittedAttendance,
  listFieldTrips,
} from "@/lib/db/queries";
import {
  toggleReportSubmittedAction,
  deleteAttendanceAction,
  addFieldTripAction,
  toggleFieldTripAction,
  recomputeEscalationAction,
} from "./actions";
import { AttendancePeriodClient } from "./attendance-period-client";
import type { AttendanceStudentRow } from "@/lib/db/queries";

const TIER_LABEL: Record<string, string> = {
  normal: "정상",
  warning: "위험",
  critical: "심각",
};
const TIER_CLASS: Record<string, string> = {
  normal: "text-neutral-400",
  warning: "text-orange-600",
  critical: "font-semibold text-red-600",
};

export const dynamic = "force-dynamic";

const REASON_LABEL: Record<string, string> = {
  illness: "질병",
  accepted: "인정",
  unaccepted: "미인정",
  etc: "기타",
};
const KIND_LABEL: Record<string, string> = {
  late: "지각",
  early_leave: "조퇴",
  absent_period: "결과",
  absent: "결석",
};

function todayStr(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function thisMonthStr(): string {
  return todayStr().slice(0, 7);
}

/** 교시 배열 → 라벨(조회=0). */
function periodsLabel(periods: number[] | null): string {
  if (!periods || periods.length === 0) return "—";
  return periods.map((p) => (p === 0 ? "조회" : `${p}교시`)).join(", ");
}

type View = "today" | "month" | "student" | "unsubmitted";
const VIEWS: { key: View; label: string }[] = [
  { key: "today", label: "오늘 입력" },
  { key: "month", label: "월별" },
  { key: "student", label: "학생별 검색" },
  { key: "unsubmitted", label: "미제출" },
];

/**
 * 출결 화면 (계획 §4 F, AC-F). 날짜별 사유×성격 기록 + 신고서 필요 자동 판정 +
 * 제출 마킹. 결석=항상 신고서, 인정사유·'생리통' 비고 시 신고서 필요.
 */
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    view?: string;
    month?: string;
    studentYearId?: string;
  }>;
}) {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = new Date().getFullYear();
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayStr();
  const view: View = VIEWS.some((v) => v.key === sp.view)
    ? (sp.view as View)
    : "today";
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : thisMonthStr();
  const selectedStudentId = sp.studentYearId ?? "";

  // 담임반 학생만 (listHomeroomStudents). 항상 필요.
  const students = await listHomeroomStudents(db, ownerId, year);

  // 뷰별 데이터 + 교외체험은 항상 로드.
  const [records, monthRows, studentRows, unsubmitted, fieldTrips] =
    await Promise.all([
      view === "today" ? listAttendanceByDate(db, ownerId, date) : Promise.resolve([]),
      view === "month" ? listAttendanceByMonth(db, ownerId, year, month) : Promise.resolve([]),
      view === "student" && selectedStudentId
        ? searchAttendanceByStudent(db, ownerId, year, selectedStudentId)
        : Promise.resolve([]),
      view === "unsubmitted"
        ? listUnsubmittedAttendance(db, ownerId, year)
        : Promise.resolve([]),
      listFieldTrips(db, ownerId),
    ]);
  // 담임반 명단으로 오늘 뷰도 필터(공유 쿼리는 owner 전체 반환).
  const studentIdSet = new Set(students.map((s) => s.id));
  const todayRecords = records.filter((r) => studentIdSet.has(r.studentYearId));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">출결 관리</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>

      <nav className="mt-4 flex flex-wrap gap-1 border-b border-neutral-200 text-sm">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`/homeroom/attendance?view=${v.key}`}
            className={`-mb-px border-b-2 px-3 py-2 ${
              view === v.key
                ? "border-neutral-800 font-semibold text-neutral-800"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {view === "today" && (
        <>
          <form method="get" className="mt-4 flex items-center gap-2 text-sm">
            <input type="hidden" name="view" value="today" />
            <label className="text-neutral-500">날짜</label>
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="rounded border border-neutral-300 px-2 py-1"
            />
            <button className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">
              이동
            </button>
          </form>

          <section className="mt-6 rounded-lg border border-neutral-200 p-5">
            <h2 className="text-sm font-semibold text-neutral-700">출결 입력 ({date})</h2>
            {students.length === 0 ? (
              <p className="mt-3 text-sm text-neutral-400">
                먼저{" "}
                <Link href="/students" className="underline">
                  학생 명단
                </Link>
                을 임포트하세요.
              </p>
            ) : (
              <AttendancePeriodClient students={students} date={date} />
            )}
            <p className="mt-2 text-xs text-neutral-400">
              결석은 항상, 인정 사유·비고 ‘생리통’은 신고서가 필요합니다(자동 판정).
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold text-neutral-700">
              {date} 출결 {todayRecords.length}건
            </h2>
            <AttendanceTable rows={todayRecords} withActions />
          </section>
        </>
      )}

      {view === "month" && (
        <section className="mt-6">
          <form method="get" className="flex items-center gap-2 text-sm">
            <input type="hidden" name="view" value="month" />
            <label className="text-neutral-500">월</label>
            <input
              type="month"
              name="month"
              defaultValue={month}
              className="rounded border border-neutral-300 px-2 py-1"
            />
            <button className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">
              조회
            </button>
          </form>
          <h2 className="mt-4 text-sm font-semibold text-neutral-700">
            {month} 출결 {monthRows.length}건
          </h2>
          <AttendanceTable rows={monthRows} withDate />
        </section>
      )}

      {view === "student" && (
        <section className="mt-6">
          <form method="get" className="flex items-center gap-2 text-sm">
            <input type="hidden" name="view" value="student" />
            <label className="text-neutral-500">학생</label>
            <select
              name="studentYearId"
              defaultValue={selectedStudentId}
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              <option value="">학생 선택</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sid} {s.name}
                </option>
              ))}
            </select>
            <button className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">
              검색
            </button>
          </form>
          {selectedStudentId ? (
            <>
              <h2 className="mt-4 text-sm font-semibold text-neutral-700">
                출결 {studentRows.length}건
              </h2>
              <AttendanceTable rows={studentRows} withDate />
            </>
          ) : (
            <p className="mt-4 text-sm text-neutral-400">학생을 선택하세요.</p>
          )}
        </section>
      )}

      {view === "unsubmitted" && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-700">
            미제출 신고서 {unsubmitted.length}건
          </h2>
          {unsubmitted.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-400">미제출 신고서가 없습니다.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-neutral-400">
                <tr>
                  <th className="py-1 font-medium">학생</th>
                  <th className="py-1 font-medium">날짜</th>
                  <th className="py-1 font-medium">성격</th>
                  <th className="py-1 font-medium">교시</th>
                  <th className="py-1 font-medium">마감</th>
                  <th className="py-1 font-medium">상태</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {unsubmitted.map((r) => (
                  <tr key={r.id} className="border-t border-neutral-100">
                    <td className="py-2">
                      {r.sid} {r.name}
                    </td>
                    <td className="py-2">{r.date}</td>
                    <td className="py-2">{KIND_LABEL[r.kind]}</td>
                    <td className="py-2 text-xs text-neutral-500">
                      {periodsLabel(r.periods)}
                    </td>
                    <td className="py-2 text-xs text-neutral-500">
                      {r.deadlineDate ?? "—"}
                      {r.remainingSchoolDays != null && (
                        <span className="ml-1 text-neutral-400">
                          ({r.remainingSchoolDays >= 0 ? `D-${r.remainingSchoolDays}` : `+${-r.remainingSchoolDays}`})
                        </span>
                      )}
                    </td>
                    <td className={`py-2 text-xs ${TIER_CLASS[r.tier]}`}>
                      {TIER_LABEL[r.tier]}
                    </td>
                    <td className="py-2 text-right">
                      <form action={toggleReportSubmittedAction} className="inline">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="submitted" value="true" />
                        <button className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                          제출 처리
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-700">교외체험학습 사후보고서</h2>
          <form action={recomputeEscalationAction}>
            <button className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">
              에스컬레이션 재계산
            </button>
          </form>
        </div>
        <p className="mt-1 text-xs text-neutral-400">
          체험일 기준 수업일 10일 마감으로 미제출 시 티어가 오릅니다.
        </p>

        {students.length > 0 && (
          <form action={addFieldTripAction} className="mt-3 flex flex-wrap items-center gap-2">
            <select
              name="studentYearId"
              required
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sid} {s.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              name="tripDate"
              required
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
            />
            <button className="rounded bg-neutral-800 px-3 py-1 text-sm text-white hover:bg-neutral-700">
              체험 추가
            </button>
          </form>
        )}

        {fieldTrips.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {fieldTrips.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 border-t border-neutral-100 py-2">
                <span>
                  {t.sid} {t.name} · 체험 {t.tripDate}
                  {t.deadlineDate && (
                    <span className="ml-2 text-xs text-neutral-400">마감 {t.deadlineDate}</span>
                  )}
                  {!t.postReportSubmitted && (
                    <span className={`ml-2 text-xs ${TIER_CLASS[t.tier]}`}>
                      {TIER_LABEL[t.tier]}
                    </span>
                  )}
                </span>
                <form action={toggleFieldTripAction} className="inline">
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="submitted" value={(!t.postReportSubmitted).toString()} />
                  <button
                    className={`rounded border px-2 py-0.5 text-xs ${
                      t.postReportSubmitted
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-amber-300 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {t.postReportSubmitted ? "제출됨" : "미제출"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/** 출결 기록 테이블(오늘=신고서 토글·삭제, 월별/학생별=날짜·교시 표시). */
function AttendanceTable({
  rows,
  withActions = false,
  withDate = false,
}: {
  rows: AttendanceStudentRow[];
  withActions?: boolean;
  withDate?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="mt-3 text-sm text-neutral-400">출결 기록이 없습니다.</p>;
  }
  return (
    <table className="mt-3 w-full text-sm">
      <thead className="text-left text-neutral-400">
        <tr>
          <th className="py-1 font-medium">학생</th>
          {withDate && <th className="py-1 font-medium">날짜</th>}
          <th className="py-1 font-medium">성격</th>
          <th className="py-1 font-medium">교시</th>
          <th className="py-1 font-medium">사유</th>
          <th className="py-1 font-medium">신고서</th>
          {withActions && <th className="py-1" />}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-neutral-100">
            <td className="py-2">
              {r.sid} {r.name}
            </td>
            {withDate && <td className="py-2">{r.date}</td>}
            <td className="py-2">{KIND_LABEL[r.kind]}</td>
            <td className="py-2 text-xs text-neutral-500">{periodsLabel(r.periods)}</td>
            <td className="py-2">
              {REASON_LABEL[r.reason]}
              {r.noteField ? (
                <span className="ml-1 text-xs text-neutral-400">({r.noteField})</span>
              ) : null}
            </td>
            <td className="py-2">
              {r.reportRequired ? (
                withActions ? (
                  <form action={toggleReportSubmittedAction} className="inline">
                    <input type="hidden" name="id" value={r.id} />
                    <input
                      type="hidden"
                      name="submitted"
                      value={(!r.reportSubmitted).toString()}
                    />
                    <button
                      className={`rounded border px-2 py-0.5 text-xs ${
                        r.reportSubmitted
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-amber-300 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {r.reportSubmitted ? "제출됨" : "미제출"}
                    </button>
                  </form>
                ) : (
                  <span
                    className={`text-xs ${
                      r.reportSubmitted ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {r.reportSubmitted ? "제출됨" : "미제출"}
                  </span>
                )
              ) : (
                <span className="text-xs text-neutral-300">불필요</span>
              )}
            </td>
            {withActions && (
              <td className="py-2 text-right">
                <form action={deleteAttendanceAction} className="inline">
                  <input type="hidden" name="id" value={r.id} />
                  <button className="text-xs text-red-500 hover:underline">삭제</button>
                </form>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
