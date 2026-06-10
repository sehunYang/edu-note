"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import { parseStudentRoster, type RowError } from "@/lib/csv";
import { importStudentRoster, writeAudit } from "@/lib/db/queries";

/**
 * CSV 명단 임포트 서버액션 (C4 세팅실로 이관). getOwnerId() 가드 + audit + revalidate.
 * 학번 5자리에서 학년/반/번호 자동 산출(parseStudentRoster).
 */
export type ImportState =
  | { ok: true; created: number; updated: number; errors: RowError[] }
  | { ok: false; message: string }
  | null;

export async function importRosterAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  try {
    const ownerId = await getOwnerId();
    const csv = String(formData.get("csv") ?? "");
    const year = Number(formData.get("year")) || new Date().getFullYear();
    if (!csv.trim()) return { ok: false, message: "CSV 내용이 비어 있습니다." };

    const parsed = parseStudentRoster(csv);
    const db = getDb();
    const res = await importStudentRoster(db, ownerId, year, parsed.rows);
    await writeAudit(db, ownerId, "csv_import", null, {
      year,
      created: res.created,
      updated: res.updated,
      errorRows: parsed.errors.length,
    });
    revalidatePath("/setting", "layout");
    return {
      ok: true,
      created: res.created,
      updated: res.updated,
      errors: parsed.errors,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "임포트 실패" };
  }
}
