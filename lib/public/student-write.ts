import "server-only";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import {
  upsertStudentElectiveMapping,
  reserveCounselSlot,
  requestCancelReservation,
  writeAudit,
} from "@/lib/db/queries";

/**
 * 공개 페이지(미인증) 학생 쓰기 경로 — 토큰 스코프 service-role 어댑터
 * (QC v3 Part B, US-B13, AC-12.4/12.8).
 *
 * 읽기는 get_public_page(SECURITY DEFINER)가 전담하지만, 학생 자가매핑/상담신청은
 * 쓰기다. 클라이언트가 가진 것은 토큰뿐이므로, 이 모듈만이 service-role 권한으로
 * 토큰→(student_year_id, owner_id) 를 해석한 뒤 **그 학생 본인 행에 한해** upsert/insert
 * 한다. 폐기/만료/없음 토큰은 거부. 토큰은 절대 자유텍스트나 임의 owner 로 쓰지 않는다.
 *
 * 주의: PUBLIC_DATABASE_URL 은 service-role 권한 커넥션(RLS 우회). 인증 앱 표면과 분리.
 */
const globalForPublicWrite = globalThis as unknown as {
  _eduPublicWriteClient?: ReturnType<typeof postgres>;
  _eduPublicWriteDb?: PostgresJsDatabase<typeof schema>;
};

function publicDb(): PostgresJsDatabase<typeof schema> {
  if (!globalForPublicWrite._eduPublicWriteDb) {
    const url = process.env.PUBLIC_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("PUBLIC_DATABASE_URL(또는 DATABASE_URL) 미설정");
    const sql = postgres(url, { prepare: false, max: 2, idle_timeout: 20 });
    globalForPublicWrite._eduPublicWriteClient = sql;
    globalForPublicWrite._eduPublicWriteDb = drizzle(sql, {
      schema,
      casing: "snake_case",
    });
  }
  return globalForPublicWrite._eduPublicWriteDb;
}

interface ResolvedToken {
  studentYearId: string;
  ownerId: string;
}

/** 토큰 → 유효한 (student_year_id, owner_id). 폐기/만료/없음이면 null. */
async function resolveToken(
  db: PostgresJsDatabase<typeof schema>,
  token: string,
): Promise<ResolvedToken | null> {
  if (!token) return null;
  const rows = await db
    .select({
      studentYearId: schema.publicPages.studentYearId,
      ownerId: schema.publicPages.ownerId,
      revokedAt: schema.publicPages.revokedAt,
      expiresAt: schema.publicPages.expiresAt,
    })
    .from(schema.publicPages)
    .where(eq(schema.publicPages.token, token))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.revokedAt !== null) return null;
  if (row.expiresAt !== null && row.expiresAt <= new Date()) return null;
  return { studentYearId: row.studentYearId, ownerId: row.ownerId };
}

export type StudentWriteResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * 학생 선택과목 자가매핑(토큰 스코프). 토큰의 학생 본인 (weekday, period) 행만 upsert.
 */
export async function saveElectiveMapping(
  token: string,
  weekday: number,
  period: number,
  mappedSubject: string,
): Promise<StudentWriteResult> {
  const subject = mappedSubject.trim();
  if (!subject) return { ok: false, message: "과목이 비어 있습니다." };
  if (!Number.isInteger(weekday) || !Number.isInteger(period)) {
    return { ok: false, message: "요일/교시가 올바르지 않습니다." };
  }
  const db = publicDb();
  const resolved = await resolveToken(db, token);
  if (!resolved) return { ok: false, message: "유효하지 않은 링크입니다." };
  try {
    await upsertStudentElectiveMapping(
      db,
      resolved.ownerId,
      resolved.studentYearId,
      weekday,
      period,
      subject,
    );
    await writeAudit(db, resolved.ownerId, "elective_map_save", resolved.studentYearId, {
      weekday,
      period,
    });
    return { ok: true };
  } catch {
    return { ok: false, message: "저장에 실패했습니다." };
  }
}

/**
 * 상담 신청(토큰 스코프). 토큰의 학생 본인으로 슬롯 예약(선착순·중복방지).
 *
 * 공개 DTO 는 내부 slot id 를 노출하지 않으므로(allowlist), 학생은 **날짜**로 신청한다.
 * 슬롯 id 는 owner 스코프에서 (owner, date) 로 서버에서 해석한다.
 */
export async function reserveCounsel(
  token: string,
  date: string,
): Promise<StudentWriteResult> {
  if (!date) return { ok: false, message: "날짜가 지정되지 않았습니다." };
  const db = publicDb();
  const resolved = await resolveToken(db, token);
  if (!resolved) return { ok: false, message: "유효하지 않은 링크입니다." };

  const slots = await db
    .select({ id: schema.counselSlots.id })
    .from(schema.counselSlots)
    .where(
      and(
        eq(schema.counselSlots.ownerId, resolved.ownerId),
        eq(schema.counselSlots.date, date),
      ),
    )
    .limit(1);
  const slotId = slots[0]?.id;
  if (!slotId) return { ok: false, message: "해당 날짜의 상담 슬롯이 없습니다." };

  try {
    await reserveCounselSlot(db, resolved.ownerId, slotId, resolved.studentYearId);
    return { ok: true };
  } catch (e) {
    // 정원 초과·중복 예약 등은 안내 메시지로.
    return { ok: false, message: e instanceof Error ? e.message : "신청 실패" };
  }
}

/**
 * 상담 예약 취소 요청(토큰 스코프, AC-6.7). 본인 확정 예약의 취소를 '요청'만 한다
 * (cancel_requested=true). 실제 삭제·정원 환원은 교사 승인(approveCancelReservation)에서.
 *
 * 슬롯 id 는 공개 DTO 가 노출하지 않으므로 학생은 **날짜**로 요청하고, 서버가 (owner, date)
 * 로 슬롯을 해석한다(reserveCounsel 과 동일 패턴).
 */
export async function requestCounselCancel(
  token: string,
  date: string,
): Promise<StudentWriteResult> {
  if (!date) return { ok: false, message: "날짜가 지정되지 않았습니다." };
  const db = publicDb();
  const resolved = await resolveToken(db, token);
  if (!resolved) return { ok: false, message: "유효하지 않은 링크입니다." };

  const slots = await db
    .select({ id: schema.counselSlots.id })
    .from(schema.counselSlots)
    .where(
      and(
        eq(schema.counselSlots.ownerId, resolved.ownerId),
        eq(schema.counselSlots.date, date),
      ),
    )
    .limit(1);
  const slotId = slots[0]?.id;
  if (!slotId) return { ok: false, message: "해당 날짜의 상담 슬롯이 없습니다." };

  try {
    await requestCancelReservation(
      db,
      resolved.ownerId,
      slotId,
      resolved.studentYearId,
    );
    return { ok: true };
  } catch {
    return { ok: false, message: "취소 요청에 실패했습니다." };
  }
}
