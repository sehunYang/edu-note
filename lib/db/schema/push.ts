import {
  pgTable,
  uuid,
  text,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { pk, ownerId, timestamps } from "./_shared";
import { publicPages } from "./misc";

/**
 * 웹푸시 구독 (PWA 푸시 알림, 합의 계획 push-notifications).
 * audience='teacher' 는 로그인 교사 세션 구독, audience='student' 는 공개 페이지(publicPageId) 구독.
 * endpoint/p256dh/auth 는 푸시 발송 크리덴셜 → RLS 로 anon 전면 차단(마이그 0056).
 * 학생 구독은 publicDb()(service-role) 로 삽입/조회, 교사 구독은 authenticated 정책 적용.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: pk(),
    ownerId: ownerId(),
    audience: text("audience").notNull(), // 'teacher' | 'student' — 앱 레벨 리터럴 유니온
    publicPageId: uuid("public_page_id").references(() => publicPages.id, {
      onDelete: "cascade",
    }), // nullable — student 만 채움
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    prefs: jsonb("prefs").notNull().default({}), // 교사: {instant, briefing}, 학생: {s1, s2, s3}
    ...timestamps(),
  },
  (t) => [
    unique("uq_push_subscriptions_endpoint_audience").on(t.endpoint, t.audience),
  ],
);
