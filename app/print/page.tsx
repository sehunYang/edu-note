import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { listStudents } from "@/lib/db/queries";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/**
 * 인쇄실 (계획 §4 Phase2-K-2). 학생 명렬표를 인쇄/PDF 로 저장.
 * 화면 컨트롤은 `print:hidden`, 표는 인쇄 친화적 레이아웃으로 렌더.
 */
export default async function PrintPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = new Date().getFullYear();
  const students = await listStudents(db, ownerId, year);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-normal tracking-tight">인쇄실 ({year})</h1>
        <div className="flex items-center gap-4">
          <PrintButton />
          <Link href="/" className="text-sm text-neutral-500 hover:underline">
            ← 홈
          </Link>
        </div>
      </div>

      <p className="mt-2 text-xs text-neutral-400 print:hidden">
        아래 명렬표를 인쇄하거나 PDF 로 저장할 수 있습니다(브라우저 인쇄 → PDF로 저장).
      </p>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-normal">학생 명렬표 ({year})</h2>
        {students.length === 0 ? (
          <p className="text-sm text-neutral-400">
            등록된 학생이 없습니다.{" "}
            <Link href="/students" className="underline print:hidden">
              학생 명단
            </Link>
            을 먼저 임포트하세요.
          </p>
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
