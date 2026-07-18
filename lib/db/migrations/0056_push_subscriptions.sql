-- 0056_push_subscriptions.sql — 웹푸시 구독(PWA 푸시 알림, 합의 계획 push-notifications).
-- 손작성 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 로 직접 적용.
-- Drizzle 스키마: schema/push.ts pushSubscriptions.
-- endpoint/p256dh/auth 는 푸시 발송 크리덴셜 → RLS anon 전면 차단(0050 패턴 복제).

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  audience text not null,
  public_page_id uuid references public_pages(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_push_subscriptions_endpoint_audience unique (endpoint, audience)
);

-- 보조 인덱스: owner 별 조회(교사 발송 타겟팅).
create index if not exists idx_push_subscriptions_owner
  on push_subscriptions (owner_id, audience);

-- RLS: anon 전면 차단(정책 미생성 → 기본 거부), 로그인 교사=본인 행만.
-- 학생 구독은 publicDb()(service-role, RLS 우회)로 삽입/조회된다.
alter table push_subscriptions enable row level security;
drop policy if exists "owner_rw" on push_subscriptions;
create policy "owner_rw" on push_subscriptions for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
