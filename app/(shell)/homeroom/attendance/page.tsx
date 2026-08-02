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
import type { AttendanceReason } from "@/lib/domain/types";
import { Button } from "@/app/ui/button";
import { EmptyState } from "@/app/ui/empty-state";
import { UnderlineTabs } from "@/app/ui/underline-tabs";

export const metadata = { title: "출결 관리" };

export const dynamic = "force-dynamic";

/** 사유 필터(전체 + 4종). QC v6 ③ — 월별/학생별 검색에서 사유 기준 검색. */
const REASON_OPTIONS: { value: AttendanceReason; label: string }[] = [
  { value: "accepted", label: "인정" },
  { value: "illness", label: "질병" },
  { value: "unaccepted", label: "미인정" },
  { value: "etc", label: "기타" },
];
const REASON_VALUES = REASON_OPTIONS.map((o) => o.value) as string[];

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
    reason?: string;
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
  const reasonFilter: AttendanceReason | undefined =
    sp.reason && REASON_VALUES.includes(sp.reason)
      ? (sp.reason as AttendanceReason)
      : undefined;

  // 담임반 학생만 (listHomeroomStudents). 항상 필요.
  const students = await listHomeroomStudents(db, ownerId, year);

  // 뷰별 데이터(교외체험 등록도 별도 탭이므로 해당 탭에서만 로드).
  const [records, monthRows, studentRows, unsubmitted, fieldTrips] =
    await Promise.all([
      view === "today" ? listAttendanceByDate(db, ownerId, date) : Promise.resolve([]),
      view === "month" ? listAttendanceByMonth(db, ownerId, year, month, reasonFilter) : Promise.resolve([]),
      view === "student" && selectedStudentId
        ? searchAttendanceByStudent(db, ownerId, year, selectedStudentId, reasonFilter)
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
      <h2 className="text-base">출결 관리</h2>

      <UnderlineTabs
        className="mt-4"
        ariaLabel="출결 뷰"
        activeKey={view}
        items={VIEWS.map((v) => ({
          key: v.key,
          label: v.label,
          href: `/homeroom/attendance?view=${v.key}`,
        }))}
      />

      {view === "today" && (
        <>
          <form method="get" className="mt-4 flex items-center gap-2 text-sm">
            <input type="hidden" name="view" value="today" />
            <label className="text-neutral-500">날짜</label>
            <input aria-label="날짜"
              type="date"
              name="date"
              defaultValue={date}
              className="rounded border border-neutral-300 px-2 py-1"
            />
            <Button className="px-2 py-1 text-xs">
              이동
            </Button>
          </form>

          <section className="mt-6 rounded-lg border border-neutral-200 p-5">
            <h2 className="text-sm text-neutral-700">출결 입력 ({date})</h2>
            {students.length === 0 ? (
              <div className="mt-3">
                <EmptyState actions={[{ href: "/students", label: "학생 명단 임포트" }]}>
                  학생 명단이 비어 있습니다.
                </EmptyState>
              </div>
            ) : (
              <AttendancePeriodClient students={students} date={date} />
            )}
          </section>

          <section className="mt-8">
            <h2 className="text-sm text-neutral-700">
              {date} 출결 {todayRecords.length}건
            </h2>
            <EditableAttendanceTable rows={todayRecords} />
          </section>
        </>
      )}

      {view === "fieldtrip" && (
        <section className="mt-6 rounded-lg border border-neutral-200 p-5">
          <h2 className="text-sm text-neutral-700">교외체험학습 사후보고서</h2>
          {students.length === 0 ? (
            <div className="mt-3">
              <EmptyState actions={[{ href: "/students", label: "학생 명단 임포트" }]}>
                학생 명단이 비어 있습니다.
              </EmptyState>
            </div>
          ) : (
            <FieldTripSection students={students} trips={fieldTrips} />
          )}
        </section>
      )}

      {view === "month" && (
        <section className="mt-6">
          <form method="get" className="flex flex-wrap items-center gap-2 text-sm">
            <input type="hidden" name="view" value="month" />
            <label className="text-neutral-500">월</label>
            <input aria-label="월"
              type="month"
              name="month"
              defaultValue={month}
              className="rounded border border-neutral-300 px-2 py-1"
            />
            <label className="text-neutral-500">사유</label>
            <select aria-label="사유"
              name="reason"
              defaultValue={reasonFilter ?? ""}
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              <option value="">전체</option>
              {REASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Button className="px-2 py-1 text-xs">
              조회
            </Button>
          </form>
          <h2 className="mt-4 text-sm text-neutral-700">
            {month} 출결 {monthRows.length}건
          </h2>
          <EditableAttendanceTable rows={monthRows} withDate navLinks />
        </section>
      )}

      {view === "student" && (
        <section className="mt-6">
          <form method="get" className="flex flex-wrap items-center gap-2 text-sm">
            <input type="hidden" name="view" value="student" />
            <label className="text-neutral-500">학생</label>
            <select aria-label="학생"
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
            <label className="text-neutral-500">사유</label>
            <select aria-label="사유"
              name="reason"
              defaultValue={reasonFilter ?? ""}
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              <option value="">전체</option>
              {REASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Button className="px-2 py-1 text-xs">
              검색
            </Button>
          </form>
          {selectedStudentId ? (
            <>
              <h2 className="mt-4 text-sm text-neutral-700">
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
          <h2 className="text-sm text-neutral-700">
            미제출 신고서 {unsubmitted.length}건
          </h2>
          <UnsubmittedTable rows={unsubmitted} />
        </section>
      )}
    </div>
  );
}
