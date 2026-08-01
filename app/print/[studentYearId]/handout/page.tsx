import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  getStudentProfileById,
  getStudentReport,
  getPerformanceDetail,
  listSectionsForStudent,
  listAttendanceByStudent,
  getSectionGradeAnalysis,
} from "@/lib/db/queries";
import { activeSchoolYear, activeSemester } from "@/lib/domain/school-year";
import type { JipilTrend } from "@/lib/domain/student-report";
import { PrintButton } from "../../print-button";

export const metadata = { title: "학생 배부물" };

export const dynamic = "force-dynamic";

const ATTENDANCE_KIND_LABELS: Record<string, string> = {
  late: "지각",
  early_leave: "조퇴",
  absent_period: "결과",
  absent: "결석",
};

const ATTENDANCE_REASON_LABELS: Record<string, string> = {
  illness: "질병",
  accepted: "인정",
  unaccepted: "미인정",
  etc: "기타",
};

const TREND_LABELS: Record<Exclude<JipilTrend, null>, string> = {
  up: "상승",
  down: "하락",
  flat: "동일",
};

/**
 * 배부용 인쇄물(계획 AD-4 Option C — 셸 밖, R8.5). 지필(중간/기말 환산+추이+분반 평균
 * 대비 위치)·수행(항목별 점수/만점·미입력)·출결 요약(kind×reason 카테고리 집계)만
 * 포함한다. **관찰/행특/상담/교사 자유 코멘트·noteField 는 어떤 경로로도 조회하지
 * 않는다**(AC-P3, Constraints "배부용 인쇄물 내용 경계"). 표 전용(recharts 미사용,
 * 인쇄 흑백 판독성 확정 채택). `PrintButton` 재사용, 화면 컨트롤은 `print:hidden`.
 */
export default async function StudentHandoutPage({
  params,
}: {
  params: Promise<{ studentYearId: string }>;
}) {
  const { studentYearId } = await params;
  const ownerId = await getOwnerId();
  const db = getDb();
  const now = new Date();
  const year = activeSchoolYear(now);
  const sem = activeSemester(now);

  const profile = await getStudentProfileById(db, ownerId, studentYearId);
  if (!profile) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-neutral-400">학생을 찾을 수 없습니다.</p>
        <Link
          href="/print"
          className="mt-4 inline-block text-sm text-neutral-500 hover:underline print:hidden"
        >
          ← 인쇄실
        </Link>
      </main>
    );
  }

  const [sections, attendanceRows] = await Promise.all([
    listSectionsForStudent(db, ownerId, studentYearId, year, sem),
    listAttendanceByStudent(db, ownerId, studentYearId),
  ]);

  const sectionDetails = await Promise.all(
    sections.map(async (s) => {
      const [report, analysis, performance] = await Promise.all([
        getStudentReport(db, ownerId, studentYearId, s.sectionId, year, sem),
        getSectionGradeAnalysis(db, ownerId, s.sectionId),
        getPerformanceDetail(db, ownerId, studentYearId, s.sectionId),
      ]);
      const cohortAvg =
        analysis && analysis.students.length > 0
          ? analysis.students.reduce((sum, st) => sum + st.total, 0) / analysis.students.length
          : null;
      return { section: s, report, cohortAvg, performance };
    }),
  );

  // 출결 요약 — kind × reason 카테고리 집계만(사유·메모 텍스트는 미포함).
  const attendanceGrid = new Map<string, Map<string, number>>();
  for (const r of attendanceRows) {
    const byReason = attendanceGrid.get(r.kind) ?? new Map<string, number>();
    byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1);
    attendanceGrid.set(r.kind, byReason);
  }
  const attendanceKindsPresent = Object.keys(ATTENDANCE_KIND_LABELS).filter(
    (kind) => (attendanceGrid.get(kind)?.size ?? 0) > 0,
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-normal tracking-tight">배부용 인쇄물</h1>
        <div className="flex items-center gap-4">
          <PrintButton />
          <Link href="/print" className="text-sm text-neutral-500 hover:underline">
            ← 인쇄실
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <h2 className="text-lg font-normal">
          {profile.grade}학년 {profile.classNo}반 {profile.sid} {profile.name}
        </h2>
        <p className="text-xs text-neutral-400">
          {year}학년도 {sem}학기
        </p>
      </div>

      <section className="mt-6">
        <h3 className="mb-2 text-base font-normal">지필·수행 성적</h3>
        {sectionDetails.length === 0 ? (
          <p className="text-sm text-neutral-400">
            {year}학년도 {sem}학기에 수강 중인 분반이 없습니다.
          </p>
        ) : (
          <div className="space-y-6">
            {sectionDetails.map(({ section, report, cohortAvg, performance }) => {
              if (!report) return null;
              return (
                <div key={section.sectionId}>
                  <h4 className="text-sm font-medium">
                    {section.subjectName} {section.label}
                  </h4>
                  <table className="mt-2 w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b-2 border-neutral-300 text-left">
                        <th className="py-1 pr-3 font-normal">중간</th>
                        <th className="py-1 pr-3 font-normal">기말</th>
                        <th className="py-1 pr-3 font-normal">추이</th>
                        <th className="py-1 pr-3 font-normal">분반 평균 대비</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-neutral-200">
                        <td className="py-1 pr-3 tabular-nums">
                          {report.grades.jipilMidConverted?.toFixed(1) ?? "—"}
                        </td>
                        <td className="py-1 pr-3 tabular-nums">
                          {report.grades.jipilFinalConverted?.toFixed(1) ?? "—"}
                        </td>
                        <td className="py-1 pr-3">
                          {report.flags.jipilTrend ? TREND_LABELS[report.flags.jipilTrend] : "—"}
                        </td>
                        <td className="py-1 pr-3">
                          {cohortAvg !== null
                            ? `분반 평균 ${cohortAvg.toFixed(1)}점, 본인 ${report.grades.total.toFixed(1)}점`
                            : "—"}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {performance.length > 0 && (
                    <table className="mt-2 w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b-2 border-neutral-300 text-left">
                          <th className="py-1 pr-3 font-normal">수행 항목</th>
                          <th className="py-1 pr-3 font-normal">점수</th>
                          <th className="py-1 pr-3 font-normal">배점</th>
                          <th className="py-1 pr-3 font-normal">비고</th>
                        </tr>
                      </thead>
                      <tbody>
                        {performance.map((p) => (
                          <tr key={p.name} className="border-b border-neutral-200">
                            <td className="py-1 pr-3">{p.name}</td>
                            <td className="py-1 pr-3 tabular-nums">
                              {p.score !== null ? p.score.toFixed(1) : "—"}
                            </td>
                            <td className="py-1 pr-3 tabular-nums">
                              {p.weight !== null ? p.weight.toFixed(1) : "—"}
                            </td>
                            <td className="py-1 pr-3">{p.score === null ? "미입력" : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h3 className="mb-2 text-base font-normal">출결 요약</h3>
        {attendanceKindsPresent.length === 0 ? (
          <p className="text-sm text-neutral-400">출결 기록이 없습니다.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-neutral-300 text-left">
                <th className="py-1 pr-3 font-normal">구분</th>
                <th className="py-1 pr-3 font-normal">질병</th>
                <th className="py-1 pr-3 font-normal">인정</th>
                <th className="py-1 pr-3 font-normal">미인정</th>
                <th className="py-1 pr-3 font-normal">기타</th>
              </tr>
            </thead>
            <tbody>
              {attendanceKindsPresent.map((kind) => {
                const byReason = attendanceGrid.get(kind) ?? new Map<string, number>();
                return (
                  <tr key={kind} className="border-b border-neutral-200">
                    <td className="py-1 pr-3">{ATTENDANCE_KIND_LABELS[kind]}</td>
                    {Object.keys(ATTENDANCE_REASON_LABELS).map((reason) => (
                      <td key={reason} className="py-1 pr-3 tabular-nums">
                        {byReason.get(reason) ?? 0}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
