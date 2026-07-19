-- 0057_neis_timetable_slots.sql — NEIS '이번 주 실제' 시간표 캐시 + 최신성 컬럼.
-- 표준(컴시간, timetable_slots/homeroom_timetable_slots)과 별개 읽기전용 오버레이 레이어.
-- NEIS 고등학교시간표는 날짜 기반이라 weekday 가 아닌 실제 date 를 저장한다.
-- daily-brief 크론이 이번 주(월~금) 범위를 매일 갱신. 수업계획/시수관리는 이 테이블을 미참조.
-- RLS owner_rw(0028 homeroom_timetable_slots 패턴). 크론=service_role(RLS 우회),
-- /today=authenticated owner 읽기, get_public_page=SECURITY DEFINER 읽기.
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용.

create table if not exists neis_timetable_slots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  grade int not null,
  class_no int not null,
  date date not null,
  period int not null,
  subject_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, grade, class_no, date, period)
);
create index if not exists idx_neis_timetable_owner_date
  on neis_timetable_slots (owner_id, date);

alter table neis_timetable_slots enable row level security;
drop policy if exists "owner_rw" on neis_timetable_slots;
create policy "owner_rw" on neis_timetable_slots for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table teacher_profile
  add column if not exists last_neis_timetable_sync_at timestamptz;
