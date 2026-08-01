import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  listHomeroomClasses,
  listHomeroomMembers,
  listSectionsForSemester,
  getStudentReportsForSection,
  type HomeroomMemberRow,
} from "@/lib/db/queries";
import { activeSchoolYear, activeSemester } from "@/lib/domain/school-year";
import type { StudentReport } from "@/lib/db/queries/student-report";
import { Badge, TrendBadge, RankBadge } from "./badges";

export const metadata = { title: "인쇄실" };

export const dynamic = "force-dynamic";

type Scope = "homeroom" | "section";

/**
 * 인쇄실 홈 (계획 AD-4 Option C — 셸 안 탐색 화면). 범위 선택(담임반/분반) →
 * 선택 시 학생 목록(플래그 배지). 담임반은 구조상 분반 스코프 플래그(지필추이·
 * 구간석차·수행미입력)를 적용할 수 없어 관찰부족+출결 건수만 표시하는 축소 배지를
 * 쓰고(AD-4 확정 해석), 분반은 `getStudentReportsForSection`로 4플래그 전체를 표시한다.
 * 학생 선택 시 `/print/[studentYearId]`(상세 점검)로 이동. 명렬표 인쇄는 `/print/roster`.
 */
export default async function PrintHomePage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; homeroom?: string; section?: string }>;
}) {
  const ownerId = await getOwnerId();
  const db = getDb();
  const now = new Date();
  const year = activeSchoolYear(now);
  const sem = activeSemester(now);
  const sp = await searchParams;
  const scope: Scope = sp.scope === "section" ? "section" : "homeroom";
  const homeroomId = sp.homeroom?.trim() ?? "";
  const sectionId = sp.section?.trim() ?? "";

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          {/* 다른 실과 같은 h1 + 이모지 형식으로 통일(사용성 개선 P1-5). */}
          <h1 className="text-2xl font-normal tracking-tight">
            <span aria-hidden="true">🖨️</span> 인쇄실
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            담임반 또는 분반을 골라 학생별 점검 화면으로 이동하거나, 배부용 인쇄물을
            준비하세요.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <Link
            href="/print/roster"
            className="inline-flex min-h-11 items-center rounded-md border border-neutral-300 px-3 text-sm text-neutral-700 hover:bg-white/10"
          >
            학생 명렬표 인쇄 →
          </Link>
          {/* 다른 실과 동일하게 홈 복귀 링크를 둔다(사용성 개선 P1-5). */}
          <Link href="/" className="inline-flex min-h-11 items-center text-sm text-neutral-500 hover:underline">
            ← 홈
          </Link>
        </div>
      </div>

      {/* 범위 토글 */}
      <div
        className="mt-5 inline-flex rounded-md border border-neutral-300 p-0.5"
        role="group"
        aria-label="범위 선택"
      >
        <Link
          href="/print?scope=homeroom"
          aria-current={scope === "homeroom" ? "true" : undefined}
          className={`rounded px-3 py-1 text-sm ${
            scope === "homeroom"
              ? "border border-white/25 bg-transparent text-white"
              : "text-neutral-600 hover:bg-white/10"
          }`}
        >
          담임반
        </Link>
        <Link
          href="/print?scope=section"
          aria-current={scope === "section" ? "true" : undefined}
          className={`rounded px-3 py-1 text-sm ${
            scope === "section"
              ? "border border-white/25 bg-transparent text-white"
              : "text-neutral-600 hover:bg-white/10"
          }`}
        >
          분반
        </Link>
      </div>

      {scope === "homeroom" ? (
        <HomeroomScope db={db} ownerId={ownerId} year={year} homeroomId={homeroomId} />
      ) : (
        <SectionScope
          db={db}
          ownerId={ownerId}
          year={year}
          sem={sem}
          sectionId={sectionId}
        />
      )}
    </div>
  );
}

async function HomeroomScope({
  db,
  ownerId,
  year,
  homeroomId,
}: {
  db: ReturnType<typeof getDb>;
  ownerId: string;
  year: number;
  homeroomId: string;
}) {
  const classes = await listHomeroomClasses(db, ownerId, year);

  if (classes.length === 0) {
    return (
      <p className="mt-8 text-sm text-neutral-400">
        등록된 담임반이 없습니다. 먼저 세팅실에서 담임반을 등록하세요.
      </p>
    );
  }

  const selected = classes.find((c) => c.id === homeroomId) ?? null;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {classes.map((c) => (
          <Link
            key={c.id}
            href={`/print?scope=homeroom&homeroom=${c.id}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              c.id === homeroomId
                ? "border-neutral-800 bg-neutral-800 text-white"
                : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {c.grade}학년 {c.classNo}반
          </Link>
        ))}
      </div>

      {selected && (
        <div className="mt-5">
          <HomeroomMembersTable db={db} ownerId={ownerId} homeroomId={selected.id} />
        </div>
      )}
    </div>
  );
}

async function HomeroomMembersTable({
  db,
  ownerId,
  homeroomId,
}: {
  db: ReturnType<typeof getDb>;
  ownerId: string;
  homeroomId: string;
}) {
  const members = await listHomeroomMembers(db, ownerId, homeroomId);
  if (members.length === 0) {
    return <p className="text-sm text-neutral-400">이 담임반에 학생이 없습니다.</p>;
  }
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b-2 border-neutral-300 text-left">
          <th className="py-1.5 pr-3 font-normal">학번</th>
          <th className="py-1.5 pr-3 font-normal">이름</th>
          <th className="py-1.5 pr-3 font-normal">배지</th>
        </tr>
      </thead>
      <tbody>
        {members.map((m: HomeroomMemberRow) => (
          <tr key={m.studentYearId} className="border-b border-neutral-200">
            <td className="py-1.5 pr-3 tabular-nums text-neutral-500">{m.sid}</td>
            <td className="py-1.5 pr-3">
              <Link href={`/print/${m.studentYearId}`} className="hover:underline">
                {m.name}
              </Link>
            </td>
            <td className="py-1.5 pr-3">
              <div className="flex flex-wrap gap-1.5">
                {m.observationShortage && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-700">
                    ⚠ 관찰 부족
                  </span>
                )}
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-normal text-neutral-500">
                  출결 {m.attendanceCount}건
                </span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function SectionScope({
  db,
  ownerId,
  year,
  sem,
  sectionId,
}: {
  db: ReturnType<typeof getDb>;
  ownerId: string;
  year: number;
  sem: 1 | 2;
  sectionId: string;
}) {
  const sections = await listSectionsForSemester(db, ownerId, year, sem);

  if (sections.length === 0) {
    return (
      <p className="mt-8 text-sm text-neutral-400">
        이 학기에 등록된 분반이 없습니다. 먼저 세팅실에서 수업·분반을 등록하세요.
      </p>
    );
  }

  const selected = sections.find((s) => s.sectionId === sectionId) ?? null;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <Link
            key={s.sectionId}
            href={`/print?scope=section&section=${s.sectionId}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              s.sectionId === sectionId
                ? "border-neutral-800 bg-neutral-800 text-white"
                : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {s.subjectName} {s.label}
          </Link>
        ))}
      </div>

      {selected && (
        <div className="mt-5">
          <SectionStudentsTable
            db={db}
            ownerId={ownerId}
            sectionId={selected.sectionId}
            year={year}
            sem={sem}
          />
        </div>
      )}
    </div>
  );
}

async function SectionStudentsTable({
  db,
  ownerId,
  sectionId,
  year,
  sem,
}: {
  db: ReturnType<typeof getDb>;
  ownerId: string;
  sectionId: string;
  year: number;
  sem: 1 | 2;
}) {
  const reports = await getStudentReportsForSection(db, ownerId, sectionId, year, sem);
  if (reports.length === 0) {
    return <p className="text-sm text-neutral-400">이 분반에 학생이 없습니다.</p>;
  }
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b-2 border-neutral-300 text-left">
          <th className="py-1.5 pr-3 font-normal">학번</th>
          <th className="py-1.5 pr-3 font-normal">이름</th>
          <th className="py-1.5 pr-3 font-normal">배지</th>
        </tr>
      </thead>
      <tbody>
        {reports.map((r: StudentReport) => (
          <tr key={r.profile.studentYearId} className="border-b border-neutral-200">
            <td className="py-1.5 pr-3 tabular-nums text-neutral-500">{r.profile.sid}</td>
            <td className="py-1.5 pr-3">
              <Link href={`/print/${r.profile.studentYearId}`} className="hover:underline">
                {r.profile.name}
              </Link>
            </td>
            <td className="py-1.5 pr-3">
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
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
