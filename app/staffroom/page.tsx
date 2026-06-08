import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { listTasks, listBudgets, listExpenses } from "@/lib/db/queries";
import {
  createTaskAction,
  updateTaskProgressAction,
  deleteTaskAction,
  createBudgetAction,
  deleteBudgetAction,
  addExpenseAction,
  deleteExpenseAction,
} from "./actions";

export const dynamic = "force-dynamic";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/**
 * 교무실(업무·예산) 화면 (계획 §4 Phase2-H). 마감 to-do + 진척, 영역별 예산·집행률.
 */
export default async function StaffroomPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const [tasks, budgets] = await Promise.all([
    listTasks(db, ownerId),
    listBudgets(db, ownerId),
  ]);
  const expenseLists = await Promise.all(
    budgets.map((b) => listExpenses(db, ownerId, b.id)),
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">교무실</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>

      {/* ── 업무 ── */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-neutral-700">업무</h2>
        <form
          action={createTaskAction}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <input
            name="title"
            required
            placeholder="업무 제목"
            className="flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm"
          />
          <input
            type="date"
            name="deadline"
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700">
            추가
          </button>
        </form>

        {tasks.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">등록된 업무가 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tasks.map((t) => {
              const overdue =
                t.deadline !== null && t.deadline < today && t.progress < 100;
              return (
                <li
                  key={t.id}
                  className="rounded-lg border border-neutral-200 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {t.title}
                      {t.deadline && (
                        <span
                          className={`ml-2 text-xs ${overdue ? "text-red-500" : "text-neutral-400"}`}
                        >
                          마감 {t.deadline}
                          {overdue ? " (지남)" : ""}
                        </span>
                      )}
                    </span>
                    <form action={deleteTaskAction} className="inline">
                      <input type="hidden" name="id" value={t.id} />
                      <button className="text-xs text-red-500 hover:underline">
                        삭제
                      </button>
                    </form>
                  </div>
                  <form
                    action={updateTaskProgressAction}
                    className="mt-2 flex items-center gap-2"
                  >
                    <input type="hidden" name="id" value={t.id} />
                    <input
                      type="number"
                      name="progress"
                      min={0}
                      max={100}
                      defaultValue={t.progress}
                      className="w-20 rounded border border-neutral-300 px-2 py-1 text-sm"
                    />
                    <span className="text-xs text-neutral-400">% 진척</span>
                    <button className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">
                      저장
                    </button>
                    <div className="ml-2 h-1.5 flex-1 overflow-hidden rounded bg-neutral-100">
                      <div
                        className="h-full bg-neutral-700"
                        style={{ width: `${t.progress}%` }}
                      />
                    </div>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── 예산 ── */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold text-neutral-700">예산</h2>
        <form
          action={createBudgetAction}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <input
            name="area"
            required
            placeholder="예산 영역(예: 동아리 운영비)"
            className="flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm"
          />
          <input
            type="number"
            name="plannedAmount"
            min={0}
            placeholder="계획액(원)"
            className="w-32 rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700">
            추가
          </button>
        </form>

        {budgets.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">등록된 예산이 없습니다.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {budgets.map((b, i) => {
              const expenses = expenseLists[i];
              const remaining = b.plannedAmount - b.spent;
              const rate =
                b.plannedAmount > 0
                  ? Math.min(100, Math.round((b.spent / b.plannedAmount) * 100))
                  : 0;
              return (
                <div
                  key={b.id}
                  className="rounded-lg border border-neutral-200 p-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{b.area}</h3>
                    <form action={deleteBudgetAction} className="inline">
                      <input type="hidden" name="id" value={b.id} />
                      <button className="text-xs text-red-500 hover:underline">
                        삭제
                      </button>
                    </form>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    계획 {won(b.plannedAmount)} · 집행 {won(b.spent)} (
                    {rate}%) ·{" "}
                    <span className={remaining < 0 ? "text-red-500" : ""}>
                      잔액 {won(remaining)}
                    </span>
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-neutral-100">
                    <div
                      className={`h-full ${rate >= 100 ? "bg-red-400" : "bg-neutral-700"}`}
                      style={{ width: `${rate}%` }}
                    />
                  </div>

                  {expenses.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {expenses.map((e) => (
                        <li
                          key={e.id}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span>
                            <span className="text-neutral-400">{e.date}</span>{" "}
                            {won(e.amount)}
                            {e.memo && (
                              <span className="ml-2 text-xs text-neutral-400">
                                {e.memo}
                              </span>
                            )}
                          </span>
                          <form action={deleteExpenseAction} className="inline">
                            <input type="hidden" name="id" value={e.id} />
                            <button className="text-xs text-red-400 hover:underline">
                              제거
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}

                  <form
                    action={addExpenseAction}
                    className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3"
                  >
                    <input type="hidden" name="budgetId" value={b.id} />
                    <input
                      type="date"
                      name="date"
                      defaultValue={today}
                      className="rounded border border-neutral-300 px-2 py-1 text-sm"
                    />
                    <input
                      type="number"
                      name="amount"
                      min={0}
                      required
                      placeholder="금액(원)"
                      className="w-28 rounded border border-neutral-300 px-2 py-1 text-sm"
                    />
                    <input
                      name="memo"
                      placeholder="메모(선택)"
                      className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
                    />
                    <button className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50">
                      지출 추가
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
