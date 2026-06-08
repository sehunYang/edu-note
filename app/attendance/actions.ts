"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  upsertAttendance,
  setReportSubmitted,
  deleteAttendance,
  addFieldTripReport,
  setFieldTripSubmitted,
  recomputeEscalation,
  writeAudit,
} from "@/lib/db/queries";
import type { AttendanceReason, AttendanceKind } from "@/lib/domain/types";

/**
 * 출결 서버액션 (계획 §4 F). getOwnerId 가드 + audit. reportRequired 파생과
 * report_tracking 동기화는 쿼리 계층(upsertAttendance)에서 수행한다.
 */
const REASONS: readonly AttendanceReason[] = [
  "illness",
  "accepted",
  "unaccepted",
  "etc",
];
const KINDS: readonly AttendanceKind[] = [
  "late",
  "early_leave",
  "absent_period",
  "absent",
];

export async function recordAttendanceAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const studentYearId = String(formData.get("studentYearId") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const reason = String(formData.get("reason") ?? "") as AttendanceReason;
  const kind = String(formData.get("kind") ?? "") as AttendanceKind;
  const noteField = String(formData.get("noteField") ?? "").trim() || null;
  if (!studentYearId || !date || !REASONS.includes(reason) || !KINDS.includes(kind)) {
    return;
  }

  const db = getDb();
  const row = await upsertAttendance(db, ownerId, {
    studentYearId,
    date,
    reason,
    kind,
    noteField,
  });
  await writeAudit(db, ownerId, "attendance_record", row.id, {
    studentYearId,
    date,
    reason,
    kind,
    reportRequired: row.reportRequired,
  });
  revalidatePath("/attendance");
}

export async function toggleReportSubmittedAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  const submitted = String(formData.get("submitted") ?? "") === "true";
  if (!id) return;
  const db = getDb();
  await setReportSubmitted(db, ownerId, id, submitted);
  await writeAudit(db, ownerId, "report_submit", id, { submitted });
  revalidatePath("/attendance");
}

export async function deleteAttendanceAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const db = getDb();
  await deleteAttendance(db, ownerId, id);
  revalidatePath("/attendance");
}

/** 교외체험 사후보고서 추적 시작. */
export async function addFieldTripAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const studentYearId = String(formData.get("studentYearId") ?? "").trim();
  const tripDate = String(formData.get("tripDate") ?? "").trim();
  if (!studentYearId || !tripDate) return;
  const db = getDb();
  const trip = await addFieldTripReport(db, ownerId, { studentYearId, tripDate });
  await writeAudit(db, ownerId, "field_trip_record", trip.id, {
    studentYearId,
    tripDate,
  });
  revalidatePath("/attendance");
}

/** 교외체험 사후보고서 제출 여부 마킹. */
export async function toggleFieldTripAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  const submitted = String(formData.get("submitted") ?? "") === "true";
  if (!id) return;
  const db = getDb();
  await setFieldTripSubmitted(db, ownerId, id, submitted);
  revalidatePath("/attendance");
}

/** 신고서 에스컬레이션 즉시 재계산(수업일 기준 티어 갱신 + 전이 감사). */
export async function recomputeEscalationAction(): Promise<void> {
  const ownerId = await getOwnerId();
  const db = getDb();
  await recomputeEscalation(db, ownerId);
  revalidatePath("/attendance");
}
