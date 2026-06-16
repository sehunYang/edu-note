-- 0038_club_activity_sessions.sql — 동아리 예정활동(차시) 저장처. QC v5 c9 (US-0 Step 0.1).
-- 동아리 활동계획: calendarEvents.eventKind='club' 날짜 시퀀스 → 차시(ordinal, 날짜순 파생).
-- 차시별 예정활동(planned_activity)을 저장하고, 달력 club 이벤트 변경 시 재생성한다.
--
-- unique 키 결정 (M3): 재생성(reconcile)은 (club_id, date) 키로 upsert 하여 사용자 입력
-- planned_activity 를 날짜 기준으로 보존한다. ordinal 은 재생성마다 날짜순으로 재계산되는
-- 파생값이므로 unique 에 포함하지 않는다(비-unique 파생 컬럼).
-- → unique 는 uq_club_activity_sessions (club_id, date) 단일.
-- Drizzle 스키마(misc.ts clubActivitySessions)와 uq_* 이름·컬럼을 1:1 일치(0037 교훈).
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용.

create table if not exists club_activity_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  club_id uuid not null references clubs(id) on delete cascade,
  ordinal int not null,
  date date not null,
  planned_activity text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_club_activity_sessions unique (club_id, date)
);

-- 보조 인덱스: owner 범위 조회.
create index if not exists idx_club_activity_sessions_owner
  on club_activity_sessions (owner_id);

-- RLS: anon 전면 차단, 로그인 사용자=본인 행만 (0002 패턴).
alter table club_activity_sessions enable row level security;
drop policy if exists "owner_rw" on club_activity_sessions;
create policy "owner_rw" on club_activity_sessions for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
