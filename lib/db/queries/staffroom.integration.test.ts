import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { tasks, budgets, budgetExpenses } from "../schema/misc";
import {
  createTask,
  listTasks,
  updateTaskProgress,
  deleteTask,
} from "./tasks";
import {
  createBudget,
  listBudgets,
  addExpense,
  listExpenses,
  deleteBudget,
} from "./budget";

/**
 * 교무실(업무·예산) 실DB 통합 테스트 (Phase2-H).
 * 업무 진척 클램프, 마감순 정렬, 예산 집행 누계 집계, cascade 삭제.
 */
const RUN = process.env.RUN_DB_ITEST === "1" && !!process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const owner = randomUUID();

describe.skipIf(!RUN)("교무실 — 업무/예산", () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await db.delete(budgetExpenses).where(eq(budgetExpenses.ownerId, owner));
    await db.delete(budgets).where(eq(budgets.ownerId, owner));
    await db.delete(tasks).where(eq(tasks.ownerId, owner));
    await sql.end();
  });

  it("업무 진척은 0~100 으로 클램프되고 마감 임박순 정렬", async () => {
    await createTask(db, owner, { title: "늦은 업무", deadline: "2099-12-31" });
    await createTask(db, owner, { title: "임박 업무", deadline: "2099-01-01" });
    const noDeadline = await createTask(db, owner, { title: "기한없음" });

    await updateTaskProgress(db, owner, noDeadline.id, 150); // 클램프 → 100
    const list = await listTasks(db, owner);
    expect(list[0].title).toBe("임박 업무"); // 가장 이른 마감
    expect(list[list.length - 1].deadline).toBeNull(); // null 은 뒤로
    const clamped = list.find((t) => t.id === noDeadline.id)!;
    expect(clamped.progress).toBe(100);
  });

  it("업무 삭제", async () => {
    const t = await createTask(db, owner, { title: "삭제될 업무" });
    await deleteTask(db, owner, t.id);
    const list = await listTasks(db, owner);
    expect(list.find((x) => x.id === t.id)).toBeUndefined();
  });

  it("예산 집행 누계 집계 + 잔액 계산", async () => {
    const b = await createBudget(db, owner, "동아리 운영비", 100000);
    await addExpense(db, owner, {
      budgetId: b.id,
      date: "2099-03-01",
      amount: 30000,
      memo: "재료비",
    });
    await addExpense(db, owner, {
      budgetId: b.id,
      date: "2099-03-05",
      amount: 20000,
    });

    const list = await listBudgets(db, owner);
    const row = list.find((x) => x.id === b.id)!;
    expect(row.plannedAmount).toBe(100000);
    expect(row.spent).toBe(50000); // 30000 + 20000
    expect(row.plannedAmount - row.spent).toBe(50000); // 잔액

    const expenses = await listExpenses(db, owner, b.id);
    expect(expenses).toHaveLength(2);
    expect(expenses[0].date).toBe("2099-03-01"); // 날짜순
  });

  it("예산 삭제 시 지출도 cascade 삭제", async () => {
    const b = await createBudget(db, owner, "삭제될예산", 10000);
    await addExpense(db, owner, {
      budgetId: b.id,
      date: "2099-03-01",
      amount: 5000,
    });
    await deleteBudget(db, owner, b.id);
    const remaining = await db
      .select({ id: budgetExpenses.id })
      .from(budgetExpenses)
      .where(eq(budgetExpenses.budgetId, b.id));
    expect(remaining).toHaveLength(0);
  });
});
