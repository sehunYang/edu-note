import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { budgets, budgetExpenses } from "../schema/misc";

/**
 * 예산 쿼리 계층 (계획 §3.3 budgets/budget_expenses, §4 Phase2-H).
 * 영역별 계획액 + 지출 누계(집행률). numeric 은 드라이버에서 string 으로 들어오므로
 * 표시/계산용 number 로 환산해 반환한다.
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface BudgetRow {
  id: string;
  area: string;
  plannedAmount: number;
  spent: number; // 지출 누계
  createdAt: Date;
}

function toNum(v: string | number | null): number {
  if (v === null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 예산 영역 생성. */
export async function createBudget(
  db: DB,
  ownerId: string,
  area: string,
  plannedAmount: number,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(budgets)
    .values({ ownerId, area, plannedAmount: String(plannedAmount) })
    .returning({ id: budgets.id });
  return row;
}

/** 예산 목록(지출 누계 포함). 최신순. */
export async function listBudgets(
  db: DB,
  ownerId: string,
): Promise<BudgetRow[]> {
  const rows = await db
    .select({
      id: budgets.id,
      area: budgets.area,
      plannedAmount: budgets.plannedAmount,
      spent: sql<string>`coalesce(sum(${budgetExpenses.amount}), 0)`,
      createdAt: budgets.createdAt,
    })
    .from(budgets)
    .leftJoin(
      budgetExpenses,
      and(
        eq(budgetExpenses.budgetId, budgets.id),
        eq(budgetExpenses.ownerId, ownerId),
      ),
    )
    .where(eq(budgets.ownerId, ownerId))
    .groupBy(budgets.id)
    .orderBy(desc(budgets.createdAt));
  return rows.map((r) => ({
    id: r.id,
    area: r.area,
    plannedAmount: toNum(r.plannedAmount),
    spent: toNum(r.spent),
    createdAt: r.createdAt,
  }));
}

/** 예산 삭제(소유자 본인 행만). 지출은 FK cascade 로 함께 삭제. */
export async function deleteBudget(
  db: DB,
  ownerId: string,
  id: string,
): Promise<void> {
  await db
    .delete(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.ownerId, ownerId)));
}

export interface ExpenseRow {
  id: string;
  budgetId: string;
  date: string;
  amount: number;
  memo: string | null;
}

export interface AddExpenseInput {
  budgetId: string;
  date: string;
  amount: number;
  memo?: string | null;
}

/** 지출 추가. */
export async function addExpense(
  db: DB,
  ownerId: string,
  input: AddExpenseInput,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(budgetExpenses)
    .values({
      ownerId,
      budgetId: input.budgetId,
      date: input.date,
      amount: String(input.amount),
      memo: input.memo ?? null,
    })
    .returning({ id: budgetExpenses.id });
  return row;
}

/** 예산별 지출 목록(지출일 오름차순). */
export async function listExpenses(
  db: DB,
  ownerId: string,
  budgetId: string,
): Promise<ExpenseRow[]> {
  const rows = await db
    .select({
      id: budgetExpenses.id,
      budgetId: budgetExpenses.budgetId,
      date: budgetExpenses.date,
      amount: budgetExpenses.amount,
      memo: budgetExpenses.memo,
    })
    .from(budgetExpenses)
    .where(
      and(
        eq(budgetExpenses.ownerId, ownerId),
        eq(budgetExpenses.budgetId, budgetId),
      ),
    )
    .orderBy(asc(budgetExpenses.date));
  return rows.map((r) => ({ ...r, amount: toNum(r.amount) }));
}

/** 지출 삭제(소유자 본인 행만). */
export async function deleteExpense(
  db: DB,
  ownerId: string,
  id: string,
): Promise<void> {
  await db
    .delete(budgetExpenses)
    .where(
      and(eq(budgetExpenses.id, id), eq(budgetExpenses.ownerId, ownerId)),
    );
}
