import "server-only";
import postgres from "postgres";
import { and, count, eq, sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { publicDatabaseUrl } from "@/lib/config/env";
import {
  upsertStudentElectiveMapping,
  reserveCounselSlot,
  requestCancelReservation,
  writeAudit,
} from "@/lib/db/queries";
import { sendToStudents, sendToTeacher } from "@/lib/push/send";
import { prefEnabled } from "@/lib/push/targeting";

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
    const url = publicDatabaseUrl();
    if (!url) throw new Error("공개 페이지용 DB 접속 정보가 없습니다(PUBLIC_DATABASE_URL/DATABASE_URL/POSTGRES_URL).");
    // idle_timeout 10분 — 재연결 비용 제거(지연 개선 ③, lib/db/index.ts 와 동일)
    const sql = postgres(url, { prepare: false, max: 2, idle_timeout: 600 });
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
  publicPageId: string;
}

/** 토큰 → 유효한 (student_year_id, owner_id, public_page_id). 폐기/만료/없음이면 null. */
async function resolveToken(
  db: PostgresJsDatabase<typeof schema>,
  token: string,
): Promise<ResolvedToken | null> {
  if (!token) return null;
  const rows = await db
    .select({
      id: schema.publicPages.id,
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
  return {
    studentYearId: row.studentYearId,
    ownerId: row.ownerId,
    publicPageId: row.id,
  };
}

export type StudentWriteResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * 학생 선택과목 자가매핑(토큰 스코프). 토큰의 학생 본인 (weekday, period) 행만 upsert.
 */
const SUBJECT_MAX = 50;

export async function saveElectiveMapping(
  token: string,
  weekday: number,
  period: number,
  mappedSubject: string,
): Promise<StudentWriteResult> {
  const subject = mappedSubject.trim();
  if (!subject) return { ok: false, message: "과목이 비어 있습니다." };
  if (subject.length > SUBJECT_MAX) {
    return { ok: false, message: `과목명은 ${SUBJECT_MAX}자 이내여야 합니다.` };
  }
  // weekday 1=월..7=일(schema/classes.ts), period 는 0(조회)~10 상한(미인증 표면 방어).
  if (
    !Number.isInteger(weekday) ||
    !Number.isInteger(period) ||
    weekday < 1 ||
    weekday > 7 ||
    period < 0 ||
    period > 10
  ) {
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
    await notifyTeacherCounsel(db, resolved, "상담 신청", `${date} 상담을 신청했습니다.`);
    return { ok: true };
  } catch (e) {
    // 정원 초과·중복 예약 등 의도된 안내만 통과. DB 내부 오류 문구는
    // 미인증 사용자에게 노출하지 않는다(정보 누출 방지).
    const msg = e instanceof Error ? e.message : "";
    return {
      ok: false,
      message: COUNSEL_USER_MESSAGES.has(msg) ? msg : "신청 실패",
    };
  }
}

/** reserveCounselSlot(lib/db/queries/counseling.ts)이 던지는 사용자 안내 메시지. */
const COUNSEL_USER_MESSAGES = new Set([
  "슬롯을 찾을 수 없습니다.",
  "이미 예약됨",
  "정원 초과",
]);

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
    await notifyTeacherCounsel(
      db,
      resolved,
      "상담 취소 요청",
      `${date} 상담 취소를 요청했습니다.`,
    );
    return { ok: true };
  } catch {
    return { ok: false, message: "취소 요청에 실패했습니다." };
  }
}

/**
 * 상담 신청/취소요청 성공 후 담임 교사에게 즉시 알림(T1/T2). 학생 이름만 노출하고
 * 사유·성적 등 민감정보는 담지 않는다. 이름 조회/발송 실패는 원 액션 결과에 영향을
 * 주지 않도록 전부 삼킨다(sendToTeacher 자체도 이미 no-throw).
 */
async function notifyTeacherCounsel(
  db: PostgresJsDatabase<typeof schema>,
  resolved: ResolvedToken,
  titleSuffix: string,
  body: string,
): Promise<void> {
  try {
    const [student] = await db
      .select({ name: schema.studentYears.name })
      .from(schema.studentYears)
      .where(eq(schema.studentYears.id, resolved.studentYearId))
      .limit(1);
    const name = student?.name ?? "";
    await sendToTeacher(db, resolved.ownerId, "instant", {
      title: `${name} 학생 ${titleSuffix}`,
      body,
      url: "/homeroom/counsel",
    });
  } catch {
    // 조회/발송 실패는 조용히 무시 — 상담 신청/취소 자체는 이미 성공.
  }
}

// ── 학생 개인 메모/일정(QC v6 ⑤, AC-5.4) ────────────────────────────────────
// 토큰 스코프 CRUD. **클라이언트가 보낸 studentYearId 는 절대 신뢰하지 않고**, 토큰에서
// 도출한 studentYearId 로만 쓰기·수정·삭제한다. 수정/삭제는 (id AND student_year_id) 조건이라
// 다른 학생의 메모에는 횡적으로 접근할 수 없다.

const MEMO_BODY_MAX = 2000;
const MEMO_COUNT_MAX = 500; // 학생당 상한 — 미인증 표면의 무한 insert 방지
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 메모 저장(토큰 스코프). id 미지정=신규 insert, id 지정=본인 메모 update.
 * 다른 학생 메모는 (id, student_year_id) 조건으로 차단.
 */
export async function saveStudentMemo(
  token: string,
  date: string,
  body: string,
  id?: string | null,
): Promise<StudentWriteResult> {
  const text = body.trim();
  if (!text) return { ok: false, message: "내용이 비어 있습니다." };
  if (text.length > MEMO_BODY_MAX) {
    return { ok: false, message: `내용은 ${MEMO_BODY_MAX}자 이내여야 합니다.` };
  }
  if (!DATE_RE.test(date)) {
    return { ok: false, message: "날짜가 올바르지 않습니다." };
  }
  const db = publicDb();
  const resolved = await resolveToken(db, token);
  if (!resolved) return { ok: false, message: "유효하지 않은 링크입니다." };
  try {
    if (id) {
      // 본인 메모만 수정(횡적 접근 차단). 다른 student_year_id 행이면 0 rows 갱신.
      await db
        .update(schema.studentCalendarMemos)
        .set({ date, body: text, updatedAt: new Date() })
        .where(
          and(
            eq(schema.studentCalendarMemos.id, id),
            eq(
              schema.studentCalendarMemos.studentYearId,
              resolved.studentYearId,
            ),
          ),
        );
    } else {
      const [{ cnt }] = await db
        .select({ cnt: count() })
        .from(schema.studentCalendarMemos)
        .where(
          eq(
            schema.studentCalendarMemos.studentYearId,
            resolved.studentYearId,
          ),
        );
      if (Number(cnt) >= MEMO_COUNT_MAX) {
        return {
          ok: false,
          message: `메모는 ${MEMO_COUNT_MAX}개까지 저장할 수 있습니다.`,
        };
      }
      await db.insert(schema.studentCalendarMemos).values({
        studentYearId: resolved.studentYearId,
        date,
        body: text,
      });
    }
    await writeAudit(db, resolved.ownerId, "student_memo_save", resolved.studentYearId, {
      date,
      id: id ?? null,
    });
    return { ok: true };
  } catch {
    return { ok: false, message: "저장에 실패했습니다." };
  }
}

/**
 * 공지 읽음 처리(토큰 스코프, v12). 이 학생이 해당 공지를 본 시각을 기록해 학생 페이지
 * New 배지를 끈다. (student_year_id, note_id) upsert 로 read_at=now 갱신 →
 * 교사가 나중에 공지를 수정(updated_at 갱신)하면 read_at < updated_at 이 되어 다시 New.
 * note 는 반드시 이 토큰 owner 소유 공지여야 한다(타 owner/없는 id 는 조용히 무시).
 * 감사로그는 남기지 않는다(조회 시마다 호출되는 고빈도 경로).
 */
export async function markNoticeRead(
  token: string,
  noteId: string,
): Promise<StudentWriteResult> {
  if (!noteId) return { ok: false, message: "대상이 지정되지 않았습니다." };
  const db = publicDb();
  const resolved = await resolveToken(db, token);
  if (!resolved) return { ok: false, message: "유효하지 않은 링크입니다." };
  try {
    // owner 스코프 확인 — 이 교사 소유의 공지만 읽음 처리(없거나 타 owner 면 no-op).
    const note = await db
      .select({ id: schema.teacherNotes.id })
      .from(schema.teacherNotes)
      .where(
        and(
          eq(schema.teacherNotes.id, noteId),
          eq(schema.teacherNotes.ownerId, resolved.ownerId),
        ),
      )
      .limit(1);
    if (!note[0]) return { ok: true }; // 없는/타owner 공지는 조용히 무시(오류 아님)
    await db
      .insert(schema.studentNoticeReads)
      .values({ studentYearId: resolved.studentYearId, noteId })
      .onConflictDoUpdate({
        target: [
          schema.studentNoticeReads.studentYearId,
          schema.studentNoticeReads.noteId,
        ],
        set: { readAt: new Date(), updatedAt: new Date() },
      });
    return { ok: true };
  } catch {
    return { ok: false, message: "읽음 처리에 실패했습니다." };
  }
}

/** 메모 삭제(토큰 스코프). (id, student_year_id) 조건으로 본인 메모만 삭제. */
export async function deleteStudentMemo(
  token: string,
  id: string,
): Promise<StudentWriteResult> {
  if (!id) return { ok: false, message: "대상이 지정되지 않았습니다." };
  const db = publicDb();
  const resolved = await resolveToken(db, token);
  if (!resolved) return { ok: false, message: "유효하지 않은 링크입니다." };
  try {
    await db
      .delete(schema.studentCalendarMemos)
      .where(
        and(
          eq(schema.studentCalendarMemos.id, id),
          eq(schema.studentCalendarMemos.studentYearId, resolved.studentYearId),
        ),
      );
    await writeAudit(db, resolved.ownerId, "student_memo_delete", resolved.studentYearId, { id });
    return { ok: true };
  } catch {
    return { ok: false, message: "삭제에 실패했습니다." };
  }
}

// ── 학생 웹푸시 알림(합의 계획 push-notifications, US-6) ──────────────────────
// 토큰 스코프 구독 등록/설정/테스트. 미인증 학생은 토큰만 보유 —
// service-role publicDb() 로 토큰→publicPageId 를 해석한 뒤 그 페이지의 학생 구독에만
// 쓴다. 발송 대상도 항상 확정된 publicPageId 1건으로 제한해 타 학생 교차 발송을 차단한다.

type StudentPrefKey = "s1" | "s2" | "s3";

export interface StudentPushState {
  subscribed: boolean;
  prefs: { s1: boolean; s2: boolean; s3: boolean };
}

/**
 * 이 기기(endpoint)의 구독 상태 조회(토큰 스코프). 구독은 기기별 1행이므로 판정은
 * 반드시 (publicPageId, endpoint) 기준 — 페이지 전체 기준이면 다른 기기에서 구독한
 * 학생이 새 기기에서 구독 버튼을 못 본다. 미구독/무효 토큰은 기본값(전부 켜짐) 반환.
 */
export async function getStudentPushState(
  token: string,
  endpoint: string | null,
): Promise<StudentPushState> {
  const fallback: StudentPushState = {
    subscribed: false,
    prefs: { s1: true, s2: true, s3: true },
  };
  if (!endpoint) return fallback;
  const db = publicDb();
  const resolved = await resolveToken(db, token);
  if (!resolved) return fallback;
  try {
    const rows = await db
      .select({ prefs: schema.pushSubscriptions.prefs })
      .from(schema.pushSubscriptions)
      .where(
        and(
          eq(schema.pushSubscriptions.audience, "student"),
          eq(schema.pushSubscriptions.publicPageId, resolved.publicPageId),
          eq(schema.pushSubscriptions.endpoint, endpoint),
        ),
      )
      .limit(1);
    if (!rows[0]) return fallback;
    const prefs = rows[0].prefs;
    return {
      subscribed: true,
      prefs: {
        s1: prefEnabled(prefs, "s1"),
        s2: prefEnabled(prefs, "s2"),
        s3: prefEnabled(prefs, "s3"),
      },
    };
  } catch {
    return fallback;
  }
}

/** 학생 푸시 구독 등록(토큰 스코프). (endpoint, audience) 유니크로 upsert. */
export async function registerStudentPush(
  token: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<StudentWriteResult> {
  const { endpoint } = subscription;
  const { p256dh, auth } = subscription.keys;
  if (!endpoint || !p256dh || !auth) {
    return { ok: false, message: "구독 정보가 올바르지 않습니다." };
  }
  const db = publicDb();
  const resolved = await resolveToken(db, token);
  if (!resolved) return { ok: false, message: "유효하지 않은 링크입니다." };
  try {
    await db
      .insert(schema.pushSubscriptions)
      .values({
        ownerId: resolved.ownerId,
        audience: "student",
        publicPageId: resolved.publicPageId,
        endpoint,
        p256dh,
        auth,
        prefs: { s1: true, s2: true, s3: true },
      })
      .onConflictDoUpdate({
        target: [
          schema.pushSubscriptions.endpoint,
          schema.pushSubscriptions.audience,
        ],
        set: {
          ownerId: resolved.ownerId,
          publicPageId: resolved.publicPageId,
          p256dh,
          auth,
          updatedAt: new Date(),
        },
      });
    await writeAudit(db, resolved.ownerId, "push_subscribe", resolved.studentYearId, {
      audience: "student",
    });
    return { ok: true };
  } catch {
    return { ok: false, message: "구독 등록에 실패했습니다." };
  }
}

/**
 * 알림 설정 토글(토큰 스코프). 이 페이지의 audience='student' 구독 전체 prefs[key] 갱신.
 * 같은 학생이 여러 기기에서 구독했을 수 있으므로 publicPageId 스코프로 일괄 반영한다.
 */
export async function updateStudentPushPrefs(
  token: string,
  key: StudentPrefKey,
  value: boolean,
): Promise<StudentWriteResult> {
  if (key !== "s1" && key !== "s2" && key !== "s3") {
    return { ok: false, message: "알 수 없는 설정입니다." };
  }
  const db = publicDb();
  const resolved = await resolveToken(db, token);
  if (!resolved) return { ok: false, message: "유효하지 않은 링크입니다." };
  try {
    await db
      .update(schema.pushSubscriptions)
      .set({
        prefs: sql`jsonb_set(coalesce(${schema.pushSubscriptions.prefs}, '{}'::jsonb), ${`{${key}}`}::text[], ${JSON.stringify(value)}::jsonb, true)`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.pushSubscriptions.audience, "student"),
          eq(schema.pushSubscriptions.publicPageId, resolved.publicPageId),
        ),
      );
    return { ok: true };
  } catch {
    return { ok: false, message: "설정 변경에 실패했습니다." };
  }
}

/**
 * 테스트 알림 발송(토큰 스코프). 반드시 확정된 publicPageId 1건만 대상 —
 * audience='student' 전체 발송 금지(타 학생 교차 발송 차단).
 */
export async function sendStudentTestPush(
  token: string,
): Promise<StudentWriteResult> {
  const db = publicDb();
  const resolved = await resolveToken(db, token);
  if (!resolved) return { ok: false, message: "유효하지 않은 링크입니다." };
  try {
    await sendToStudents(
      db,
      [{ publicPageId: resolved.publicPageId }],
      "test",
      {
        title: "테스트 알림",
        body: "정상 수신되면 설정이 완료된 것입니다.",
        url: `/p/${token}`,
      },
    );
    return { ok: true };
  } catch {
    return { ok: false, message: "테스트 발송에 실패했습니다." };
  }
}
