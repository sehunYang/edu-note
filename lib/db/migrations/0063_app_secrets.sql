-- 0063_app_secrets.sql — 앱이 스스로 만들어 보관하는 시크릿 (배포판 S2).
--
-- 배포판에서는 교사가 Deploy 화면의 칸 두 개(이메일·NEIS 키)만 채운다. VAPID 키쌍처럼
-- "터미널에서 생성해 env 에 넣어야 하는 값"은 물을 수가 없다. 그래서 앱이 최초 필요
-- 시점에 직접 생성해 여기에 보관한다.
--
-- owner_id 가 없는 이유: 배포 1개 = 교사 1명이고, VAPID 키쌍은 그 배포(오리진) 전체의
-- 신원이다. 학생 공개 페이지의 구독도 같은 키쌍을 써야 하므로 소유자별로 나눌 수 없다.
-- 이 앱에서 owner_id 없는 유일한 테이블이다.
--
-- RLS: 켜되 정책을 만들지 않는다 = anon/authenticated 전면 차단. PostgREST 가 public
-- 스키마 테이블을 anon 키로 노출하므로, 켜두지 않으면 VAPID 개인키가 밖에서 읽힌다.
-- 서버는 service-role/소유자 커넥션으로 읽으므로 영향받지 않는다.
--
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/migrate.mjs 가 적용. additive·idempotent.

create table if not exists app_secrets (
  key        text primary key,
  value      text not null,
  created_at timestamptz not null default now()
);

alter table app_secrets enable row level security;
