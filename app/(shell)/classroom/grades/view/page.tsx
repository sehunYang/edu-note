import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { listSubjectsWithSections, getStoredGradeTables } from "@/lib/db/queries";
import { activeSchoolYear, activeSemester } from "@/lib/domain/school-year";

export const metadata = { title: "성적 저장 테이블" };

export const dynamic = "force-dynamic";

/**
 * 성적 저장 테이블 조회 (QC v3 AC-3.3). 업로드되어 저장된 수행 항목별·지필 회차별
 * 원자료(원점수·서술)를 과목별로 전체 화면에 보여준다. 별도 라우트(편집 아님, 조회 전용).
 */
export default async function GradesViewPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string }>;
}) {
  const ownerId = await getOwnerId();
  const db = getDb();
  const now = new Date();
  const year = activeSchoolYear(now);
  const activeSem = activeSemester(now);
  const sp = await searchParams;
  const sem: 1 | 2 = sp.semester === "1" ? 1 : sp.semester === "2" ? 2 : activeSem;

  const subjectList = await listSubjectsWithSections(db, ownerId, year, sem);
  const tables = await Promise.all(
    subjectList.map(async (s) => ({
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      stored: await getStoredGradeTables(db, ownerId, s.subjectId),
    })),
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-normal text-neutral-800">
          저장 성적 테이블 · {sem}학기
        </h2>
        <Link
          href={`/classroom/grades?semester=${sem}`}
          className="rounded-full border border-white/25 bg-transparent px-3 py-1 text-xs text-neutral-600 hover:bg-white/10"
        >
          ← 성적 기록
        </Link>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        업로드되어 저장된 지필 원점수와 수행 항목별 점수·서술을 조회합니다(환산 전 원자료).
      </p>

      {tables.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-400">
          이 학기에 등록된 과목이 없습니다.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {tables.map((t) => (
            <section
              key={t.subjectId}
              className="rounded-lg border border-neutral-200 p-4"
            >
              <h3 className="text-sm font-normal text-neutral-700">
                {t.subjectName}
              </h3>

              {/* 지필 원점수 */}
              {(t.stored.midEnabled || t.stored.finalEnabled) && (
                <div className="mt-3">
                  <h4 className="text-xs font-normal text-neutral-500">지필 원점수</h4>
                  <div className="mt-1 overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-neutral-200 text-left text-neutral-400">
                          <th className="px-2 py-1">학번</th>
                          <th className="px-2 py-1">이름</th>
                          {t.stored.midEnabled && (
                            <th className="px-2 py-1 text-right">중간</th>
                          )}
                          {t.stored.finalEnabled && (
                            <th className="px-2 py-1 text-right">기말</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {t.stored.jipil.map((r) => (
                          <tr key={r.sid} className="border-b border-neutral-100">
                            <td className="px-2 py-1">{r.sid}</td>
                            <td className="px-2 py-1">{r.name}</td>
                            {t.stored.midEnabled && (
                              <td className="px-2 py-1 text-right">{r.mid ?? "–"}</td>
                            )}
                            {t.stored.finalEnabled && (
                              <td className="px-2 py-1 text-right">
                                {r.final ?? "–"}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 수행 항목별 */}
              {t.stored.performance.length === 0 ? (
                <p className="mt-3 text-xs text-neutral-400">
                  저장된 수행평가 항목이 없습니다.
                </p>
              ) : (
                t.stored.performance.map((item) => (
                  <div key={item.item} className="mt-3">
                    <h4 className="text-xs font-normal text-neutral-500">
                      수행 · {item.item}
                    </h4>
                    <div className="mt-1 overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="border-b border-neutral-200 text-left text-neutral-400">
                            <th className="px-2 py-1">학번</th>
                            <th className="px-2 py-1">이름</th>
                            <th className="px-2 py-1 text-right">점수</th>
                            <th className="px-2 py-1">서술</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.rows.map((r) => (
                            <tr key={r.sid} className="border-b border-neutral-100">
                              <td className="px-2 py-1">{r.sid}</td>
                              <td className="px-2 py-1">{r.name}</td>
                              <td className="px-2 py-1 text-right">
                                {r.score ?? "–"}
                              </td>
                              <td className="px-2 py-1 text-neutral-600">
                                {r.prose ?? ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
