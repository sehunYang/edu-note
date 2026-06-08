import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { studentYears } from "@/lib/db/schema/identity";
import { publicPages } from "@/lib/db/schema/misc";
import { ImportForm } from "./import-form";
import { CopyLinkButton } from "./copy-link-button";
import { issueTokenAction, revokeTokenAction } from "./actions";

export const dynamic = "force-dynamic";

/** 학생 명단 화면 (계획 §4 A·I). CSV 임포트 + 학생별 공개 링크 발급/폐기. */
export default async function StudentsPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = new Date().getFullYear();

  const students = await db
    .select({
      id: studentYears.id,
      sid: studentYears.sid,
      name: studentYears.name,
      grade: studentYears.grade,
      classNo: studentYears.classNo,
      number: studentYears.number,
    })
    .from(studentYears)
    .where(and(eq(studentYears.ownerId, ownerId), eq(studentYears.schoolYear, year)))
    .orderBy(asc(studentYears.sid));

  const activeLinks = await db
    .select({
      id: publicPages.id,
      studentYearId: publicPages.studentYearId,
      token: publicPages.token,
    })
    .from(publicPages)
    .where(and(eq(publicPages.ownerId, ownerId), isNull(publicPages.revokedAt)));
  const linkByStudent = new Map(activeLinks.map((l) => [l.studentYearId, l]));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">학생 명단 ({year})</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>

      <section className="mt-6 rounded-lg border border-neutral-200 p-5">
        <h2 className="text-sm font-semibold text-neutral-700">CSV 명단 임포트</h2>
        <p className="mt-1 text-xs text-neutral-400">
          헤더에 <code>학번</code>·<code>이름</code> 필수. 학번 5자리에서 학년/반/번호가
          자동 산출됩니다.
        </p>
        <div className="mt-3">
          <ImportForm defaultYear={year} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-700">
          등록 학생 {students.length}명
        </h2>
        {students.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">
            아직 등록된 학생이 없습니다. 위에서 CSV를 임포트하세요.
          </p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-neutral-400">
              <tr>
                <th className="py-1 font-medium">학번</th>
                <th className="py-1 font-medium">이름</th>
                <th className="py-1 font-medium">공개 링크</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const link = linkByStudent.get(s.id);
                return (
                  <tr key={s.id} className="border-t border-neutral-100">
                    <td className="py-2">{s.sid}</td>
                    <td className="py-2">{s.name}</td>
                    <td className="py-2">
                      {link ? (
                        <span className="flex items-center gap-2">
                          <Link
                            href={`/p/${link.token}`}
                            className="font-mono text-xs text-blue-600 hover:underline"
                            target="_blank"
                          >
                            /p/{link.token.slice(0, 10)}…
                          </Link>
                          <CopyLinkButton path={`/p/${link.token}`} />
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400">없음</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <form action={issueTokenAction} className="inline">
                        <input type="hidden" name="studentYearId" value={s.id} />
                        <button className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">
                          {link ? "재발급" : "발급"}
                        </button>
                      </form>
                      {link && (
                        <form action={revokeTokenAction} className="ml-1 inline">
                          <input type="hidden" name="pageId" value={link.id} />
                          <button className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                            폐기
                          </button>
                        </form>
                      )}
                    </td>
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
