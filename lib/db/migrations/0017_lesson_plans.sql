-- 0017_lesson_plans.sql — 수업 계획실(과목단위 차시 계획). QC v2 2-2.
-- 과목 행은 이미 학기별 분리(0012) → semester 컬럼 불필요. 차시 1..N ordinal.
create table if not exists lesson_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  subject_id uuid not null references subjects(id) on delete cascade,
  ordinal int not null,
  content text,
  keywords text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subject_id, ordinal)
);

-- RLS: anon 전면 차단, 로그인 사용자=본인 행만 (0002 패턴).
alter table lesson_plans enable row level security;
drop policy if exists "owner_rw" on lesson_plans;
create policy "owner_rw" on lesson_plans for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
