import "server-only";
import webpush from "web-push";
import { and, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { writeAudit } from "@/lib/db/queries";
import { prefEnabled } from "./targeting";
import { getOrCreateVapidKeys } from "@/lib/config/secrets";

/**
 * 웹푸시 발송 유틸 (합의 계획 push-notifications, US-2).
 *
 * 무해성 원칙: VAPID env(3종) 중 하나라도 미설정이면 모든 발송 함수가 throw 없이
 * no-op 로 조용히 반환한다. 개별 발송도 절대 throw 하지 않는다 — 한 구독 실패가
 * 트리거 경로(서버액션/크론)를 무너뜨리면 안 되기 때문. 404/410(구독 폐기)이면
 * 해당 행을 정리한다.
 */
type DB = PostgresJsDatabase<typeof schema>;

interface PushPayload {
  title: string;
  body: string;
  url: string;
}

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// VAPID 는 프로세스당 1회만 초기화한다.
//
// 배포판(S2)에서는 키쌍이 env 에 없을 수 있다 — 교사에게 물을 수 없는 값이라
// app_secrets 에 앱이 직접 만들어 넣는다. 그래서 판정이 비동기가 됐다.
// env 가 있으면 그쪽이 우선이라 기존 배포는 동작이 바뀌지 않는다.
let vapidReady: boolean | null = null;

async function vapidConfigured(db: DB): Promise<boolean> {
  if (vapidReady !== null) return vapidReady;
  const keys = await getOrCreateVapidKeys(db);
  if (!keys) {
    vapidReady = false;
    return false;
  }
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  vapidReady = true;
  return true;
}

/** 테스트 전용 — 모듈 캐시 초기화. */
export function __resetVapidReady(): void {
  vapidReady = null;
}

/**
 * 단일 구독 저수준 발송. 절대 throw 하지 않고 성공 여부만 반환. 404/410 이면
 * 구독 행을 삭제한다. 성공/실패/삭제를 push_send 감사로그에 남긴다.
 */
async function sendRaw(
  db: DB,
  ownerId: string,
  sub: SubRow,
  kind: string,
  payload: PushPayload,
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
    );
    await writeAudit(db, ownerId, "push_send", sub.id, { kind, ok: true });
    return true;
  } catch (err) {
    const statusCode =
      typeof err === "object" && err !== null && "statusCode" in err
        ? (err as { statusCode?: number }).statusCode
        : undefined;
    let deleted = false;
    if (statusCode === 404 || statusCode === 410) {
      try {
        await db
          .delete(schema.pushSubscriptions)
          .where(eq(schema.pushSubscriptions.id, sub.id));
        deleted = true;
      } catch {
        // 삭제 실패는 삼킨다 — 발송 실패 자체를 전파하지 않는 것이 우선.
      }
    }
    try {
      await writeAudit(db, ownerId, "push_send", sub.id, {
        kind,
        ok: false,
        statusCode: statusCode ?? null,
        deleted,
      });
    } catch {
      // 감사로그 실패도 삼킨다(무해성).
    }
    return false;
  }
}

/**
 * 교사(로그인 세션) 구독 발송. kind='test' 는 prefs 무시 전체, 그 외는 해당 prefs
 * 키가 켜진 구독만. 모든 발송을 병렬(allSettled)로 시도하되 throw 는 전파하지 않는다.
 */
export async function sendToTeacher(
  db: DB,
  ownerId: string,
  kind: "instant" | "briefing" | "test",
  payload: PushPayload,
): Promise<void> {
  if (!(await vapidConfigured(db))) return;

  const rows = await db
    .select({
      id: schema.pushSubscriptions.id,
      endpoint: schema.pushSubscriptions.endpoint,
      p256dh: schema.pushSubscriptions.p256dh,
      auth: schema.pushSubscriptions.auth,
      prefs: schema.pushSubscriptions.prefs,
    })
    .from(schema.pushSubscriptions)
    .where(
      and(
        eq(schema.pushSubscriptions.audience, "teacher"),
        eq(schema.pushSubscriptions.ownerId, ownerId),
      ),
    );

  const prefKey = kind === "test" ? null : kind;
  const targets = rows.filter(
    (r) => prefKey === null || prefEnabled(r.prefs, prefKey),
  );

  await Promise.allSettled(
    targets.map((r) => sendRaw(db, ownerId, r, kind, payload)),
  );
}

const STUDENT_CONCURRENCY = 10;

/**
 * 학생(공개 페이지) 구독 발송. targets 는 호출부가 이미 활성 링크만 필터링해서 넘긴
 * publicPageId 목록. kind='test' 는 prefs 무시, 그 외는 prefs[kind] 가 켜진 구독만.
 * 여러 오너의 학생이 섞일 수 있으므로 감사로그의 ownerId 는 각 구독 행의 값을 쓴다.
 * 동시성 상한(배치 chunk)으로 발송 폭주를 막는다.
 */
export async function sendToStudents(
  db: DB,
  targets: { publicPageId: string }[],
  kind: "s1" | "s2" | "s3" | "test",
  payload: PushPayload,
): Promise<void> {
  if (!(await vapidConfigured(db))) return;
  if (targets.length === 0) return;

  const pageIds = [...new Set(targets.map((t) => t.publicPageId))];

  const rows = await db
    .select({
      id: schema.pushSubscriptions.id,
      ownerId: schema.pushSubscriptions.ownerId,
      endpoint: schema.pushSubscriptions.endpoint,
      p256dh: schema.pushSubscriptions.p256dh,
      auth: schema.pushSubscriptions.auth,
      prefs: schema.pushSubscriptions.prefs,
    })
    .from(schema.pushSubscriptions)
    .where(
      and(
        eq(schema.pushSubscriptions.audience, "student"),
        inArray(schema.pushSubscriptions.publicPageId, pageIds),
      ),
    );

  const selected =
    kind === "test" ? rows : rows.filter((r) => prefEnabled(r.prefs, kind));

  for (let i = 0; i < selected.length; i += STUDENT_CONCURRENCY) {
    const batch = selected.slice(i, i + STUDENT_CONCURRENCY);
    await Promise.allSettled(
      batch.map((r) => sendRaw(db, r.ownerId, r, kind, payload)),
    );
  }
}
