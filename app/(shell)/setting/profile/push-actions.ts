"use server";

import { and, desc, eq } from "drizzle-orm";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { writeAudit } from "@/lib/db/queries";
import { sendToTeacher } from "@/lib/push/send";
import { prefEnabled } from "@/lib/push/targeting";

/**
 * 교사(로그인 세션) 푸시 알림 설정 액션 (합의 계획 push-notifications, US-5).
 * 구독은 브라우저(엔드포인트)당 1행이며 endpoint+audience unique 로 upsert 한다.
 * prefs 는 {instant, briefing} 옵트아웃 모델 — 명시적 false 만 끔.
 */

type TeacherPushState = {
  subscribed: boolean;
  prefs: { instant: boolean; briefing: boolean };
};

export async function registerTeacherPushAction(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<{ ok: boolean }> {
  const ownerId = await getOwnerId();
  const db = getDb();
  await db
    .insert(pushSubscriptions)
    .values({
      ownerId,
      audience: "teacher",
      publicPageId: null,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      prefs: { instant: true, briefing: true },
    })
    .onConflictDoUpdate({
      target: [pushSubscriptions.endpoint, pushSubscriptions.audience],
      set: {
        ownerId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        updatedAt: new Date(),
      },
    });
  await writeAudit(db, ownerId, "push_subscribe", null, { audience: "teacher" });
  return { ok: true };
}

export async function getTeacherPushStateAction(): Promise<TeacherPushState> {
  const ownerId = await getOwnerId();
  const db = getDb();
  const rows = await db
    .select({ prefs: pushSubscriptions.prefs })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.audience, "teacher"),
        eq(pushSubscriptions.ownerId, ownerId),
      ),
    )
    .orderBy(desc(pushSubscriptions.updatedAt))
    .limit(1);

  if (rows.length === 0) {
    return { subscribed: false, prefs: { instant: true, briefing: true } };
  }
  const prefs = rows[0].prefs;
  return {
    subscribed: true,
    prefs: {
      instant: prefEnabled(prefs, "instant"),
      briefing: prefEnabled(prefs, "briefing"),
    },
  };
}

export async function toggleTeacherPushPrefAction(
  key: "instant" | "briefing",
  value: boolean,
): Promise<{ ok: boolean }> {
  const ownerId = await getOwnerId();
  const db = getDb();
  const rows = await db
    .select({ id: pushSubscriptions.id, prefs: pushSubscriptions.prefs })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.audience, "teacher"),
        eq(pushSubscriptions.ownerId, ownerId),
      ),
    );

  for (const row of rows) {
    const base =
      typeof row.prefs === "object" && row.prefs !== null
        ? (row.prefs as Record<string, unknown>)
        : {};
    await db
      .update(pushSubscriptions)
      .set({ prefs: { ...base, [key]: value }, updatedAt: new Date() })
      .where(eq(pushSubscriptions.id, row.id));
  }
  return { ok: true };
}

export async function sendTeacherTestPushAction(): Promise<{ ok: boolean }> {
  const ownerId = await getOwnerId();
  const db = getDb();
  await sendToTeacher(db, ownerId, "test", {
    title: "테스트 알림",
    body: "정상 수신되면 설정이 완료된 것입니다.",
    url: "/setting/profile",
  });
  return { ok: true };
}
