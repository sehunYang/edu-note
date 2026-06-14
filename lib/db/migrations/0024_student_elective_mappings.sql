-- 0024_student_elective_mappings.sql — 학생 선택과목 자가매핑(QC v3 Part B, AC-12.4).
-- 학생이 공개 페이지에서 (요일,교시)의 '선택과목'을 학년 후보에서 자가매핑(1:1 영속).
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용.

create table if not exists student_elective_mappings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  student_year_id uuid not null references student_years(id) on delete cascade,
  weekday int not null,
  period int not null,
  mapped_subject text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_year_id, weekday, period)
);
alter table student_elective_mappings enable row level security;
drop policy if exists "owner_rw" on student_elective_mappings;
create policy "owner_rw" on student_elective_mappings for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
