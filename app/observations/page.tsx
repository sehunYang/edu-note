import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  listStudents,
  listSectionsWithProgress,
  listSubjectObservations,
  listBehaviorNotes,
} from "@/lib/db/queries";
import { addObservationAction, addBehaviorNoteAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * 관찰/행특 기록 화면 (계획 §4 C). 교과 관찰(분반·키워드) + 행동특성(키워드)
 * 2스트림. 세특 묶음 내보내기의 관찰 근거가 된다.
 */
export default async function ObservationsPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = new Date().getFullYear();

  const [students, sections, observations, behaviorNotes] = await Promise.all([
    listStudents(db, ownerId, year),
    listSectionsWithProgress(db, ownerId, year),
    listSubjectObservations(db, ownerId, { limit: 20 }),
    listBehaviorNotes(db, ownerId, { limit: 20 }),
  ]);
  const nameById = new Map(students.map((s) => [s.id, s]));
  const sectionById = new Map(sections.map((s) => [s.sectionId, s]));

  const studentOptions = students.map((s) => (
    <option key={s.id} value={s.id}>
      {s.sid} {s.name}
    </option>
  ));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">관찰 · 행특 기록 ({year})</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>

      {students.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-400">
          먼저{" "}
          <Link href="/students" className="underline">
            학생 명단
          </Link>
          을 임포트하세요.
        </p>
      ) : (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* 교과 관찰 */}
          <section className="rounded-lg border border-neutral-200 p-5">
            <h2 className="text-sm font-semibold text-neutral-700">교과 관찰기록</h2>
            <form action={addObservationAction} className="mt-3 space-y-2">
              <select
                name="studentYearId"
                required
                className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
              >
                {studentOptions}
              </select>
              <select
                name="sectionId"
                defaultValue=""
                className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
              >
                <option value="">분반(선택 안 함)</option>
                {sections.map((s) => (
                  <option key={s.sectionId} value={s.sectionId}>
                    {s.subjectName} {s.label}
                  </option>
                ))}
              </select>
              <textarea
                name="body"
                required
                rows={3}
                placeholder="관찰 내용(사실 위주)"
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                name="keywords"
                placeholder="키워드(콤마/공백 구분)"
                className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm"
              />
              <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700">
                관찰 저장
              </button>
            </form>
          </section>

          {/* 행동특성 */}
          <section className="rounded-lg border border-neutral-200 p-5">
            <h2 className="text-sm font-semibold text-neutral-700">행동특성 기록</h2>
            <p className="mt-1 text-xs text-neutral-400">담임 누가기록(매일 16시 후 넛지).</p>
            <form action={addBehaviorNoteAction} className="mt-3 space-y-2">
              <select
                name="studentYearId"
                required
                className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
              >
                {studentOptions}
              </select>
              <textarea
                name="body"
                required
                rows={3}
                placeholder="행동특성(사실 위주)"
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                name="keywords"
                placeholder="키워드(콤마/공백 구분)"
                className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm"
              />
              <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700">
                행특 저장
              </button>
            </form>
          </section>
        </div>
      )}

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold text-neutral-500">최근 관찰 {observations.length}</h3>
          <ul className="mt-2 space-y-2">
            {observations.map((o) => {
              const st = nameById.get(o.studentYearId);
              const sec = o.sectionId ? sectionById.get(o.sectionId) : null;
              return (
                <li key={o.id} className="rounded border border-neutral-100 p-2 text-sm">
                  <div className="flex justify-between text-xs text-neutral-400">
                    <span>{st ? `${st.sid} ${st.name}` : "—"}</span>
                    <span>
                      {sec ? `${sec.subjectName} ${sec.label} · ` : ""}
                      {o.observedOn}
                    </span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-neutral-700">{o.body}</p>
                  {o.keywords && o.keywords.length > 0 && (
                    <p className="mt-0.5 text-xs text-blue-600">#{o.keywords.join(" #")}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-semibold text-neutral-500">최근 행특 {behaviorNotes.length}</h3>
          <ul className="mt-2 space-y-2">
            {behaviorNotes.map((b) => {
              const st = nameById.get(b.studentYearId);
              return (
                <li key={b.id} className="rounded border border-neutral-100 p-2 text-sm">
                  <div className="flex justify-between text-xs text-neutral-400">
                    <span>{st ? `${st.sid} ${st.name}` : "—"}</span>
                    <span>{b.notedOn}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-neutral-700">{b.body}</p>
                  {b.keywords && b.keywords.length > 0 && (
                    <p className="mt-0.5 text-xs text-blue-600">#{b.keywords.join(" #")}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </main>
  );
}
