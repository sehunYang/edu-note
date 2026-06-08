import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { listStudents, listAttendanceByDate, listFieldTrips } from "@/lib/db/queries";
import {
  recordAttendanceAction,
  toggleReportSubmittedAction,
  deleteAttendanceAction,
  addFieldTripAction,
  toggleFieldTripAction,
  recomputeEscalationAction,
} from "./actions";

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

/**
 * 출결 화면 (계획 §4 F, AC-F). 날짜별 사유×성격 기록 + 신고서 필요 자동 판정 +
 * 제출 마킹. 결석=항상 신고서, 인정사유·'생리통' 비고 시 신고서 필요.
 */
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = new Date().getFullYear();
  const { date: dateParam } = await searchParams;
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayStr();

  const [students, records, fieldTrips] = await Promise.all([
    listStudents(db, ownerId, year),
    listAttendanceByDate(db, ownerId, date),
    listFieldTrips(db, ownerId),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">출결 관리</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>

      <form method="get" className="mt-4 flex items-center gap-2 text-sm">
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
          <form action={recordAttendanceAction} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="date" value={date} />
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
            <select name="kind" className="rounded border border-neutral-300 px-2 py-1 text-sm">
              <option value="late">지각</option>
              <option value="early_leave">조퇴</option>
              <option value="absent_period">결과</option>
              <option value="absent">결석</option>
            </select>
            <select name="reason" className="rounded border border-neutral-300 px-2 py-1 text-sm">
              <option value="illness">질병</option>
              <option value="accepted">인정</option>
              <option value="unaccepted">미인정</option>
              <option value="etc">기타</option>
            </select>
            <input
              name="noteField"
              placeholder="비고(예: 생리통)"
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
            />
            <button className="rounded bg-neutral-800 px-3 py-1 text-sm text-white hover:bg-neutral-700">
              기록
            </button>
          </form>
        )}
        <p className="mt-2 text-xs text-neutral-400">
          결석은 항상, 인정 사유·비고 ‘생리통’은 신고서가 필요합니다(자동 판정).
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-700">
          {date} 출결 {records.length}건
        </h2>
        {records.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">이 날짜의 출결 기록이 없습니다.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-neutral-400">
              <tr>
                <th className="py-1 font-medium">학생</th>
                <th className="py-1 font-medium">성격</th>
                <th className="py-1 font-medium">사유</th>
                <th className="py-1 font-medium">신고서</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-t border-neutral-100">
                  <td className="py-2">
                    {r.sid} {r.name}
                  </td>
                  <td className="py-2">{KIND_LABEL[r.kind]}</td>
                  <td className="py-2">
                    {REASON_LABEL[r.reason]}
                    {r.noteField ? (
                      <span className="ml-1 text-xs text-neutral-400">({r.noteField})</span>
                    ) : null}
                  </td>
                  <td className="py-2">
                    {r.reportRequired ? (
                      <form action={toggleReportSubmittedAction} className="inline">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="submitted" value={(!r.reportSubmitted).toString()} />
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
                      <span className="text-xs text-neutral-300">불필요</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <form action={deleteAttendanceAction} className="inline">
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-xs text-red-500 hover:underline">삭제</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

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
          체험일 기준 수업일 5일 규칙으로 출결 신고서와 동일하게 티어가 오릅니다.
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
