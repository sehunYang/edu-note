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
import { AttendancePeriodClient } from "./attendance-period-client";
import {
  EditableAttendanceTable,
  UnsubmittedTable,
} from "./attendance-tables-client";
import { FieldTripSection } from "./field-trip-client";

export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function thisMonthStr(): string {
  return todayStr().slice(0, 7);
}

type View = "today" | "fieldtrip" | "month" | "student" | "unsubmitted";
const VIEWS: { key: View; label: string }[] = [
  { key: "today", label: "오늘 입력" },
  { key: "fieldtrip", label: "교외체험학습 등록" },
  { key: "month", label: "월별" },
  { key: "student", label: "학생별 검색" },
  { key: "unsubmitted", label: "미제출" },
];

/**
 * 출결 화면 (QC v4 US-4, AC-4.1~4.7). 날짜별 사유×성격 기록 + 신고서 필요
 * 자동 판정(질병결석·'생리통') + 제출 마킹 + 기록 수정 + 기간 입력.
 * 교외체험학습 등록은 별도 탭(오늘 입력 다음)으로 분리(전탭 하단 중복 섹션 제거).
 * 미제출 탭은 출결 신고서·교외체험 사후보고서 두 소스를 머지해 노출한다.
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

  // 뷰별 데이터(교외체험 등록도 별도 탭이므로 해당 탭에서만 로드).
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
      view === "fieldtrip" ? listFieldTrips(db, ownerId) : Promise.resolve([]),
    ]);
  // 담임반 명단으로 오늘 뷰도 필터(공유 쿼리는 owner 전체 반환).
  const studentIdSet = new Set(students.map((s) => s.id));
  const todayRecords = records.filter((r) => studentIdSet.has(r.studentYearId));

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-800">출결 관리</h2>

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
              질병결석·비고 ‘생리통’은 신고서가 필요합니다(자동 판정).
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold text-neutral-700">
              {date} 출결 {todayRecords.length}건
            </h2>
            <EditableAttendanceTable rows={todayRecords} />
          </section>
        </>
      )}

      {view === "fieldtrip" && (
        <section className="mt-6 rounded-lg border border-neutral-200 p-5">
          <h2 className="text-sm font-semibold text-neutral-700">교외체험학습 사후보고서</h2>
          <p className="mt-1 text-xs text-neutral-400">
            기간(시작~종료, 종료 생략=당일) 입력 시 수업일마다 인정결석이 자동 생성됩니다.
            체험 종료일 기준 수업일 마감으로 미제출 시 티어가 오릅니다.
          </p>
          {students.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-400">
              먼저{" "}
              <Link href="/students" className="underline">
                학생 명단
              </Link>
              을 임포트하세요.
            </p>
          ) : (
            <FieldTripSection students={students} trips={fieldTrips} />
          )}
        </section>
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
          <EditableAttendanceTable rows={monthRows} withDate />
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
              <EditableAttendanceTable rows={studentRows} withDate />
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
          <UnsubmittedTable rows={unsubmitted} />
        </section>
      )}
    </div>
  );
}
