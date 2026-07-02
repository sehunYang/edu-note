-- 0044_rls_course_eval.sql — 0011 누락 RLS 소급 적용 (보안 점검 2026-07-03 #1)
-- 0011_course_eval.sql 이 만든 3개 테이블은 0002 의 전 테이블 RLS 일괄 적용 이후에
-- 생성되어 RLS 가 빠져 있었다. anon 키는 브라우저에 공개되므로, PostgREST(Data API)가
-- public 스키마를 노출하는 기본 설정에서는 누구나 이 테이블을 읽고 쓸 수 있는 상태였다.
-- 0002 와 동일한 owner_rw 정책으로 잠근다. 앱 쿼리 경로(직접 postgres 연결)는 RLS 우회
-- 이므로 동작 변화 없음.
-- ⚠ 커스텀 SQL(드리즐 저널 외) → scripts/apply-sql.mjs 로 적용할 것.

alter table "subject_exams" enable row level security;
drop policy if exists "owner_rw" on "subject_exams";
create policy "owner_rw" on "subject_exams" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "section_performance_dates" enable row level security;
drop policy if exists "owner_rw" on "section_performance_dates";
create policy "owner_rw" on "section_performance_dates" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "section_roles" enable row level security;
drop policy if exists "owner_rw" on "section_roles";
create policy "owner_rw" on "section_roles" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
