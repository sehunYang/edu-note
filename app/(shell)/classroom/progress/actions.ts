"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  generateSemesterSessions,
  setProgressStatus,
  setSessionMakeup,
  listSectionsForSemester,
  writeAudit,
} from "@/lib/db/queries";
import type { SessionStatus } from "@/lib/domain/types";

/**
 * 수업 진척도 서버액션 (교실 2-2 단계3, QC v5 c2 재설계). getOwnerId 가드 +
 * 페이지범위 revalidate + audit. 차시 수행체크 기록 폼(완료 기록 입력)은 폐기됐고,
 * 진도는 done 차시의 마지막 단원에서 자동 도출된다(AC-2.1/AC-2.2).
 */

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

/**
 * 결손 차시 보강일 설정/해제 (기능갭 #3). 빈 값이면 지정 해제(미회복으로 되돌림).
 * 날짜 형식이 어긋나면 조용히 무시한다(다른 액션과 동일 방어).
 */
export async function setSessionMakeupAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  if (!sessionId) return;

  const rawDate = String(formData.get("makeupDate") ?? "").trim();
  if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return;
  const makeupDate = rawDate || null;

  const rawNote = String(formData.get("makeupNote") ?? "").trim();
  // 보강일을 지우면 메모도 같이 지운다 — 날짜 없는 보강 메모는 의미가 없다.
  const makeupNote = makeupDate ? rawNote.slice(0, 200) || null : null;

  const db = getDb();
  await setSessionMakeup(db, ownerId, sessionId, makeupDate, makeupNote);
  await writeAudit(db, ownerId, "progress_record", sessionId, {
    makeupDate,
    cleared: makeupDate === null,
  });
  revalidatePath("/classroom/progress");
}
