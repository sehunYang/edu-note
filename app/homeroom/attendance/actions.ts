"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  upsertAttendance,
  setReportSubmitted,
  deleteAttendance,
  updateAttendanceRecord,
  addFieldTrip,
  addAbsenceRange,
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

  // 교시 입력: 지각/조퇴=기점 라디오(pivotPeriod), 결과=다중 체크박스(periods).
  const pivotPeriod = Number(formData.get("pivotPeriod") ?? 0) || 0;
  const selectedPeriods = formData
    .getAll("periods")
    .map((p) => Number(p))
    .filter((p) => Number.isInteger(p));

  const db = getDb();
  const row = await upsertAttendance(db, ownerId, {
    studentYearId,
    date,
    reason,
    kind,
    noteField,
    pivotPeriod,
    selectedPeriods,
  });
  await writeAudit(db, ownerId, "attendance_period_record", row.id, {
    studentYearId,
    date,
    reason,
    kind,
    periods: row.periods,
    reportRequired: row.reportRequired,
  });
  revalidatePath("/homeroom/attendance");
}

export async function toggleReportSubmittedAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  const submitted = String(formData.get("submitted") ?? "") === "true";
  if (!id) return;
  const db = getDb();
  await setReportSubmitted(db, ownerId, id, submitted);
  await writeAudit(db, ownerId, "report_submit", id, { submitted });
  revalidatePath("/homeroom/attendance");
}

export async function deleteAttendanceAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const db = getDb();
  await deleteAttendance(db, ownerId, id);
  revalidatePath("/homeroom/attendance");
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 출결 기록 수정(AC-4.5). 사유/성격/비고/교시 갱신 + reportRequired 재파생. */
export async function updateAttendanceAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "") as AttendanceReason;
  const kind = String(formData.get("kind") ?? "") as AttendanceKind;
  const noteField = String(formData.get("noteField") ?? "").trim() || null;
  if (!id || !REASONS.includes(reason) || !KINDS.includes(kind)) return;
  const db = getDb();
  await updateAttendanceRecord(db, ownerId, id, { reason, kind, noteField });
  revalidatePath("/homeroom/attendance");
}

/** 결석 기간 입력(AC-4.4). 범위 내 수업일마다 결석 자동 생성. */
export async function addAbsenceRangeAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const studentYearId = String(formData.get("studentYearId") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim() || startDate;
  const reason = String(formData.get("reason") ?? "") as AttendanceReason;
  const noteField = String(formData.get("noteField") ?? "").trim() || null;
  if (
    !studentYearId ||
    !DATE_RE.test(startDate) ||
    !DATE_RE.test(endDate) ||
    !REASONS.includes(reason)
  ) {
    return;
  }
  const db = getDb();
  await addAbsenceRange(db, ownerId, studentYearId, startDate, endDate, reason, noteField);
  revalidatePath("/homeroom/attendance");
}

/** 교외체험학습 추가(AC-4.2). 기간 내 수업일마다 인정결석 자동 생성 + 사후보고서 추적. */
export async function addFieldTripAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const studentYearId = String(formData.get("studentYearId") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endRaw = String(formData.get("endDate") ?? "").trim();
  const endDate = endRaw || null;
  if (!studentYearId || !DATE_RE.test(startDate)) return;
  if (endDate && !DATE_RE.test(endDate)) return;
  const db = getDb();
  await addFieldTrip(db, ownerId, studentYearId, startDate, endDate);
  revalidatePath("/homeroom/attendance");
}

/** 교외체험 사후보고서 제출 여부 마킹. */
export async function toggleFieldTripAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const id = String(formData.get("id") ?? "").trim();
  const submitted = String(formData.get("submitted") ?? "") === "true";
  if (!id) return;
  const db = getDb();
  await setFieldTripSubmitted(db, ownerId, id, submitted);
  revalidatePath("/homeroom/attendance");
}

/** 신고서 에스컬레이션 즉시 재계산(수업일 기준 티어 갱신 + 전이 감사). */
export async function recomputeEscalationAction(): Promise<void> {
  const ownerId = await getOwnerId();
  const db = getDb();
  await recomputeEscalation(db, ownerId);
  revalidatePath("/homeroom/attendance");
}
