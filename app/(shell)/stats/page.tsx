import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { subjects } from "@/lib/db/schema/classes";
import {
  getOwnerStats,
  getAlertInputs,
  getSectionGradeAnalysis,
  getCoverageRows,
  getWorkProgress,
  listSectionsForSemester,
  type SectionGradeAnalysis,
} from "@/lib/db/queries";
import {
  attendanceSurge,
  gradeDrop,
  recordGap,
  summarizeAlerts,
  RECORD_GAP_DAYS,
  type AlertReason,
} from "@/lib/domain/stats-alerts";
import { histogram, basicStats, coverageMatrix } from "@/lib/domain/stats-insights";
import { activeSchoolYear, activeSemester } from "@/lib/domain/school-year";
import { SectionSelector } from "./section-selector";
import { AlertPanel, type AlertPanelEntry } from "./alert-panel";
import { RoomHeader } from "@/app/ui/room-header";
import { EmptyState } from "@/app/ui/empty-state";
import {
  HistogramChart,
  SectionComparisonChart,
  PerformanceFillChart,
  type SectionComparisonDatum,
} from "./ui/grade-charts";

export const metadata = { title: "통계실" };

export const dynamic = "force-dynamic";

/**
 * 통계실 (통계실·인쇄실 재구축 AD-3). 4섹션 인사이트 대시보드 순서 고정:
 * ①이상징후 경보 ②성적 분석(분반 단위, recharts) ③기록 커버리지 ④업무 진척.
 * 기존 카운트 카드 8개(getOwnerStats)는 정보 손실 없이 ④ 하단 "전체 기록 현황"으로
 * 유지한다. 임계값·집계 규칙은 전부 lib/domain/(stats-alerts, stats-insights) 순수
 * 함수에 있고, 이 페이지는 조회 결과를 그 함수들에 넣어 화면 문구로 변환만 한다.
 */
export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string; section?: string }>;
}) {
  const ownerId = await getOwnerId();
  const db = getDb();
  const now = new Date();
  const year = activeSchoolYear(now);
  const activeSem = activeSemester(now);
  const sp = await searchParams;
  const sem: 1 | 2 = sp.semester === "1" ? 1 : sp.semester === "2" ? 2 : activeSem;

  const [alertInputs, sectionOptions, coverageRows, workProgress, stats] =
    await Promise.all([
      getAlertInputs(db, ownerId, year),
      listSectionsForSemester(db, ownerId, year, sem),
      getCoverageRows(db, ownerId, year),
      getWorkProgress(db, ownerId, year, sem),
      getOwnerStats(db, ownerId, year),
    ]);

  // ── ① 이상징후 경보: 학생별 판정 + 근거 수치 문구 조립 ──
  const flaggedDropsByStudent = new Map<
    string,
    { subjectId: string; mid: number; final: number }[]
  >();
  const dropSubjectIds = new Set<string>();
  for (const row of alertInputs) {
    const fired = row.gradeDropsBySubject.filter((d) =>
      gradeDrop(d.midConverted, d.finalConverted),
    );
    if (fired.length === 0) continue;
    flaggedDropsByStudent.set(
      row.studentYearId,
      fired.map((d) => ({
        subjectId: d.subjectId,
        mid: d.midConverted as number,
        final: d.finalConverted as number,
      })),
    );
    for (const d of fired) dropSubjectIds.add(d.subjectId);
  }
  const subjectNameRows =
    dropSubjectIds.size > 0
      ? await db
          .select({ id: subjects.id, name: subjects.name })
          .from(subjects)
          .where(and(eq(subjects.ownerId, ownerId), inArray(subjects.id, [...dropSubjectIds])))
      : [];
  const subjectNameById = new Map(subjectNameRows.map((s) => [s.id, s.name]));

  const alertEntries: AlertPanelEntry[] = [];
  for (const row of alertInputs) {
    const reasons: AlertReason[] = [];
    if (attendanceSurge(row.attendanceRecent30, row.attendancePrev30)) {
      reasons.push({
        kind: "attendance",
        text: `출결 ${row.attendanceRecent30}건(직전 ${row.attendancePrev30}건)`,
      });
    }
    for (const d of flaggedDropsByStudent.get(row.studentYearId) ?? []) {
      const subjectName = subjectNameById.get(d.subjectId) ?? "과목";
      reasons.push({
        kind: "gradeDrop",
        text: `${subjectName} 중간${Math.round(d.mid)}→기말${Math.round(d.final)}(${Math.round(
          d.mid - d.final,
        )}점↓)`,
      });
    }
    if (recordGap(row.obsCount21d, row.behaviorCount21d, row.isHomeroomStudent)) {
      reasons.push({
        kind: "recordGap",
        text: row.isHomeroomStudent
          ? `관찰·행특 0건(최근 ${RECORD_GAP_DAYS}일)`
          : `관찰 0건(최근 ${RECORD_GAP_DAYS}일)`,
      });
    }
    if (reasons.length > 0) {
      alertEntries.push({
        studentYearId: row.studentYearId,
        name: row.name,
        reasons,
        isHomeroomStudent: row.isHomeroomStudent,
      });
    }
  }

  // 모집단 과반 종류 접기 + 심각도 정렬. cohort 는 해당 학년도 학생 전원
  // (alertInputs 가 studentYears 전수를 담는다).
  const alertSummary = summarizeAlerts(alertEntries, alertInputs.length);
  const homeroomById = new Map(alertEntries.map((e) => [e.studentYearId, e.isHomeroomStudent]));
  const individualAlerts: AlertPanelEntry[] = alertSummary.individual.map((e) => ({
    ...e,
    isHomeroomStudent: homeroomById.get(e.studentYearId) ?? false,
  }));

  // ── ② 성적 분석: URL ?section= (없으면 첫 분반) ──
  const requestedSectionId = sp.section?.trim() ?? "";
  const selectedSectionId = sectionOptions.some((s) => s.sectionId === requestedSectionId)
    ? requestedSectionId
    : (sectionOptions[0]?.sectionId ?? "");
  const gradeAnalysis = selectedSectionId
    ? await getSectionGradeAnalysis(db, ownerId, selectedSectionId)
    : null;

  // ── ③ 기록 커버리지 ──
  // coverageRows 는 "기록이 존재하는 건"만 담으므로, 4유형 전부 0건인 학생은
  // rows 에 나타나지 않는다. alertInputs 는 이미 해당 연도 학생 전원을 담고
  // 있으므로(getAlertInputs 가 studentYears 를 무조건 전수 조회) 별도 쿼리 없이
  // 그대로 allStudents 시드로 재사용 — 0건 학생도 최우선 정렬로 노출한다.
  const coverage = coverageMatrix(
    coverageRows,
    alertInputs.map((a) => ({ studentYearId: a.studentYearId, studentName: a.name })),
  );

  const cards: { label: string; value: number; sub?: string }[] = [
    { label: "학생", value: stats.students, sub: `${year}학년도 등록` },
    { label: "교과 관찰기록", value: stats.observations },
    { label: "행동특성 기록", value: stats.behaviorNotes },
    { label: "활동 기입", value: stats.activities },
    { label: "상담 기록", value: stats.counseling },
    { label: "동아리", value: stats.clubs },
    { label: "세특 초안", value: stats.draftsTotal, sub: `완료 ${stats.draftsFinalized}` },
    {
      label: "출결 기록",
      value: stats.attendanceTotal,
      sub: `미제출 신고서 ${stats.unsubmittedReports}`,
    },
  ];

  return (
    <>
      <RoomHeader
        icon="📊"
        title={`통계실 (${year}학년도 ${sem}학기)`}
        actions={
          <Link
            href="/print"
            className="inline-flex min-h-11 items-center text-sm text-neutral-500 hover:underline"
          >
            인쇄실 →
          </Link>
        }
      />

      {/* ① 이상징후 경보 */}
      <AlertPanel
        individual={individualAlerts}
        systemic={alertSummary.systemic}
        cohortSize={alertInputs.length}
      />

      {/* 전체 기록 현황 — 요약이 먼저다 (밀도 개선 D-11).

          이전에는 이 8개 집계 타일이 페이지 **맨 아래**, 33행짜리 0.0 표와
          11행짜리 0 표를 지나야 나왔다. 밀도 칼럼이 말하는 순서와 정확히
          반대다 — "요약 뷰를 먼저 주고, 세부로 파고들게 하라". 통계실에 들어온
          사람이 가장 먼저 알고 싶은 건 개별 학생의 0.0 이 아니라 전체 규모다.
          숫자 타일은 훑어보기(scan)에 최적화된 형태이기도 하다. */}
      <section className="mt-5">
        <h2 className="text-xs text-neutral-500">전체 기록 현황</h2>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className="rounded-lg border border-neutral-200 px-3 py-2.5">
              <p className="text-xs text-neutral-500">{c.label}</p>
              <p className="mt-0.5 text-xl tabular-nums text-white">{c.value}</p>
              {c.sub && <p className="text-xs text-neutral-400">{c.sub}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* ② 성적 분석 */}
      <section className="mt-5 rounded-lg border border-neutral-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm text-neutral-700">성적 분석</h2>
          {sectionOptions.length > 0 && (
            <SectionSelector sections={sectionOptions} selectedSectionId={selectedSectionId} />
          )}
        </div>
        {sectionOptions.length === 0 || !gradeAnalysis || gradeAnalysis.students.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">성적 데이터 없음</p>
        ) : (
          <GradeAnalysisView analysis={gradeAnalysis} />
        )}
      </section>

      {/* ③ 기록 커버리지 */}
      <section className="mt-6 rounded-lg border border-neutral-200 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm text-neutral-700">기록 커버리지</h2>
          <span className="text-xs text-neutral-400">
            학생 {coverage.length}명 · 기록 적은 순
          </span>
        </div>
        {coverage.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">학생 없음</p>
        ) : (
          // 전교생(100명대) 표가 그대로 펼쳐지면 페이지가 6,000px를 넘어 아래
          // 섹션(업무 진척)이 사실상 안 보인다. 표 안에서만 스크롤시킨다.
          <div className="mt-3 max-h-96 overflow-auto scroll-fade-y">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-neutral-400">
                  <th className="pb-2 font-normal">학생</th>
                  <th className="pb-2 font-normal">관찰</th>
                  <th className="pb-2 font-normal">행특</th>
                  <th className="pb-2 font-normal">세특초안</th>
                  <th className="pb-2 font-normal">창체</th>
                  <th className="pb-2 font-normal">합계</th>
                </tr>
              </thead>
              <tbody>
                {coverage.map((row) => (
                  <tr key={row.studentYearId} className="border-t border-neutral-100">
                    <td className="py-1.5">{row.studentName}</td>
                    <td className="py-1.5 tabular-nums">{row.counts.observation ?? 0}</td>
                    <td className="py-1.5 tabular-nums">{row.counts.behavior ?? 0}</td>
                    <td className="py-1.5 tabular-nums">{row.counts.setechDraft ?? 0}</td>
                    <td className="py-1.5 tabular-nums">{row.counts.creative ?? 0}</td>
                    <td className="py-1.5 tabular-nums font-normal">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ④ 업무 진척 */}
      <section className="mt-6 rounded-lg border border-neutral-200 p-4">
        <h2 className="text-sm text-neutral-700">업무 진척</h2>
        {workProgress.sections.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">분반 없음</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-neutral-400">
                  <th className="pb-2 font-normal">과목·분반</th>
                  <th className="pb-2 font-normal">목표 진도율</th>
                  <th className="pb-2 font-normal">실제 진도율</th>
                  <th className="pb-2 font-normal">상태</th>
                </tr>
              </thead>
              <tbody>
                {workProgress.sections.map((s) => (
                  <tr key={s.sectionId} className="border-t border-neutral-100">
                    <td className="py-1.5">
                      {s.subjectName} · {s.label}
                    </td>
                    {/* 시험일이 지나면 목표(=오늘까지 차시÷시험목표 차시)가 100%를
                        넘어 475% 같은 값이 진도율 자리에 찍힌다 — 상한 표시. */}
                    <td className="py-1.5 tabular-nums">
                      {s.targetRate > 1 ? (
                        <>
                          100%{" "}
                          <span className="text-xs text-neutral-400">(시험 경과)</span>
                        </>
                      ) : (
                        pct(s.targetRate)
                      )}
                    </td>
                    <td className="py-1.5 tabular-nums">{pct(s.actualRate)}</td>
                    <td className="py-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          s.color === "red"
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {s.color === "red" ? "지연" : "정상"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-neutral-400">세특 초안 완성률</dt>
            <dd className="mt-0.5 tabular-nums">
              {workProgress.specialNoteCompletionRate === null
                ? "데이터 없음"
                : pct(workProgress.specialNoteCompletionRate)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-400">신고서 처리율</dt>
            <dd className="mt-0.5 tabular-nums">
              {workProgress.reportProcessRate === null
                ? "데이터 없음"
                : pct(workProgress.reportProcessRate)}
            </dd>
          </div>
        </dl>

      </section>
    </>
  );
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function avgOf(scores: number[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** 성적 분석 섹션 본문(히스토그램·기초통계·추이·분반비교·수행입력률). */
function GradeAnalysisView({ analysis }: { analysis: SectionGradeAnalysis }) {
  const scores = analysis.students.map((s) => s.total);
  const bins = histogram(scores, 10);
  const stats = basicStats(scores);
  // 성적이 한 건도 입력되지 않으면 모든 점수가 0이라 "0-10 구간에 전원"이라는
  // 거대한 단일 막대가 그려진다. 분포로 오독되므로 미입력 안내로 대체한다.
  const hasScores = scores.some((s) => s > 0);

  const comparisonData: SectionComparisonDatum[] = [
    { label: `${analysis.sectionLabel}(현재)`, avg: avgOf(scores), current: true },
    ...analysis.otherSections
      .filter((os) => os.scores.length > 0)
      .map((os) => ({ label: os.label, avg: avgOf(os.scores), current: false })),
  ];

  return (
    <div className="mt-4 space-y-6">
      {/* 히스토그램 + 기초통계 */}
      <div>
        <h3 className="text-xs text-neutral-500">점수 분포</h3>
        {hasScores ? (
          <>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              <span>평균 {stats.mean.toFixed(1)}</span>
              <span>표준편차 {stats.stddev.toFixed(1)}</span>
              <span>중앙값 {stats.median.toFixed(1)}</span>
              <span className="text-neutral-400">n={stats.n}</span>
            </div>
            <div className="mt-2">
              <HistogramChart bins={bins} />
            </div>
          </>
        ) : (
          <div className="mt-2">
            <EmptyState
              tone="neutral"
              actions={[{ href: "/classroom/grades", label: "성적 기록" }]}
            >
              성적이 아직 없습니다 (수강생 {stats.n}명).
            </EmptyState>
          </div>
        )}
      </div>

      {/* 중간→기말 추이 */}
      <div>
        <h3 className="text-xs text-neutral-500">
          중간→기말 추이{" "}
          <span className="text-neutral-400">({analysis.students.length}명)</span>
        </h3>
        <div className="mt-2 max-h-96 overflow-auto scroll-fade-y">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-neutral-400">
                <th className="pb-1 font-normal">학생</th>
                <th className="pb-1 font-normal">중간</th>
                <th className="pb-1 font-normal">기말</th>
                <th className="pb-1 font-normal">추이</th>
              </tr>
            </thead>
            <tbody>
              {analysis.students.map((s) => {
                const diff = s.jipilFinal - s.jipilMid;
                const direction = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
                const badge =
                  direction === "up"
                    ? { label: `↑ +${diff.toFixed(1)}`, cls: "bg-green-100 text-green-700" }
                    : direction === "down"
                      ? { label: `↓ ${diff.toFixed(1)}`, cls: "bg-red-100 text-red-700" }
                      : { label: "→ 유지", cls: "bg-neutral-100 text-neutral-600" };
                return (
                  <tr key={s.studentYearId} className="border-t border-neutral-100">
                    <td className="py-1">{s.name}</td>
                    <td className="py-1 tabular-nums">{s.jipilMid.toFixed(1)}</td>
                    <td className="py-1 tabular-nums">{s.jipilFinal.toFixed(1)}</td>
                    <td className="py-1">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 분반 간 비교 */}
      {comparisonData.length > 1 && (
        <div>
          <h3 className="text-xs text-neutral-500">
            같은 과목 분반 간 비교 ({analysis.subjectName})
          </h3>
          <div className="mt-2">
            <SectionComparisonChart data={comparisonData} />
          </div>
        </div>
      )}

      {/* 수행평가 항목별 입력률/평균 */}
      <div>
        <h3 className="text-xs text-neutral-500">수행평가 항목별 입력률</h3>
        {analysis.performanceItems.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">설정된 수행 항목이 없습니다.</p>
        ) : (
          <div className="mt-2">
            <PerformanceFillChart items={analysis.performanceItems} />
          </div>
        )}
      </div>
    </div>
  );
}
