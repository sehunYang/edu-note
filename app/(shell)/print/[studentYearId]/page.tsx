import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  getStudentProfileById,
  getStudentReport,
  getStudentRecordCounts,
  listSectionsForStudent,
  listAttendanceByStudent,
} from "@/lib/db/queries";
import { activeSchoolYear, activeSemester } from "@/lib/domain/school-year";
import { Badge, TrendBadge, RankBadge } from "../badges";

export const metadata = { title: "학생 점검" };

export const dynamic = "force-dynamic";

const ATTENDANCE_KIND_LABELS: Record<string, string> = {
  late: "지각",
  early_leave: "조퇴",
  absent_period: "결과",
  absent: "결석",
};

/**
 * 인쇄실 상세 점검(계획 AD-4 Option C — 셸 안 화면 전용, R8.4). 교사가 학생 1명의
 * 성적(수강 분반별 4플래그)·출결·기록 현황을 종합해 보고 `getStudentReport()`를
 * 재사용한다. 이 화면은 인쇄되지 않는다(배부용은 `/print/[id]/handout`, 셸 밖 별도
 * 라우트) — noteField·관찰/행특 본문은 여기서도 렌더하지 않는다(건수만).
 */
export default async function StudentInspectPage({
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
      <div>
        <p className="text-sm text-neutral-400">학생을 찾을 수 없습니다.</p>
        <Link
          href="/print"
          className="mt-4 inline-block text-sm text-neutral-500 hover:underline"
        >
          ← 인쇄실
        </Link>
      </div>
    );
  }

  const [sections, attendanceRows, recordCounts] = await Promise.all([
    listSectionsForStudent(db, ownerId, studentYearId, year, sem),
    listAttendanceByStudent(db, ownerId, studentYearId),
    getStudentRecordCounts(db, ownerId, studentYearId),
  ]);

  const reports = await Promise.all(
    sections.map((s) => getStudentReport(db, ownerId, studentYearId, s.sectionId, year, sem)),
  );

  const attendanceCounts = new Map<string, number>();
  for (const r of attendanceRows) {
    attendanceCounts.set(r.kind, (attendanceCounts.get(r.kind) ?? 0) + 1);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-normal text-neutral-800">
            {profile.grade}학년 {profile.classNo}반 {profile.name} ({profile.sid})
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            {year}학년도 {sem}학기 · 성적·출결·기록 종합 점검
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href={`/print/${studentYearId}/handout`}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            배부용 인쇄 →
          </Link>
          <Link href="/print" className="text-sm text-neutral-500 hover:underline">
            ← 인쇄실
          </Link>
        </div>
      </div>

      {/* 성적 — 수강 분반별. */}
      <section className="mt-6">
        <h3 className="mb-3 text-base font-normal text-neutral-700">성적 (수강 분반별)</h3>
        {sections.length === 0 ? (
          <p className="text-sm text-neutral-400">
            {year}학년도 {sem}학기에 수강 중인 분반이 없습니다.
          </p>
        ) : (
          <div className="space-y-4">
            {sections.map((s, i) => {
              const r = reports[i];
              if (!r) return null;
              return (
                <div key={s.sectionId} className="rounded-md border border-neutral-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-medium text-neutral-700">
                      {s.subjectName} {s.label}
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      <TrendBadge trend={r.flags.jipilTrend} />
                      {r.flags.observationShortage && (
                        <Badge label="⚠ 관찰 부족" cls="bg-amber-100 text-amber-700" />
                      )}
                      {r.flags.performanceMissing.length > 0 && (
                        <Badge label="⚠ 수행 미입력" cls="bg-amber-100 text-amber-700" />
                      )}
                      <RankBadge rank={r.flags.sectionRank} />
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-neutral-500">중간</dt>
                      <dd className="tabular-nums">
                        {r.grades.jipilMidConverted?.toFixed(1) ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">기말</dt>
                      <dd className="tabular-nums">
                        {r.grades.jipilFinalConverted?.toFixed(1) ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">수행 합계</dt>
                      <dd className="tabular-nums">{r.grades.performanceTotal.toFixed(1)}</dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">총점</dt>
                      <dd className="tabular-nums">{r.grades.total.toFixed(1)}</dd>
                    </div>
                  </dl>
                  {r.grades.performanceItems.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
                      {r.grades.performanceItems.map((it) => (
                        <li
                          key={it.name}
                          className={`rounded-full px-2 py-0.5 ${
                            it.hasScore
                              ? "bg-neutral-100 text-neutral-600"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {it.name} {it.hasScore ? "입력됨" : "미입력"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 출결 요약 — kind 별 건수만(사유·메모는 여기서도 미노출). */}
      <section className="mt-6">
        <h3 className="mb-3 text-base font-normal text-neutral-700">출결 요약</h3>
        {attendanceRows.length === 0 ? (
          <p className="text-sm text-neutral-400">출결 기록이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2 text-sm">
            {Object.entries(ATTENDANCE_KIND_LABELS).map(([kind, label]) => (
              <span
                key={kind}
                className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600"
              >
                {label} {attendanceCounts.get(kind) ?? 0}건
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 기록 현황 — 건수만(본문·상담·자유코멘트는 Non-Goal, 미노출). */}
      <section className="mt-6">
        <h3 className="mb-3 text-base font-normal text-neutral-700">기록 현황</h3>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600">
            관찰 {recordCounts.observationCount}건
          </span>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600">
            행특 {recordCounts.behaviorCount}건
          </span>
        </div>
      </section>
    </div>
  );
}
