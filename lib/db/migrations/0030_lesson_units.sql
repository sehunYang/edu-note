-- 0030_lesson_units.sql — 수업계획실 학기계획 세부단원 + 시험별 목표진도 (QC v4 US-2).
-- 과목 단위 세부단원(대/중/소단원), 6자리코드=major*10000+mid*100+minor.
-- 시험별 목표진도 = 소단원 6자리코드 범위(from~to). RLS owner_rw(0021 패턴).
-- 차시-단원 연결 = lesson_plans.unit_id(nullable, set null).
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용. additive·idempotent.

create table if not exists lesson_units (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  subject_id uuid not null references subjects(id) on delete cascade,
  major_no int not null,
  mid_no int not null,
  minor_no int not null,
  major_name text not null,
  mid_name text not null,
  minor_name text not null,
  keywords text[],
  min_ordinals int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, subject_id, major_no, mid_no, minor_no)
);
alter table lesson_units enable row level security;
drop policy if exists "owner_rw" on lesson_units;
create policy "owner_rw" on lesson_units for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table if not exists exam_targets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  subject_id uuid not null references subjects(id) on delete cascade,
  exam_ordinal int not null,
  unit_from_code int,
  unit_to_code int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, subject_id, exam_ordinal)
);
alter table exam_targets enable row level security;
drop policy if exists "owner_rw" on exam_targets;
create policy "owner_rw" on exam_targets for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 차시 → 소단원 연결(nullable, 점진 연결). 단원 삭제 시 차시는 보존(set null).
alter table lesson_plans
  add column if not exists unit_id uuid references lesson_units(id) on delete set null;
