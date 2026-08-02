import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { listStudents } from "@/lib/db/queries";
import { PrintButton } from "../print-button";
import { EmptyState } from "@/app/ui/empty-state";

export const metadata = { title: "학생 명렬표" };

export const dynamic = "force-dynamic";

/**
 * 명렬표 인쇄 (계획 §4 Phase2-K-2, AD-4 Option C). 학생 명렬표를 인쇄/PDF 로 저장.
 * 셸 밖 라우트(크롬 무탑재) — `app/(shell)/print/page.tsx`(인쇄실 홈)에서 이동.
 * 화면 컨트롤은 `print:hidden`, 표는 인쇄 친화적 레이아웃으로 렌더.
 */
export default async function PrintRosterPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = new Date().getFullYear();
  const students = await listStudents(db, ownerId, year);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl tracking-tight">인쇄실 ({year})</h1>
        <div className="flex items-center gap-4">
          <PrintButton />
          <Link href="/print" className="inline-flex min-h-11 items-center text-sm text-neutral-500 hover:underline">
            ← 인쇄실
          </Link>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-lg">학생 명렬표 ({year})</h2>
        {students.length === 0 ? (
          <div className="print:hidden">
            <EmptyState actions={[{ href: "/students", label: "학생 명단 임포트" }]}>
              등록된 학생이 없습니다.
            </EmptyState>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-neutral-300 text-left">
                <th className="py-1.5 pr-3 font-normal">번호</th>
                <th className="py-1.5 pr-3 font-normal">학번</th>
                <th className="py-1.5 pr-3 font-normal">학년</th>
                <th className="py-1.5 pr-3 font-normal">반</th>
                <th className="py-1.5 pr-3 font-normal">이름</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => (
                <tr key={s.id} className="border-b border-neutral-200">
                  <td className="py-1.5 pr-3 tabular-nums">{i + 1}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{s.sid}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{s.grade}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{s.classNo}</td>
                  <td className="py-1.5 pr-3">{s.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-4 text-xs text-neutral-400">총 {students.length}명</p>
      </section>
    </main>
  );
}
