"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  createTask,
  updateTaskProgress,
  deleteTask,
  createBudget,
  deleteBudget,
  addExpense,
  deleteExpense,
  writeAudit,
} from "@/lib/db/queries";
import { kstDateString } from "@/lib/domain/kst";

/**
 * 교무실(업무·예산) 서버액션 (계획 §4 Phase2-H). 전부 getOwnerId 가드 + audit.
 */

// ── 업무 ──
export async function createTaskAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const title = String(formData.get("title") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim() || null;
  if (!title) return;
  const db = getDb();
  const t = await createTask(db, ownerId, { title, deadline });
  await writeAudit(db, ownerId, "task_upsert", t.id, { title, deadline });
  revalidatePath("/staffroom");
}

export async function updateTaskProgressAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  const progress = Number(formData.get("progress"));
  if (!id || Number.isNaN(progress)) return;
  const db = getDb();
  await updateTaskProgress(db, ownerId, id, progress);
  await writeAudit(db, ownerId, "task_upsert", id, { progress });
  revalidatePath("/staffroom");
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const db = getDb();
  await deleteTask(db, ownerId, id);
  await writeAudit(db, ownerId, "task_delete", id);
  revalidatePath("/staffroom");
}

// ── 예산 ──
export async function createBudgetAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const area = String(formData.get("area") ?? "").trim();
  const plannedAmount = Number(formData.get("plannedAmount")) || 0;
  if (!area) return;
  const db = getDb();
  const b = await createBudget(db, ownerId, area, plannedAmount);
  await writeAudit(db, ownerId, "budget_upsert", b.id, { area, plannedAmount });
  revalidatePath("/staffroom");
}

export async function deleteBudgetAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const db = getDb();
  await deleteBudget(db, ownerId, id);
  await writeAudit(db, ownerId, "budget_delete", id);
  revalidatePath("/staffroom");
}

export async function addExpenseAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const budgetId = String(formData.get("budgetId") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const date =
    String(formData.get("date") ?? "").trim() || kstDateString();
  const memo = String(formData.get("memo") ?? "").trim() || null;
  if (!budgetId || Number.isNaN(amount)) return;
  const db = getDb();
  const e = await addExpense(db, ownerId, { budgetId, date, amount, memo });
  await writeAudit(db, ownerId, "expense_add", e.id, { budgetId, amount });
  revalidatePath("/staffroom");
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const db = getDb();
  await deleteExpense(db, ownerId, id);
  await writeAudit(db, ownerId, "expense_delete", id);
  revalidatePath("/staffroom");
}
