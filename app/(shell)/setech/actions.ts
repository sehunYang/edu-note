"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import { buildSourceBundle, saveDraft, writeAudit } from "@/lib/db/queries";
import { buildSetechPrompt, verifyPastedDraft, type SetechWarning } from "@/lib/setech";
import { loadGuideline } from "@/lib/setech/guideline";
import type { SpecialNoteType } from "@/lib/domain/types";

/**
 * 세특 코워크 내보내기 서버액션 (계획 §4 C, AC-C). getOwnerId 가드.
 * 1) 프롬프트 번들 생성(원천 묶음 + 지침) 2) 붙여넣기 검수 후 저장.
 */
const VALID_TYPES: readonly SpecialNoteType[] = [
  "autonomy",
  "club",
  "career",
  "subject",
  "behavior",
];

export type BuildPromptResult =
  | { ok: true; prompt: string; studentName: string; sourceCount: number }
  | { ok: false; message: string };

export async function buildPromptAction(args: {
  studentYearId: string;
  noteType: SpecialNoteType;
  subjectId?: string | null;
}): Promise<BuildPromptResult> {
  try {
    const ownerId = await getOwnerId();
    if (!args.studentYearId || !VALID_TYPES.includes(args.noteType)) {
      return { ok: false, message: "학생과 유형을 선택하세요." };
    }
    const db = getDb();
    const bundle = await buildSourceBundle(
      db,
      ownerId,
      args.studentYearId,
      args.noteType,
      args.subjectId ?? null,
    );
    const guidelineText = await loadGuideline();
    const prompt = buildSetechPrompt(bundle, { guidelineText });
    const sourceCount =
      bundle.observations.length +
      bundle.performances.length +
      bundle.activities.length +
      bundle.extraNotes.length;
    return { ok: true, prompt, studentName: bundle.studentName, sourceCount };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "프롬프트 생성 실패" };
  }
}

export type SaveDraftActionResult =
  | {
      ok: true;
      byteCount: number;
      byteLimit: number;
      warnings: SetechWarning[];
    }
  | { ok: false; message: string; warnings: SetechWarning[] };

export async function saveDraftAction(args: {
  studentYearId: string;
  noteType: SpecialNoteType;
  subjectId?: string | null;
  content: string;
  studentName?: string;
}): Promise<SaveDraftActionResult> {
  try {
    const ownerId = await getOwnerId();
    if (!args.studentYearId || !VALID_TYPES.includes(args.noteType)) {
      return { ok: false, message: "학생과 유형을 선택하세요.", warnings: [] };
    }
    const verdict = verifyPastedDraft(args.content, args.noteType, args.studentName);
    if (!verdict.ok) {
      const blocking = verdict.warnings.find((w) => w.blocking);
      return {
        ok: false,
        message: blocking?.message ?? "검수에 걸려 저장할 수 없습니다.",
        warnings: verdict.warnings,
      };
    }
    const db = getDb();
    const saved = await saveDraft(db, ownerId, {
      studentYearId: args.studentYearId,
      noteType: args.noteType,
      subjectId: args.subjectId ?? null,
      content: args.content,
      studentName: args.studentName,
    });
    await writeAudit(db, ownerId, "setech_save", saved.id, {
      studentYearId: args.studentYearId,
      noteType: args.noteType,
      byteCount: saved.byteCount,
    });
    revalidatePath("/setech");
    return {
      ok: true,
      byteCount: saved.byteCount,
      byteLimit: saved.byteLimit,
      warnings: verdict.warnings, // 비차단 자문 경고는 저장 후에도 함께 표시
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "저장 실패",
      warnings: [],
    };
  }
}
