-- 0019_jipil_scores.sql — 지필 원점수(과목×회차×학생). 환산은 읽기시점. QC v2 2-2.
-- 수행평가는 기존 performance_assessments 재사용. ordinal: 1=중간(1회), 2=기말(2회).
create table if not exists jipil_scores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  student_year_id uuid not null references student_years(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  ordinal int not null,
  raw_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_year_id, subject_id, ordinal)
);

alter table jipil_scores enable row level security;
drop policy if exists "owner_rw" on jipil_scores;
create policy "owner_rw" on jipil_scores for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
