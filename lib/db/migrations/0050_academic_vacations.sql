-- 0050_academic_vacations.sql — 방학 구간(달력 배경 밴드용). 학사일정 취약점 보강.
-- NEIS 동기화 시 deriveVacationSpans 결과를 [start_date, end_date] 연속 범위로 저장한다.
-- 방학식~개학식 사이에 NEIS 행이 없는 날(특히 주말)도 월간 캘린더에서 연속 음영하기 위함.
-- 개별 일자 이벤트로 저장하지 않아 보정 목록(calendar_events)을 오염시키지 않는다.
-- Drizzle 스키마: misc.ts academicVacations.
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용.

create table if not exists academic_vacations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 보조 인덱스: (owner_id, start_date) 범위 조회.
create index if not exists idx_academic_vacations_owner
  on academic_vacations (owner_id, start_date);

-- RLS: anon 전면 차단, 로그인 사용자=본인 행만 (0002/0039 패턴).
alter table academic_vacations enable row level security;
drop policy if exists "owner_rw" on academic_vacations;
create policy "owner_rw" on academic_vacations for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
