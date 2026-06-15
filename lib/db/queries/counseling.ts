import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { counselingLogs, counselSlots, counselReservations } from "../schema/misc";
import { writeAudit } from "./audit";

/**
 * 상담일지 쿼리 계층 (계획 §3.3 counseling_logs, §4 Phase2-G).
 *
 * 학생/학부모 상담 기록(줄글). AI 분석 컬럼은 추후 — Phase 2 는 목업 UI 만 제공한다.
 */
type DB = PostgresJsDatabase<typeof schema>;

export type CounselTarget = "student" | "parent";

export interface CreateCounselingInput {
  studentYearId: string;
  date: string; // YYYY-MM-DD
  target: CounselTarget;
  body: string;
}

export interface CounselingRow {
  id: string;
  studentYearId: string;
  date: string;
  target: CounselTarget;
  body: string;
  createdAt: Date;
}

/** 상담일지 작성. 생성된 행 반환. */
export async function createCounselingLog(
  db: DB,
  ownerId: string,
  input: CreateCounselingInput,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(counselingLogs)
    .values({
      ownerId,
      studentYearId: input.studentYearId,
      date: input.date,
      target: input.target,
      body: input.body,
    })
    .returning({ id: counselingLogs.id });
  return row;
}

/** 상담일지 목록(학생별 또는 전체). 최신 상담일순. */
export async function listCounselingLogs(
  db: DB,
  ownerId: string,
  studentYearId?: string,
): Promise<CounselingRow[]> {
  const where = studentYearId
    ? and(
        eq(counselingLogs.ownerId, ownerId),
        eq(counselingLogs.studentYearId, studentYearId),
      )
    : eq(counselingLogs.ownerId, ownerId);

  const rows = await db
    .select({
      id: counselingLogs.id,
      studentYearId: counselingLogs.studentYearId,
      date: counselingLogs.date,
      target: counselingLogs.target,
      body: counselingLogs.body,
      createdAt: counselingLogs.createdAt,
    })
    .from(counselingLogs)
    .where(where)
    .orderBy(desc(counselingLogs.date), desc(counselingLogs.createdAt));

  return rows.map((r) => ({ ...r, target: r.target as CounselTarget }));
}

/** 상담일지 삭제(소유자 본인 행만). */
export async function deleteCounselingLog(
  db: DB,
  ownerId: string,
  id: string,
): Promise<void> {
  await db
    .delete(counselingLogs)
    .where(
      and(eq(counselingLogs.id, id), eq(counselingLogs.ownerId, ownerId)),
    );
}

// ── AC-9.2: 상담일지 수정 ──────────────────────────────────────────────────

export interface UpdateCounselingInput {
  date?: string;
  target?: CounselTarget;
  body?: string;
}

/**
 * 상담일지 본문·날짜·대상 수정. 소유자 본인 행만. audit counsel_record_update.
 */
export async function updateCounselingLog(
  db: DB,
  ownerId: string,
  id: string,
  input: UpdateCounselingInput,
): Promise<void> {
  await db
    .update(counselingLogs)
    .set({
      ...(input.date !== undefined && { date: input.date }),
      ...(input.target !== undefined && { target: input.target }),
      ...(input.body !== undefined && { body: input.body }),
    })
    .where(
      and(eq(counselingLogs.id, id), eq(counselingLogs.ownerId, ownerId)),
    );
  await writeAudit(db, ownerId, "counsel_record_update", id);
}

// ── AC-9.3: 슬롯 예약 시스템 ────────────────────────────────────────────────

export interface CounselSlotRow {
  id: string;
  date: string;
  capacity: number;
  reservedCount: number;
  remaining: number;
}

export interface CounselReservationRow {
  id: string;
  slotId: string;
  studentYearId: string;
  date: string;
  cancelRequested: boolean;
  createdAt: Date;
}

/**
 * 상담 슬롯 개설(upsert — 날짜당 1개, unique(ownerId,date)).
 * 이미 존재하면 capacity 만 갱신. audit counsel_slot_open.
 */
export async function openCounselSlot(
  db: DB,
  ownerId: string,
  date: string,
  capacity: number,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(counselSlots)
    .values({ ownerId, date, capacity })
    .onConflictDoUpdate({
      target: [counselSlots.ownerId, counselSlots.date],
      set: { capacity },
    })
    .returning({ id: counselSlots.id });
  await writeAudit(db, ownerId, "counsel_slot_open", row.id, { date, capacity });
  return row;
}

/**
 * 상담 슬롯 폐쇄(삭제). 예약은 cascade 삭제. audit counsel_slot_close.
 */
export async function closeCounselSlot(
  db: DB,
  ownerId: string,
  slotId: string,
): Promise<void> {
  await db
    .delete(counselSlots)
    .where(and(eq(counselSlots.id, slotId), eq(counselSlots.ownerId, ownerId)));
  await writeAudit(db, ownerId, "counsel_slot_close", slotId);
}

/**
 * 슬롯 목록 + 슬롯별 예약 수·잔여 정원. fromDate 지정 시 해당 날짜 이후만.
 */
export async function listCounselSlots(
  db: DB,
  ownerId: string,
  fromDate?: string,
): Promise<CounselSlotRow[]> {
  const reservedCounts = db
    .select({
      slotId: counselReservations.slotId,
      cnt: count(counselReservations.id).as("cnt"),
    })
    .from(counselReservations)
    .groupBy(counselReservations.slotId)
    .as("rc");

  const where = fromDate
    ? and(eq(counselSlots.ownerId, ownerId), gte(counselSlots.date, fromDate))
    : eq(counselSlots.ownerId, ownerId);

  const rows = await db
    .select({
      id: counselSlots.id,
      date: counselSlots.date,
      capacity: counselSlots.capacity,
      reservedCount: sql<number>`coalesce(${reservedCounts.cnt}, 0)`,
    })
    .from(counselSlots)
    .leftJoin(reservedCounts, eq(reservedCounts.slotId, counselSlots.id))
    .where(where)
    .orderBy(counselSlots.date);

  return rows.map((r) => ({
    ...r,
    reservedCount: Number(r.reservedCount),
    remaining: r.capacity - Number(r.reservedCount),
  }));
}

/**
 * 예약 목록(슬롯별 또는 전체). slotId 지정 시 해당 슬롯만.
 */
export async function listCounselReservations(
  db: DB,
  ownerId: string,
  slotId?: string,
): Promise<CounselReservationRow[]> {
  const where = slotId
    ? and(
        eq(counselReservations.ownerId, ownerId),
        eq(counselReservations.slotId, slotId),
      )
    : eq(counselReservations.ownerId, ownerId);

  const rows = await db
    .select({
      id: counselReservations.id,
      slotId: counselReservations.slotId,
      studentYearId: counselReservations.studentYearId,
      date: counselSlots.date,
      cancelRequested: counselReservations.cancelRequested,
      createdAt: counselReservations.createdAt,
    })
    .from(counselReservations)
    .innerJoin(counselSlots, eq(counselSlots.id, counselReservations.slotId))
    .where(where)
    .orderBy(counselSlots.date, counselReservations.createdAt);

  return rows;
}

/**
 * 학생 상담 예약(선착순·중복방지).
 *
 * 검사 순서:
 *  1. 슬롯 존재 확인(ownerId 일치) + **FOR UPDATE 행잠금**.
 *  2. 이미 예약 여부 확인 → 이미 예약됨 throw.
 *  3. 잔여 정원 확인 → 정원 초과 throw.
 *  4. insert — unique(slot_id, student_year_id) 가 중복을 잡는다.
 *
 * 동시성: 같은 슬롯에 대한 예약은 1단계 FOR UPDATE 로 직렬화되므로(같은 슬롯 행을
 * 잠금) 두 학생이 마지막 한 자리를 동시에 신청해도 정원 초과가 발생하지 않는다.
 * 중복(같은 학생 재신청)은 unique 제약이 추가 방어한다.
 */
export async function reserveCounselSlot(
  db: DB,
  ownerId: string,
  slotId: string,
  studentYearId: string,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    // 1. 슬롯 존재 확인 + 행잠금(동시 예약 직렬화 — 정원 경쟁 방어)
    const [slot] = await tx
      .select({ id: counselSlots.id, capacity: counselSlots.capacity })
      .from(counselSlots)
      .where(
        and(eq(counselSlots.id, slotId), eq(counselSlots.ownerId, ownerId)),
      )
      .for("update");
    if (!slot) throw new Error("슬롯을 찾을 수 없습니다.");

    // 2. 중복 예약 확인
    const [existing] = await tx
      .select({ id: counselReservations.id })
      .from(counselReservations)
      .where(
        and(
          eq(counselReservations.slotId, slotId),
          eq(counselReservations.studentYearId, studentYearId),
        ),
      );
    if (existing) throw new Error("이미 예약됨");

    // 3. 잔여 정원 확인
    const [{ cnt }] = await tx
      .select({ cnt: count(counselReservations.id) })
      .from(counselReservations)
      .where(eq(counselReservations.slotId, slotId));
    if (Number(cnt) >= slot.capacity) throw new Error("정원 초과");

    // 4. 예약 삽입 — unique constraint 가 동시 경쟁 방어
    const [row] = await tx
      .insert(counselReservations)
      .values({ ownerId, slotId, studentYearId })
      .returning({ id: counselReservations.id });

    await writeAudit(tx as unknown as DB, ownerId, "counsel_reserve", row.id, {
      slotId,
      studentYearId,
    });
    return row;
  });
}

/**
 * 예약 취소(소유자 본인 행만). audit counsel_cancel.
 */
export async function cancelReservation(
  db: DB,
  ownerId: string,
  reservationId: string,
): Promise<void> {
  await db
    .delete(counselReservations)
    .where(
      and(
        eq(counselReservations.id, reservationId),
        eq(counselReservations.ownerId, ownerId),
      ),
    );
  await writeAudit(db, ownerId, "counsel_cancel", reservationId);
}

// ── AC-6.7: 학생 취소요청 → 교사 승인 ──────────────────────────────────────

/**
 * 학생 본인 예약의 취소요청 플래그 설정(토큰 스코프에서 호출). (slotId, studentYearId)
 * 본인 행만. 교사가 별도로 승인(approve)해야 실제 삭제(정원 환원)된다.
 */
export async function requestCancelReservation(
  db: DB,
  ownerId: string,
  slotId: string,
  studentYearId: string,
): Promise<void> {
  await db
    .update(counselReservations)
    .set({ cancelRequested: true, updatedAt: new Date() })
    .where(
      and(
        eq(counselReservations.ownerId, ownerId),
        eq(counselReservations.slotId, slotId),
        eq(counselReservations.studentYearId, studentYearId),
      ),
    );
  await writeAudit(db, ownerId, "counsel_cancel_request", slotId, {
    studentYearId,
  });
}

/**
 * 교사 취소요청 승인 — 예약 행 삭제(정원 환원) + 캘린더 자동 반영(get_public_page 가
 * 예약을 weekTodos 에 합류시키므로, 삭제만으로 캘린더에서도 제거된다). 본인 소유만.
 * audit counsel_cancel_approve.
 */
export async function approveCancelReservation(
  db: DB,
  ownerId: string,
  reservationId: string,
): Promise<void> {
  await db
    .delete(counselReservations)
    .where(
      and(
        eq(counselReservations.id, reservationId),
        eq(counselReservations.ownerId, ownerId),
        eq(counselReservations.cancelRequested, true),
      ),
    );
  await writeAudit(db, ownerId, "counsel_cancel_approve", reservationId);
}
