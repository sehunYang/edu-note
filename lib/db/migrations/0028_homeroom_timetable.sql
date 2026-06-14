-- 0028_homeroom_timetable.sql — 담임반 시간표 캐시(QC v3 Part B, US-B13, AC-12.3).
-- 컴시간(학년 파싱) 시간표를 (grade, classNo, weekday, period) 단위로 캐시한다.
-- get_public_page(0029) 의 timetable 소스. RLS owner_rw(0017/0021/0024 패턴).
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용(오케스트레이터).

create table if not exists homeroom_timetable_slots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  grade int not null,
  class_no int not null,
  weekday int not null,
  period int not null,
  subject_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, grade, class_no, weekday, period)
);
alter table homeroom_timetable_slots enable row level security;
drop policy if exists "owner_rw" on homeroom_timetable_slots;
create policy "owner_rw" on homeroom_timetable_slots for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
