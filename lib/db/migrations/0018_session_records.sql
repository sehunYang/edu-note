-- 0018_session_records.sql — 수업 진척도 '완료' 시 실제 기록. classSessions 1:1. QC v2 2-2.
-- plan_ordinal: 완료 처리시 확정 저장(자동=분반 내 날짜순위 k, 수동 재지정 override).
create table if not exists session_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  session_id uuid not null references class_sessions(id) on delete cascade,
  actual_content text,
  keywords text[],
  eval_idea text,
  plan_ordinal int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id)
);

alter table session_records enable row level security;
drop policy if exists "owner_rw" on session_records;
create policy "owner_rw" on session_records for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
