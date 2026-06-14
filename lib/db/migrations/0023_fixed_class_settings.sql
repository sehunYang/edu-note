-- 0023_fixed_class_settings.sql — 고정반 수업 설정(QC v3 Part B, AC-10.3).
-- 컴시간 학년 전체 파싱 → 교사가 '담임반이 원반에서 듣는 고정반 수업' 체크 저장.
-- 미체크 = 선택과목(이동반). 학생 안내 페이지 시간표·자가매핑 기준 데이터.
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용.

create table if not exists fixed_class_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  grade int not null,
  class_no int not null,
  subject_name text not null,
  is_fixed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, grade, class_no, subject_name)
);
alter table fixed_class_settings enable row level security;
drop policy if exists "owner_rw" on fixed_class_settings;
create policy "owner_rw" on fixed_class_settings for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
