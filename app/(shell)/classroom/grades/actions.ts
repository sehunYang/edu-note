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

/** 표에서 직접 고친 셀 1개. */
export interface InlineGradeEdit {
  sid: string;
  /** 지필이면 회차(1=중간, 2=기말), 수행이면 항목명. */
  kind: "jipil" | "performance";
  ordinal?: 1 | 2;
  itemName?: string;
  /** 빈 문자열이면 입력 취소로 보고 저장하지 않는다. */
  value: string;
}

/**
 * 환산 미리보기 표 인라인 저장 (사용성 개선 P2-12).
 *
 * 이전에는 성적 입력 경로가 CSV 업로드뿐이라, 학생 1명의 점수 하나를 고치려 해도
 * 예시 다운로드 → 엑셀 편집 → 업로드의 3단계 왕복이 필요했다. 표에서 고친 셀만
 * 모아 기존 upsert 경로(CSV 와 동일한 검증·환산)를 그대로 태운다.
 */
export async function saveInlineGradesAction(
  _prev: GradeUploadState | null,
  formData: FormData,
): Promise<GradeUploadState> {
  const ownerId = await getOwnerId();
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  if (!subjectId) return { ok: false, message: "과목을 지정하세요." };

  let edits: InlineGradeEdit[];
  try {
    edits = JSON.parse(String(formData.get("edits") ?? "[]"));
  } catch {
    return { ok: false, message: "변경 내용을 읽지 못했습니다." };
  }
  if (!Array.isArray(edits) || edits.length === 0) {
    return { ok: false, message: "변경된 셀이 없습니다." };
  }

  // 숫자로 해석되지 않는 셀은 저장하지 않고 그대로 돌려준다(무음 실패 방지).
  const parseErrors: string[] = [];
  const valid = edits.filter((e) => {
    const n = Number(e.value);
    if (e.value.trim() === "" || Number.isNaN(n)) {
      parseErrors.push(`${e.sid}: '${e.value}' 는 숫자가 아닙니다`);
      return false;
    }
    return true;
  });
  if (valid.length === 0) {
    return { ok: false, message: "저장할 수 있는 값이 없습니다.", parseErrors };
  }

  // 기존 CSV 업로드와 같은 upsert 를 쓰되, 같은 (회차/항목) 끼리 묶어 호출을 줄인다.
  const jipilByOrdinal = new Map<1 | 2, { sid: string; rawScore: number }[]>();
  // 표에서는 점수 칸만 편집한다. prose 는 입력값이 없으므로 null 을 넘기되,
  // upsert 에 preserveProse 를 켜서 이미 저장된 서술형 평가를 덮어쓰지 않는다.
  const perfByItem = new Map<
    string,
    { sid: string; score: number; prose: null }[]
  >();
  for (const e of valid) {
    if (e.kind === "jipil") {
      const ord: 1 | 2 = e.ordinal === 2 ? 2 : 1;
      if (!jipilByOrdinal.has(ord)) jipilByOrdinal.set(ord, []);
      jipilByOrdinal.get(ord)!.push({ sid: e.sid, rawScore: Number(e.value) });
    } else if (e.itemName) {
      if (!perfByItem.has(e.itemName)) perfByItem.set(e.itemName, []);
      perfByItem
        .get(e.itemName)!
        .push({ sid: e.sid, score: Number(e.value), prose: null });
    }
  }

  const db = getDb();
  let saved = 0;
  const skipped: SkippedRow[] = [];
  const warnings: string[] = [];

  try {
    for (const [ordinal, rows] of jipilByOrdinal) {
      const r = await upsertJipilScores(db, ownerId, subjectId, ordinal, rows);
      saved += r.saved;
      skipped.push(...r.skipped);
    }
    for (const [itemName, rows] of perfByItem) {
      const r = await upsertPerformanceScores(
        db,
        ownerId,
        subjectId,
        itemName,
        rows,
        { preserveProse: true },
      );
      saved += r.saved;
      skipped.push(...r.skipped);
      warnings.push(...r.warnings);
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "저장 실패" };
  }

  await writeAudit(db, ownerId, "grade_upload", subjectId, {
    kind: "inline",
    cells: valid.length,
    saved,
  });
  revalidatePath("/classroom/grades");

  return { ok: true, saved, skipped, warnings, parseErrors };
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
