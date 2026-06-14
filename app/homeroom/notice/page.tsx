import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { getPublicNotice, listNoticeEvents } from "@/lib/db/queries";
import {
  setNoticeAction,
  addNoticeEventAction,
  deleteNoticeEventAction,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * 공지실 (계획 §4 Phase2-I). 학생 공개 페이지(/p/[token])에 표시되는 공통 안내 관리.
 *  - 교사 한마디(공통): 모든 공개 페이지 상단에 노출
 *  - 이번 주 할 일: 7일 내 항목이 공개 페이지에 표시
 * 공개 페이지는 allowlist DTO 만 통과하므로, 민감 정보는 입력하지 않는다.
 */
export default async function NoticePage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const [notice, events] = await Promise.all([
    getPublicNotice(db, ownerId),
    listNoticeEvents(db, ownerId),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">공지실</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>
      <p className="mt-2 text-xs text-neutral-400">
        여기서 설정한 내용은 학생별 공개 페이지(<code>/p/…</code>)에 그대로 노출됩니다.
        민감한 개인정보는 입력하지 마세요.
      </p>

      {/* ── 교사 한마디(공통) ── */}
      <section className="mt-6 rounded-lg border border-neutral-200 p-5">
        <h2 className="text-sm font-semibold text-neutral-700">
          교사 한마디 (공통)
        </h2>
        <form action={setNoticeAction} className="mt-3 space-y-3">
          <textarea
            name="notice"
            rows={3}
            defaultValue={notice ?? ""}
            placeholder="모든 학생 공개 페이지 상단에 표시할 안내 문구"
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700">
            저장
          </button>
        </form>
      </section>

      {/* ── 이번 주 할 일 / 공지 ── */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-700">할 일 / 공지</h2>
        <p className="mt-1 text-xs text-neutral-400">
          공개 페이지에는 오늘부터 7일 이내 항목이 “이번 주 할 일”로 표시됩니다.
        </p>
        <form
          action={addNoticeEventAction}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <input
            type="date"
            name="date"
            defaultValue={today}
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <input
            name="title"
            required
            placeholder="공지/할 일 제목"
            className="flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm"
          />
          <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700">
            추가
          </button>
        </form>

        {events.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">등록된 공지가 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {events.map((e) => {
              const upcoming = e.date >= today;
              return (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 p-3 text-sm"
                >
                  <span>
                    <span
                      className={`mr-2 text-xs ${upcoming ? "text-neutral-500" : "text-neutral-300"}`}
                    >
                      {e.date}
                    </span>
                    {e.title}
                    {!upcoming && (
                      <span className="ml-2 text-xs text-neutral-300">(지난 항목)</span>
                    )}
                  </span>
                  <form action={deleteNoticeEventAction} className="inline">
                    <input type="hidden" name="id" value={e.id} />
                    <button className="text-xs text-red-500 hover:underline">
                      삭제
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
