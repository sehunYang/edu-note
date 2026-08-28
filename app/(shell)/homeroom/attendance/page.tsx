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
  getAttendanceTally,
  resolveSemesterRange,
} from "@/lib/db/queries";
import {
  activeSchoolYear,
  activeSemester,
  schoolYearRange,
} from "@/lib/domain/school-year";
import { TallyTableClient } from "./tally-table-client";
import { AttendancePeriodClient } from "./attendance-period-client";
import {
  EditableAttendanceTable,
  UnsubmittedTable,
} from "./attendance-tables-client";
import { FieldTripSection } from "./field-trip-client";
import { AttendanceDateJump } from "./date-jump-client";
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

type View =
  | "today"
  | "fieldtrip"
  | "month"
  | "student"
  | "unsubmitted"
  | "tally";
const VIEWS: { key: View; label: string }[] = [
  { key: "today", label: "오늘 입력" },
  { key: "fieldtrip", label: "교외체험학습 등록" },
  { key: "month", label: "월별" },
  { key: "student", label: "학생별 검색" },
  { key: "unsubmitted", label: "미제출" },
  { key: "tally", label: "NEIS 집계" },
];

/** 집계 기간 모드. 담임은 월 단위로 마감하므로 월이 기본이다. */
type Span = "month" | "semester" | "year";
const SPANS: { key: Span; label: string }[] = [
  { key: "month", label: "월" },
  { key: "semester", label: "학기" },
  { key: "year", label: "학년도" },
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
    span?: string;
    tallyMonth?: string;
    tallySem?: string;
  }>;
}) {
  const ownerId = await getOwnerId();
  const db = getDb();
  const now = new Date();
  const year = now.getFullYear();
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

  // ── NEIS 집계 기간 산정 ──
  // 담임은 월 단위로 출결을 마감한다 → 기본은 이번 달. 학기 경계는 여름방학
  // 시작일 기준(resolveSemesterRange)이라 8/14 하드코딩과 달리 실제 학사일정을 탄다.
  const span: Span = SPANS.some((s) => s.key === sp.span)
    ? (sp.span as Span)
    : "month";
  const tallyMonth =
    sp.tallyMonth && /^\d{4}-\d{2}$/.test(sp.tallyMonth)
      ? sp.tallyMonth
      : thisMonthStr();
  const tallySem: 1 | 2 = sp.tallySem === "1" ? 1 : sp.tallySem === "2" ? 2 : activeSemester(now);

  let tallyRange: { from: string; to: string; label: string };
  if (span === "month") {
    const [ty, tm] = tallyMonth.split("-").map(Number);
    // 말일 = 다음 달 0일 (윤년 자동 보정).
    const last = new Date(Date.UTC(ty, tm, 0)).toISOString().slice(0, 10);
    tallyRange = { from: `${tallyMonth}-01`, to: last, label: `${tallyMonth}` };
  } else if (span === "semester") {
    const r = await resolveSemesterRange(db, ownerId, activeSchoolYear(now), tallySem);
    tallyRange = { from: r.start, to: r.end, label: `${tallySem}학기` };
  } else {
    const sy = activeSchoolYear(now);
    const r = schoolYearRange(sy);
    tallyRange = { from: r.start, to: r.end, label: `${sy}학년도` };
  }

  // 담임반 학생만 (listHomeroomStudents). 항상 필요.
  const students = await listHomeroomStudents(db, ownerId, year);

  const tally =
    view === "tally"
      ? await getAttendanceTally(db, ownerId, year, tallyRange.from, tallyRange.to)
      : null;

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
          <AttendanceDateJump date={date} />

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
            <EditableAttendanceTable rows={todayRecords} linkStudent />
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
          <EditableAttendanceTable rows={monthRows} withDate linkStudent linkDate />
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
              <EditableAttendanceTable rows={studentRows} withDate linkDate />
            </>
          ) : (
            <p className="mt-4 text-sm text-neutral-400">학생을 선택하세요.</p>
          )}
        </section>
      )}

      {view === "tally" && tally && (
        <section className="mt-6">
          {/* 기간 선택 — 월(기본)/학기/학년도. 월 마감이 최빈이라 월 입력을
              항상 노출하고, 다른 모드에서는 해당 컨트롤만 바꿔 단다. */}
          <form method="get" className="flex flex-wrap items-center gap-2 text-sm">
            <input type="hidden" name="view" value="tally" />
            <div
              className="inline-flex rounded-md border border-neutral-300 p-0.5"
              role="group"
              aria-label="집계 기간 단위"
            >
              {SPANS.map((s) => (
                <Link
                  key={s.key}
                  href={`/homeroom/attendance?view=tally&span=${s.key}${
                    s.key === "month" ? `&tallyMonth=${tallyMonth}` : ""
                  }${s.key === "semester" ? `&tallySem=${tallySem}` : ""}`}
                  aria-current={span === s.key ? "true" : undefined}
                  className={`inline-flex min-h-11 items-center rounded px-3 text-sm md:min-h-0 md:py-1 ${
                    span === s.key
                      ? "border border-white/25 bg-transparent text-white"
                      : "text-neutral-600 hover:bg-white/10"
                  }`}
                >
                  {s.label}
                </Link>
              ))}
            </div>

            {span === "month" && (
              <>
                <input type="hidden" name="span" value="month" />
                <label className="text-neutral-500" htmlFor="tallyMonth">
                  월
                </label>
                <input
                  id="tallyMonth"
                  type="month"
                  name="tallyMonth"
                  defaultValue={tallyMonth}
                  className="rounded border border-neutral-300 px-2 py-1"
                />
                <Button className="px-2 py-1 text-xs">조회</Button>
              </>
            )}

            {span === "semester" && (
              <>
                <input type="hidden" name="span" value="semester" />
                <label className="text-neutral-500" htmlFor="tallySem">
                  학기
                </label>
                <select
                  id="tallySem"
                  name="tallySem"
                  defaultValue={String(tallySem)}
                  className="rounded border border-neutral-300 px-2 py-1 text-sm"
                >
                  <option value="1">1학기</option>
                  <option value="2">2학기</option>
                </select>
                <Button className="px-2 py-1 text-xs">조회</Button>
              </>
            )}
          </form>

          <TallyTableClient
            rows={tally.rows}
            schoolDays={tally.schoolDays}
            from={tally.from}
            to={tally.to}
            periodLabel={tallyRange.label}
          />
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
