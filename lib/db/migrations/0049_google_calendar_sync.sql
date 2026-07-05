-- 0049_google_calendar_sync.sql — 구글 캘린더 단방향 동기화 + 일정 시간 필드
-- (.omc/plans/google-calendar-sync-plan.md v4, 1단계).
--
-- (a) today_calendar_memos 에 선택적 시작/종료 시간 추가(둘 다 null=종일, 0039).
-- (b) google_calendar_connections 신규 — 구글 OAuth refresh/access 토큰(암호화)
--     저장 전용 테이블. RLS 활성화하되 **정책은 만들지 않는다** → PostgREST
--     (anon/authenticated) 전면 차단, 서버 drizzle 커넥션(postgres 역할,
--     BYPASSRLS)만 접근(0048 참고 관례). google_event_id 컬럼 없음 — 이벤트 id는
--     메모 UUID에서 결정론 파생(멱등 설계 A′, lib/domain/google-event.ts).
-- Drizzle 스키마: misc.ts todayCalendarMemos(startTime/endTime), googleCalendarConnections.
-- ⚠ 커스텀 SQL(드리즐 저널 외) — DB 리셋 시 0048 다음에 적용(scripts/apply-sql.mjs).

alter table today_calendar_memos
  add column if not exists start_time time,
  add column if not exists end_time time;

create table if not exists google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique,
  refresh_token_enc text not null,
  access_token_enc text,
  access_token_expires_at timestamptz,
  calendar_id text not null default 'primary',
  sync_enabled boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: 정책 없음 = PostgREST(anon/authenticated) 전면 차단. 서버 drizzle 커넥션만 접근.
alter table google_calendar_connections enable row level security;
