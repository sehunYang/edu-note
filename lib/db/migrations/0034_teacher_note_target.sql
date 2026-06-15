-- 0034_teacher_note_target.sql — 교사 한마디 대상 지정(QC v4 US-5, AC-5.2).
-- 교사 한마디를 '전체' 또는 '특정 학생'에게 한정. target_scope='individual' 인 경우
-- teacher_note_targets 에 대상 student_year_id 다중 매핑. RLS owner_rw(0021 패턴).
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용. 추가/멱등.

-- teacher_notes 에 대상 범위 컬럼('all' | 'individual', 기본 'all' = 기존 행 하위호환).
alter table teacher_notes add column if not exists target_scope text not null default 'all';

-- calendar_events.content 는 0022 에서 이미 추가됨 — 멱등 가드(미존재 시에만 추가).
alter table calendar_events add column if not exists content text;

-- 개별 공지 대상(한마디↔학생 다대다). note 삭제·학생 삭제 시 cascade.
create table if not exists teacher_note_targets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  note_id uuid not null references teacher_notes(id) on delete cascade,
  student_year_id uuid not null references student_years(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(note_id, student_year_id)
);
alter table teacher_note_targets enable row level security;
drop policy if exists "owner_rw" on teacher_note_targets;
create policy "owner_rw" on teacher_note_targets for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
