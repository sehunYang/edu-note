import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { listStudents, listDrafts } from "@/lib/db/queries";
import { subjects } from "@/lib/db/schema/classes";
import { noteTypeLabel } from "@/lib/setech";
import { SetechForm } from "./setech-form";

export const dynamic = "force-dynamic";

/**
 * 세특 코워크 내보내기 화면 (계획 §4 C, AC-C). 원천 묶음→프롬프트 생성→복사→
 * 코워크 생성→붙여넣기 검수(바이트·기재금지·문체)→저장(source=cowork).
 */
export default async function SetechPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = new Date().getFullYear();

  const [students, subjectRows, drafts] = await Promise.all([
    listStudents(db, ownerId, year),
    db
      .select({ id: subjects.id, name: subjects.name })
      .from(subjects)
      .where(and(eq(subjects.ownerId, ownerId), eq(subjects.schoolYear, year)))
      .orderBy(asc(subjects.name)),
    listDrafts(db, ownerId),
  ]);

  const nameById = new Map(students.map((s) => [s.id, s]));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">세특 내보내기 ({year})</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>

      <p className="mt-2 text-xs text-neutral-400">
        서버에서 AI를 호출하지 않습니다. 원천 자료를 묶어 프롬프트를 만들고, 코워크(Claude
        Code)에서 생성한 결과를 붙여넣어 바이트·기재금지 검수 후 저장합니다.
      </p>

      <section className="mt-6 rounded-lg border border-neutral-200 p-5">
        {students.length === 0 ? (
          <p className="text-sm text-neutral-400">
            먼저{" "}
            <Link href="/students" className="underline">
              학생 명단
            </Link>
            을 임포트하세요.
          </p>
        ) : (
          <SetechForm
            students={students.map((s) => ({ id: s.id, label: `${s.sid} ${s.name}` }))}
            subjects={subjectRows.map((s) => ({ id: s.id, label: s.name }))}
          />
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-700">저장된 초안 {drafts.length}</h2>
        {drafts.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">아직 저장된 세특 초안이 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {drafts.map((d) => {
              const st = nameById.get(d.studentYearId);
              return (
                <li key={d.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
                  <div className="flex justify-between text-xs text-neutral-400">
                    <span>{st ? `${st.sid} ${st.name}` : "—"}</span>
                    <span>
                      {noteTypeLabel(d.type)} · {d.byteCount}/{d.byteLimit} byte
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-neutral-700">{d.content}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
