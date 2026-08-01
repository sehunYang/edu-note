import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  listSubjectsWithSections,
  listStudentsBySection,
  getStudentReport,
} from "@/lib/db/queries";
import { activeSchoolYear, activeSemester } from "@/lib/domain/school-year";
import type {
  JipilTrend,
  SectionRank,
} from "@/lib/domain/student-report";
import {
  ReportSelector,
  type SectionOption,
} from "./report-selector";

export const metadata = { title: "학생 보고서" };

export const dynamic = "force-dynamic";

/**
 * 학생 분석 보고서 (교실 2-2 단계6). 분반·학생 선택 시 인적·관찰·성적 종합 +
 * 규칙기반 플래그 4종(지필추이·관찰부족·수행미입력·분반순위)을 표시한다.
 * **AI 호출 없음**(AC-R5) — 모든 진단은 도메인 순수 규칙. `?semester` 수동 전환.
 */
export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string; section?: string; student?: string }>;
}) {
  const ownerId = await getOwnerId();
  const db = getDb();
  const now = new Date();
  const year = activeSchoolYear(now);
  const activeSem = activeSemester(now);
  const sp = await searchParams;
  const sem: 1 | 2 = sp.semester === "1" ? 1 : sp.semester === "2" ? 2 : activeSem;
  const sectionId = sp.section?.trim() ?? "";
  const studentId = sp.student?.trim() ?? "";

  const subjectsWithSections = await listSubjectsWithSections(db, ownerId, year, sem);
  const sectionOptions: SectionOption[] = subjectsWithSections.flatMap((s) =>
    s.sections.map((sec) => ({
      sectionId: sec.id,
      label: sec.label,
      subjectName: s.subjectName,
    })),
  );

  // 분반 선택 시 그 분반 수강생 목록.
  const students = sectionId
    ? await listStudentsBySection(db, ownerId, sectionId)
    : [];

  // 분반·학생 모두 선택 시 보고서 조립.
  const report =
    sectionId && studentId
      ? await getStudentReport(db, ownerId, studentId, sectionId, year, sem)
      : null;

  return (
    <div>
      <h2 className="text-lg font-normal text-neutral-800">
        학생 분석 보고서 · {sem}학기
        {sem !== activeSem && (
          <span className="ml-2 text-xs text-neutral-400">(과거/타 학기 조회 중)</span>
        )}
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        분반과 학생을 고르면 인적사항·관찰·성적을 모아 규칙기반 진단 플래그를
        표시합니다(AI 미사용).
      </p>

      {sectionOptions.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-400">
          이 학기에 등록된 분반이 없습니다. 먼저 세팅실에서 수업·분반을 등록하세요.
        </p>
      ) : (
        <ReportSelector
          sections={sectionOptions}
          students={students.map((s) => ({ id: s.id, sid: s.sid, name: s.name }))}
          selectedSection={sectionId}
          selectedStudent={studentId}
        />
      )}

      {sectionId && studentId && !report && (
        <p className="mt-6 text-sm text-neutral-400">
          선택한 학생·분반의 보고서를 찾을 수 없습니다.
        </p>
      )}

      {report && <ReportView report={report} />}
    </div>
  );
}

/** 보고서 본문(서버 렌더). 인적/관찰/성적 종합 + 플래그 배지 4종. */
function ReportView({
  report,
}: {
  report: NonNullable<Awaited<ReturnType<typeof getStudentReport>>>;
}) {
  const { profile, observationCount, grades, flags } = report;
  return (
    <div className="mt-6 space-y-5">
      {/* 인적사항 */}
      <section className="rounded-lg border border-neutral-200 p-4">
        <h3 className="text-sm font-normal text-neutral-700">인적사항</h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm md:grid-cols-4">
          <Field label="학번" value={profile.sid} />
          <Field label="이름" value={profile.name} />
          <Field
            label="학년/반/번호"
            value={`${profile.grade}-${profile.classNo}-${profile.number}`}
          />
          <Field label="연락처" value={profile.phone ?? "—"} />
          <Field label="희망진로" value={profile.career ?? "—"} />
        </dl>
      </section>

      {/* 플래그 배지 4종 */}
      <section className="rounded-lg border border-neutral-200 p-4">
        <h3 className="text-sm font-normal text-neutral-700">진단 플래그</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <TrendBadge trend={flags.jipilTrend} />
          {flags.observationShortage && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-normal text-amber-700">
              ⚠ 관찰 부족 ({observationCount}건)
            </span>
          )}
          {flags.performanceMissing.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-normal text-amber-700">
              ⚠ 수행 미입력: {flags.performanceMissing.join(", ")}
            </span>
          )}
          <RankBadge rank={flags.sectionRank} />
        </div>
      </section>

      {/* 성적 종합 */}
      <section className="rounded-lg border border-neutral-200 p-4">
        <h3 className="text-sm font-normal text-neutral-700">성적 종합</h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm md:grid-cols-4">
          <Field
            label="지필 중간(환산)"
            value={grades.jipilMidConverted === null ? "—" : round2(grades.jipilMidConverted)}
          />
          <Field
            label="지필 기말(환산)"
            value={grades.jipilFinalConverted === null ? "—" : round2(grades.jipilFinalConverted)}
          />
          <Field label="지필 합" value={round2(grades.jipilTotal)} />
          <Field label="수행 합" value={round2(grades.performanceTotal)} />
          <Field label="총점" value={round2(grades.total)} />
        </dl>
        <div className="mt-3">
          <p className="text-xs font-normal text-neutral-500">수행항목 입력 현황</p>
          {grades.performanceItems.length === 0 ? (
            <p className="mt-1 text-xs text-neutral-400">설정된 수행항목이 없습니다.</p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {grades.performanceItems.map((it) => (
                <li
                  key={it.name}
                  className={`rounded px-2 py-0.5 text-xs ${
                    it.hasScore
                      ? "bg-neutral-100 text-neutral-600"
                      : "bg-amber-50 text-amber-600"
                  }`}
                >
                  {it.hasScore ? "✓" : "○"} {it.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-400">{label}</dt>
      <dd className="text-neutral-700">{value}</dd>
    </div>
  );
}

function round2(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** 지필 추이 화살표 배지(AC-R2). null 이면 데이터 부족 표시. */
function TrendBadge({ trend }: { trend: JipilTrend }) {
  if (trend === null) {
    return (
      <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-normal text-neutral-500">
        지필 추이 — 데이터 부족
      </span>
    );
  }
  const map: Record<Exclude<JipilTrend, null>, { label: string; cls: string }> = {
    up: { label: "↑ 지필 상승", cls: "bg-green-100 text-green-700" },
    down: { label: "↓ 지필 하락", cls: "bg-red-100 text-red-700" },
    flat: { label: "→ 지필 유지", cls: "bg-neutral-100 text-neutral-600" },
  };
  const m = map[trend];
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-normal ${m.cls}`}>
      {m.label}
    </span>
  );
}

/** 분반 코호트 대비 위치 배지(AC-R5 표시). */
function RankBadge({ rank }: { rank: SectionRank }) {
  if (rank === null) {
    return (
      <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-normal text-neutral-500">
        분반 순위 — 산출 불가
      </span>
    );
  }
  const map: Record<Exclude<SectionRank, null>, { label: string; cls: string }> = {
    high: { label: "분반 상위", cls: "bg-green-100 text-green-700" },
    mid: { label: "분반 중위", cls: "bg-neutral-100 text-neutral-600" },
    low: { label: "분반 하위", cls: "bg-orange-100 text-orange-700" },
  };
  const m = map[rank];
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-normal ${m.cls}`}>
      {m.label}
    </span>
  );
}
