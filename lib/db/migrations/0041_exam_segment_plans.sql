-- 0041_exam_segment_plans.sql — 수업 계획실 시험 구간 계획 (QC v6 US-1, AC-1.1).
-- 시험 구간(1회=중간 전 / 2회=기말 전) 단위로 "진행할 차시(planned) + 여유 차시(slack)"를
-- 영속화한다. 현재 여유차시는 미저장 로컬상태였으므로 신규 테이블이 필요하다.
-- unique 키는 named uq_exam_segment_plans ON (subject_id, exam_ordinal) — 형제
-- uq_exam_targets(0037, subject_id 가 이미 학기-스코프이므로 owner_id·semester 미포함)와
-- 정확히 일치. RLS owner_rw(0030 패턴).
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용. additive·idempotent.

create table if not exists exam_segment_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  subject_id uuid not null references subjects(id) on delete cascade,
  exam_ordinal int not null check (exam_ordinal in (1, 2)),
  planned_periods int not null default 0,
  slack_periods int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_exam_segment_plans unique (subject_id, exam_ordinal)
);
alter table exam_segment_plans enable row level security;
drop policy if exists "owner_rw" on exam_segment_plans;
create policy "owner_rw" on exam_segment_plans for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
