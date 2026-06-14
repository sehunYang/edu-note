-- 0021_counsel_slots.sql — 상담 예약(QC v3 Part B, AC-9.3~9.4).
-- 교사가 날짜별 정원(capacity)을 오픈 → 학생 선착순 예약. RLS owner_rw(0017 패턴).
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용.

create table if not exists counsel_slots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  date date not null,
  capacity int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, date)
);
alter table counsel_slots enable row level security;
drop policy if exists "owner_rw" on counsel_slots;
create policy "owner_rw" on counsel_slots for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table if not exists counsel_reservations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  slot_id uuid not null references counsel_slots(id) on delete cascade,
  student_year_id uuid not null references student_years(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(slot_id, student_year_id)
);
alter table counsel_reservations enable row level security;
drop policy if exists "owner_rw" on counsel_reservations;
create policy "owner_rw" on counsel_reservations for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
