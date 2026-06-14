import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { listStudents, listCounselingLogs } from "@/lib/db/queries";
import {
  createCounselingAction,
  deleteCounselingAction,
} from "./actions";

export const dynamic = "force-dynamic";

const TARGET_LABEL: Record<string, string> = {
  student: "학생",
  parent: "학부모",
};

/**
 * 상담 화면 (계획 §4 Phase2-G). 학생/학부모 상담일지 기록.
 * AI 분석은 추후 기능 — 여기서는 '준비중' 목업 패널만 노출한다.
 */
export default async function CounselPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);

  const [students, logs] = await Promise.all([
    listStudents(db, ownerId, year),
    listCounselingLogs(db, ownerId),
  ]);
  const nameById = new Map(students.map((s) => [s.id, s]));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">상담 ({year})</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>

      <section className="mt-6 rounded-lg border border-neutral-200 p-5">
        <h2 className="text-sm font-semibold text-neutral-700">새 상담일지</h2>
        {students.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">
            먼저{" "}
            <Link href="/students" className="underline">
              학생 명단
            </Link>
            을 임포트하세요.
          </p>
        ) : (
          <form action={createCounselingAction} className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-3">
              <select
                name="studentYearId"
                required
                className="rounded border border-neutral-300 px-2 py-1 text-sm"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sid} {s.name}
                  </option>
                ))}
              </select>
              <select
                name="target"
                defaultValue="student"
                className="rounded border border-neutral-300 px-2 py-1 text-sm"
              >
                <option value="student">학생</option>
                <option value="parent">학부모</option>
              </select>
              <input
                type="date"
                name="date"
                defaultValue={today}
                className="rounded border border-neutral-300 px-2 py-1 text-sm"
              />
            </div>
            <textarea
              name="body"
              required
              rows={4}
              placeholder="상담 내용"
              className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700">
              상담일지 저장
            </button>
          </form>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4">
        <h2 className="text-sm font-semibold text-neutral-500">
          AI 상담 분석 <span className="text-xs font-normal">(준비중)</span>
        </h2>
        <p className="mt-1 text-xs text-neutral-400">
          누적된 상담일지를 바탕으로 한 요약·정서 신호 분석은 추후 제공됩니다.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-700">
          상담 기록 {logs.length}건
        </h2>
        {logs.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">아직 상담 기록이 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {logs.map((l) => {
              const st = nameById.get(l.studentYearId);
              return (
                <li
                  key={l.id}
                  className="rounded-lg border border-neutral-200 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {st ? `${st.sid} ${st.name}` : "(이전 연도 학생)"}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-neutral-400">
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5">
                        {TARGET_LABEL[l.target]}
                      </span>
                      <span>{l.date}</span>
                      <form action={deleteCounselingAction} className="inline">
                        <input type="hidden" name="id" value={l.id} />
                        <button className="text-red-500 hover:underline">
                          삭제
                        </button>
                      </form>
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-neutral-700">
                    {l.body}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
