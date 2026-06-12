"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  upsertPerformanceScores,
  upsertJipilScores,
  writeAudit,
  type SkippedRow,
} from "@/lib/db/queries";
import { parsePerformanceCsv, parseJipilCsv } from "@/lib/csv/grades";

/**
 * 성적 기록 서버액션 (교실 2-2 단계4). getOwnerId 가드 + 페이지범위 revalidate + audit.
 * CSV 텍스트(클라이언트가 파일→text 변환)를 받아 파싱→upsert 하고, 저장/스킵/경고를
 * UI로 반환한다. 파싱 형식오류 행도 합산해 결과에 노출(graceful, AC-G6).
 */

export interface GradeUploadState {
  ok: boolean;
  message?: string;
  saved?: number;
  skipped?: SkippedRow[];
  warnings?: string[];
  /** CSV 형식오류(행단위) 요약 — "N행: 메시지". */
  parseErrors?: string[];
}

function summarizeParseErrors(
  errors: { rowNumber: number; errors: { message: string }[] }[],
): string[] {
  return errors.map(
    (e) => `${e.rowNumber}행: ${e.errors.map((x) => x.message).join(", ")}`,
  );
}

/** 수행 항목별 CSV 업로드. */
export async function uploadPerformanceCsvAction(
  _prev: GradeUploadState | null,
  formData: FormData,
): Promise<GradeUploadState> {
  const ownerId = await getOwnerId();
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const itemName = String(formData.get("itemName") ?? "").trim();
  const csv = String(formData.get("csv") ?? "");
  if (!subjectId || !itemName) {
    return { ok: false, message: "과목·평가항목을 지정하세요." };
  }

  let parsed;
  try {
    parsed = parsePerformanceCsv(csv);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "CSV 오류" };
  }

  const db = getDb();
  const result = await upsertPerformanceScores(
    db,
    ownerId,
    subjectId,
    itemName,
    parsed.rows.map((r) => ({ sid: r.sid, score: r.score, prose: r.prose })),
  );
  await writeAudit(db, ownerId, "grade_upload", subjectId, {
    kind: "performance",
    itemName,
    saved: result.saved,
    skipped: result.skipped.length,
  });
  revalidatePath("/classroom/grades");

  return {
    ok: true,
    saved: result.saved,
    skipped: result.skipped,
    warnings: result.warnings,
    parseErrors: summarizeParseErrors(parsed.errors),
  };
}

/** 지필 과목×회차 CSV 업로드. ordinal 1=중간 2=기말. */
export async function uploadJipilCsvAction(
  _prev: GradeUploadState | null,
  formData: FormData,
): Promise<GradeUploadState> {
  const ownerId = await getOwnerId();
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const ordinalRaw = Number(formData.get("ordinal"));
  const ordinal: 1 | 2 = ordinalRaw === 2 ? 2 : 1;
  const csv = String(formData.get("csv") ?? "");
  if (!subjectId) {
    return { ok: false, message: "과목을 지정하세요." };
  }

  let parsed;
  try {
    parsed = parseJipilCsv(csv);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "CSV 오류" };
  }

  const db = getDb();
  let result;
  try {
    result = await upsertJipilScores(
      db,
      ownerId,
      subjectId,
      ordinal,
      parsed.rows.map((r) => ({ sid: r.sid, rawScore: r.rawScore })),
    );
  } catch (e) {
    // 미시행 회차 거부 등.
    return { ok: false, message: e instanceof Error ? e.message : "업로드 실패" };
  }
  await writeAudit(db, ownerId, "grade_upload", subjectId, {
    kind: "jipil",
    ordinal,
    saved: result.saved,
    skipped: result.skipped.length,
  });
  revalidatePath("/classroom/grades");

  return {
    ok: true,
    saved: result.saved,
    skipped: result.skipped,
    warnings: [],
    parseErrors: summarizeParseErrors(parsed.errors),
  };
}
