"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  generateSemesterSessions,
  setProgressStatus,
  markSessionDone,
  getPlanForSession,
  listSectionsForSemester,
  writeAudit,
  type PlanForSession,
} from "@/lib/db/queries";
import type { SessionStatus } from "@/lib/domain/types";

/**
 * 수업 진척도 서버액션 (교실 2-2 단계3). getOwnerId 가드 + 페이지범위 revalidate + audit.
 * 핵심개념(keywords)은 콤마/공백 구분 입력을 배열로 정규화한다.
 */
function parseKeywords(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((k) => k.replace(/^#/, "").trim())
    .filter((k) => k.length > 0);
}

/** 활성 학기 분반들에 학기 전체 차시 생성/정리. */
export async function generateSessionsAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const year = Number(formData.get("year"));
  const sem = formData.get("semester") === "2" ? 2 : 1;
  if (!Number.isInteger(year)) return;

  const db = getDb();
  const sections = await listSectionsForSemester(db, ownerId, year, sem as 1 | 2);
  let generated = 0;
  let removed = 0;
  for (const sec of sections) {
    const r = await generateSemesterSessions(
      db,
      ownerId,
      sec.sectionId,
      year,
      sem as 1 | 2,
    );
    generated += r.generated;
    removed += r.removed;
  }
  await writeAudit(db, ownerId, "session_generate", null, {
    scope: "semester",
    year,
    semester: sem,
    generated,
    removed,
  });
  revalidatePath("/classroom/progress");
}

const VALID_STATUS: SessionStatus[] = ["planned", "done", "not_held"];

/** 차시 상태 토글(예정/미진행/완료). */
export async function setProgressStatusAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const status = String(formData.get("status") ?? "") as SessionStatus;
  if (!sessionId || !VALID_STATUS.includes(status)) return;

  const db = getDb();
  await setProgressStatus(db, ownerId, sessionId, status);
  await writeAudit(db, ownerId, "progress_record", sessionId, { status });
  revalidatePath("/classroom/progress");
}

/** 완료 처리 + 실제수업내용·핵심개념·평가아이디어 저장. */
export async function saveDoneRecordAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  if (!sessionId) return;

  const actualContent = String(formData.get("actualContent") ?? "");
  const keywords = parseKeywords(String(formData.get("keywords") ?? ""));
  const evalIdea = String(formData.get("evalIdea") ?? "");
  const planOrdinalRaw = formData.get("planOrdinal");
  const planOrdinal =
    planOrdinalRaw != null && String(planOrdinalRaw).trim() !== ""
      ? Number(planOrdinalRaw)
      : null;

  const db = getDb();
  await markSessionDone(db, ownerId, sessionId, {
    actualContent,
    keywords,
    evalIdea,
    planOrdinal,
  });
  await writeAudit(db, ownerId, "progress_record", sessionId, {
    done: true,
    keywords: keywords.length,
    planOrdinal,
  });
  revalidatePath("/classroom/progress");
}

/** 토글 불러오기 — 차시의 날짜순위 k → 과목 계획 ordinal k 내용. */
export async function loadPlanForSessionAction(
  sessionId: string,
): Promise<PlanForSession | null> {
  const ownerId = await getOwnerId();
  if (!sessionId) return null;
  const db = getDb();
  return getPlanForSession(db, ownerId, sessionId);
}
