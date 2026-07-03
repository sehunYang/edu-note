"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  createCounselingLog,
  deleteCounselingLog,
  updateCounselingLog,
  openCounselSlot,
  closeCounselSlot,
  reserveCounselSlot,
  cancelReservation,
  approveCancelReservation,
  writeAudit,
  type CounselTarget,
} from "@/lib/db/queries";
import { parseCsvRecords } from "@/lib/csv/parse";
import { studentExtraNotes } from "@/lib/db/schema/records";

/**
 * 상담실 서버액션 (US-B9, AC-9.2/9.3/9.5).
 * 상담 본문은 민감 정보 — audit detail 에 본문 미기록.
 */
const VALID_TARGETS: readonly CounselTarget[] = ["student", "parent"];

// ── 상담일지 CRUD ──────────────────────────────────────────────────────────

export async function createCounselingAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const studentYearId = String(formData.get("studentYearId") ?? "").trim();
  const target = String(formData.get("target") ?? "") as CounselTarget;
  const date =
    String(formData.get("date") ?? "").trim() ||
    new Date().toISOString().slice(0, 10);
  const body = String(formData.get("body") ?? "").trim();
  if (!studentYearId || !VALID_TARGETS.includes(target) || !body) return;

  const db = getDb();
  const row = await createCounselingLog(db, ownerId, {
    studentYearId,
    date,
    target,
    body,
  });
  await writeAudit(db, ownerId, "counseling_create", row.id, {
    studentYearId,
    target,
    date,
  });
  revalidatePath("/homeroom/counsel");
}

export async function deleteCounselingAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const db = getDb();
  await deleteCounselingLog(db, ownerId, id);
  await writeAudit(db, ownerId, "counseling_delete", id);
  revalidatePath("/homeroom/counsel");
}

/** AC-9.2: 상담일지 수정 — 인라인 편집 폼에서 호출. */
export async function updateCounselingAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const target = String(formData.get("target") ?? "") as CounselTarget;
  const date = String(formData.get("date") ?? "").trim();
  if (!id) return;

  const db = getDb();
  await updateCounselingLog(db, ownerId, id, {
    ...(body && { body }),
    ...(VALID_TARGETS.includes(target) && { target }),
    ...(date && { date }),
  });
  revalidatePath("/homeroom/counsel");
}

// ── AC-9.3: 슬롯 관리 ─────────────────────────────────────────────────────

export async function openSlotAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const date = String(formData.get("date") ?? "").trim();
  const capacity = parseInt(String(formData.get("capacity") ?? "1"), 10);
  if (!date || isNaN(capacity) || capacity < 1) return;

  const db = getDb();
  await openCounselSlot(db, ownerId, date, capacity);
  revalidatePath("/homeroom/counsel");
}

export async function closeSlotAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const slotId = String(formData.get("slotId") ?? "").trim();
  if (!slotId) return;

  const db = getDb();
  await closeCounselSlot(db, ownerId, slotId);
  revalidatePath("/homeroom/counsel");
}

export async function reserveSlotAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const slotId = String(formData.get("slotId") ?? "").trim();
  const studentYearId = String(formData.get("studentYearId") ?? "").trim();
  if (!slotId || !studentYearId) return;

  const db = getDb();
  try {
    await reserveCounselSlot(db, ownerId, slotId, studentYearId);
  } catch {
    // 정원 초과·중복 예약 — 클라이언트 revalidate 만 수행(에러 전파 생략)
  }
  revalidatePath("/homeroom/counsel");
}

export async function cancelReservationAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const reservationId = String(formData.get("reservationId") ?? "").trim();
  if (!reservationId) return;

  const db = getDb();
  await cancelReservation(db, ownerId, reservationId);
  revalidatePath("/homeroom/counsel");
}

/**
 * AC-6.7: 학생 취소요청 승인 — 예약 삭제(정원 환원) + 캘린더 반영.
 * cancel_requested=true 인 본인 예약만 삭제된다(approveCancelReservation 가드).
 */
export async function approveCancelAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getOwnerId();
  const reservationId = String(formData.get("reservationId") ?? "").trim();
  if (!reservationId) return;

  const db = getDb();
  await approveCancelReservation(db, ownerId, reservationId);
  revalidatePath("/homeroom/counsel");
}

// ── AC-9.5: 코워크 CSV 원천자료 내보내기 (서버에서 CSV 문자열 생성) ─────────

/** CSV 셀 이스케이프. */
function csvCell(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/**
 * 상담일지를 코워크 CSV 원천자료로 직렬화한다.
 * 컬럼: 학번, 이름, 날짜, 대상, 상담내용
 */
export async function getCounselCsvAction(
  year: number,
): Promise<string> {
  const ownerId = await getOwnerId();
  const db = getDb();

  const { listCounselingLogs } = await import("@/lib/db/queries");
  const { listHomeroomStudents } = await import("@/lib/db/queries/observations");

  const [students, logs] = await Promise.all([
    listHomeroomStudents(db, ownerId, year),
    listCounselingLogs(db, ownerId),
  ]);

  const nameMap = new Map(students.map((s) => [s.id, s]));
  const TARGET_KO: Record<string, string> = { student: "학생", parent: "학부모" };

  const header = ["학번", "이름", "날짜", "대상", "상담내용"].join(",");
  const rows = logs
    .filter((l) => nameMap.has(l.studentYearId))
    .map((l) => {
      const st = nameMap.get(l.studentYearId)!;
      return [
        csvCell(st.sid),
        csvCell(st.name),
        csvCell(l.date),
        csvCell(TARGET_KO[l.target] ?? l.target),
        csvCell(l.body),
      ].join(",");
    });

  return [header, ...rows].join("\r\n");
}

// ── AC-9.5: 코워크 CSV 결과 업로드 처리 ──────────────────────────────────────
/**
 * 코워크 AI 분석 결과 CSV를 파싱해 studentExtraNotes(subjectId=null)에 저장한다.
 *
 * 저장 위치 선택 근거:
 *  - studentExtraNotes 는 subjectId nullable — 담임 상담 분석처럼 교과 무관 메모를 수용한다.
 *  - US-B12 생기부 행발 행특 작성 시 extraNotes 로 원천자료에 합류한다(setech.ts buildSourceBundle 참조).
 *  - 별도 테이블 추가 없이 기존 구조 재사용 — Phase 1 단순성 유지.
 *
 * 기대 CSV 헤더: 학번, 이름, 분석결과
 * (코워크 결과 CSV를 학번 키로 studentExtraNotes 에 upsert-like 삽입)
 */
export async function importCounselCsvAction(
  formData: FormData,
): Promise<{ imported: number; errors: string[] }> {
  const ownerId = await getOwnerId();
  const file = formData.get("file");
  if (!(file instanceof File)) return { imported: 0, errors: ["파일이 없습니다."] };

  const text = await file.text();
  const db = getDb();
  const year = new Date().getFullYear();

  const { listHomeroomStudents } = await import("@/lib/db/queries/observations");
  const students = await listHomeroomStudents(db, ownerId, year);
  const sidMap = new Map(students.map((s) => [s.sid, s.id]));

  const { headers, records } = parseCsvRecords(text);
  const REQUIRED = ["학번", "분석결과"];
  const missing = REQUIRED.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return { imported: 0, errors: [`CSV 헤더 오류: ${missing.join(", ")} 누락`] };
  }

  const errors: string[] = [];
  let imported = 0;

  for (const row of records) {
    const sid = (row.values["학번"] ?? "").trim();
    const content = (row.values["분석결과"] ?? "").trim();
    if (!sid || !content) continue;

    const studentYearId = sidMap.get(sid);
    if (!studentYearId) {
      errors.push(`학번 ${sid} 미매칭`);
      continue;
    }

    await db.insert(studentExtraNotes).values({
      ownerId,
      studentYearId,
      subjectId: null, // 담임 상담 분석 — 교과 무관
      body: `[상담분석] ${content}`,
    });
    await writeAudit(db, ownerId, "csv_import", studentYearId, { type: "counsel_analysis" });
    imported++;
  }

  revalidatePath("/homeroom/counsel");
  return { imported, errors };
}
