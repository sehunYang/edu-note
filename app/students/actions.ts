"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import { parseStudentRoster, type RowError } from "@/lib/csv";
import {
  importStudentRoster,
  reissuePublicPage,
  revokePublicPage,
  writeAudit,
} from "@/lib/db/queries";

/**
 * 학생 명단 서버액션 (계획 §3.2/§4 A·I). getOwnerId() 가 로그인+allowlist 를
 * 강제하고, 쿼리 계층에 본인 ownerId 를 주입한다. 모든 쓰기는 audit_log 에 남긴다.
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
    const year =
      Number(formData.get("year")) || new Date().getFullYear();
    if (!csv.trim()) return { ok: false, message: "CSV 내용이 비어 있습니다." };

    const parsed = parseStudentRoster(csv); // 헤더 누락 시 throw → catch
    const db = getDb();
    const res = await importStudentRoster(db, ownerId, year, parsed.rows);
    await writeAudit(db, ownerId, "csv_import", null, {
      year,
      created: res.created,
      updated: res.updated,
      errorRows: parsed.errors.length,
    });
    revalidatePath("/students");
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

/** 학생 공개 링크 발급(기존 활성 토큰은 폐기 후 재발급 — CSV 재배포). */
export async function issueTokenAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const studentYearId = String(formData.get("studentYearId"));
  const db = getDb();
  const issued = await reissuePublicPage(db, ownerId, studentYearId);
  await writeAudit(db, ownerId, "token_reissue", issued.id, { studentYearId });
  revalidatePath("/students");
}

/** 공개 링크 폐기. */
export async function revokeTokenAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const pageId = String(formData.get("pageId"));
  const db = getDb();
  await revokePublicPage(db, ownerId, pageId);
  await writeAudit(db, ownerId, "token_revoke", pageId);
  revalidatePath("/students");
}
