"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  setSubjectExamBoundary,
  generatePlannedSessions,
  setSessionStatus,
  listSectionsWithProgress,
  writeAudit,
} from "@/lib/db/queries";
import type { SessionStatus } from "@/lib/domain/types";

/**
 * 시수 서버액션 (계획 §3.3 B·N3). 전부 getOwnerId 가드.
 */
export type GenState =
  | { ok: true; generated: number; sections: number; skipped: number }
  | { ok: false; message: string }
  | null;

/** 시험경계일이 설정된 모든 분반의 차시를 생성/갱신. */
export async function generateAllAction(
  _prev: GenState,
  _formData: FormData,
): Promise<GenState> {
  try {
    const ownerId = await getOwnerId();
    const db = getDb();
    const year = new Date().getFullYear();
    const sections = await listSectionsWithProgress(db, ownerId, year);
    let generated = 0;
    let done = 0;
    let skipped = 0;
    for (const s of sections) {
      try {
        const r = await generatePlannedSessions(db, ownerId, s.sectionId);
        generated += r.generated;
        done += 1;
      } catch {
        skipped += 1; // 경계 미설정·시간표 없음 등은 건너뜀
      }
    }
    await writeAudit(db, ownerId, "session_generate", null, {
      generated,
      sections: done,
      skipped,
    });
    revalidatePath("/sessions");
    return { ok: true, generated, sections: done, skipped };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "생성 실패" };
  }
}

/** 과목 시험경계일 설정(빈 값이면 해제). */
export async function setBoundaryAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const subjectId = String(formData.get("subjectId"));
  const raw = String(formData.get("date") ?? "").trim();
  const db = getDb();
  await setSubjectExamBoundary(db, ownerId, subjectId, raw.length > 0 ? raw : null);
  revalidatePath("/sessions");
}

/** 차시 상태 변경(완료/미진행/예정). */
export async function setStatusAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const sessionId = String(formData.get("sessionId"));
  const status = String(formData.get("status")) as SessionStatus;
  const db = getDb();
  await setSessionStatus(db, ownerId, sessionId, status);
  revalidatePath("/sessions");
}
