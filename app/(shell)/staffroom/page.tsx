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
import { Button } from "@/app/ui/button";
import { CountUp } from "@/app/ui/count-up";
import { ConfirmButton } from "@/app/ui/confirm-button";
import { kstDateString } from "@/lib/domain/kst";
import { RoomHeader } from "@/app/ui/room-header";

export const metadata = { title: "교무실" };

export const dynamic = "force-dynamic";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/**
 * 교무실(업무·예산) 화면 (계획 §4 Phase2-H). 마감 to-do + 진척, 영역별 예산·집행률.
 */
export default async function StaffroomPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const today = kstDateString();

  const [tasks, budgets] = await Promise.all([
    listTasks(db, ownerId),
    listBudgets(db, ownerId),
  ]);
  const expenseLists = await Promise.all(
    budgets.map((b) => listExpenses(db, ownerId, b.id)),
  );

  return (
    <>
      <RoomHeader icon="🗂️" title="교무실" />

      {/* ── 업무 ── */}
      <section className="mt-5">
        <h2 className="text-sm text-neutral-700">업무</h2>
        <form
          action={createTaskAction}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <input aria-label="업무 제목"
            name="title"
            required
            placeholder="업무 제목"
            className="w-full min-w-0 rounded border border-neutral-300 px-3 py-1.5 text-sm sm:w-auto sm:flex-1"
          />
          <input aria-label="업무 마감일"
            type="date"
            name="deadline"
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <Button className="px-3 py-1.5 text-sm">
            추가
          </Button>
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
                    <span className="font-normal">
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
                      <ConfirmButton
                        message={`업무 '${t.title}' 을(를) 삭제할까요? 되돌릴 수 없습니다.`}
                        className="text-xs text-red-500 hover:underline"
                      >
                        삭제
                      </ConfirmButton>
                    </form>
                  </div>
                  <form
                    action={updateTaskProgressAction}
                    className="mt-2 flex items-center gap-2"
                  >
                    <input type="hidden" name="id" value={t.id} />
                    <input aria-label="진행률(%)"
                      type="number"
                      name="progress"
                      min={0}
                      max={100}
                      defaultValue={t.progress}
                      className="w-20 rounded border border-neutral-300 px-2 py-1 text-sm"
                    />
                    <span className="text-xs text-neutral-400">% 진척</span>
                    <Button className="px-2 py-1 text-xs">
                      저장
                    </Button>
                    <div className="ml-2 h-1.5 flex-1 overflow-hidden rounded bg-neutral-100">
                      <div
                        className="h-full bg-neutral-700 transition-[width] duration-500"
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
        <h2 className="text-sm text-neutral-700">예산</h2>
        <form
          action={createBudgetAction}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <input aria-label="예산 영역(예: 동아리 운영비)"
            name="area"
            required
            placeholder="예산 영역(예: 동아리 운영비)"
            className="w-full min-w-0 rounded border border-neutral-300 px-3 py-1.5 text-sm sm:w-auto sm:flex-1"
          />
          <input aria-label="계획액(원)"
            type="number"
            name="plannedAmount"
            min={0}
            placeholder="계획액(원)"
            className="w-32 rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <Button className="px-3 py-1.5 text-sm">
            추가
          </Button>
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
                    <h3>{b.area}</h3>
                    <form action={deleteBudgetAction} className="inline">
                      <input type="hidden" name="id" value={b.id} />
                      <ConfirmButton
                        message={`예산 '${b.area}' 을(를) 삭제할까요? 등록된 지출 내역도 함께 사라집니다.`}
                        className="text-xs text-red-500 hover:underline"
                      >
                        삭제
                      </ConfirmButton>
                    </form>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    계획 {won(b.plannedAmount)} · 집행 {won(b.spent)} (
                    <CountUp value={rate} suffix="%" />) ·{" "}
                    <span className={remaining < 0 ? "text-red-500" : ""}>
                      잔액 {won(remaining)}
                    </span>
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-neutral-100">
                    <div
                      className={`h-full transition-[width] duration-500 ${rate >= 100 ? "bg-red-400" : "bg-neutral-700"}`}
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
                    <input aria-label="지출 날짜"
                      type="date"
                      name="date"
                      defaultValue={today}
                      className="rounded border border-neutral-300 px-2 py-1 text-sm"
                    />
                    <input aria-label="금액(원)"
                      type="number"
                      name="amount"
                      min={0}
                      required
                      placeholder="금액(원)"
                      className="w-28 rounded border border-neutral-300 px-2 py-1 text-sm"
                    />
                    <input aria-label="메모(선택)"
                      name="memo"
                      placeholder="메모(선택)"
                      className="w-full min-w-0 rounded border border-neutral-300 px-2 py-1 text-sm sm:w-auto sm:flex-1"
                    />
                    <Button className="px-3 py-1 text-sm">
                      지출 추가
                    </Button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
