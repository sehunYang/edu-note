-- 0002_rls_policies.sql — 전 테이블 RLS 잠금 (계획 §3.2)
-- Supabase 는 public 스키마 테이블을 anon 키(브라우저 노출)로 PostgREST 공개한다.
-- RLS 를 켜고 owner_id=auth.uid() 정책만 두면: anon=전면차단, 로그인사용자=본인행만,
-- service_role/직접연결(postgres)=우회. 공개페이지는 get_public_page(SECURITY DEFINER)로만.

alter table "attendance_records" enable row level security;
drop policy if exists "owner_rw" on "attendance_records";
create policy "owner_rw" on "attendance_records" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "audit_log" enable row level security;
drop policy if exists "owner_rw" on "audit_log";
create policy "owner_rw" on "audit_log" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "budget_expenses" enable row level security;
drop policy if exists "owner_rw" on "budget_expenses";
create policy "owner_rw" on "budget_expenses" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "budgets" enable row level security;
drop policy if exists "owner_rw" on "budgets";
create policy "owner_rw" on "budgets" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "calendar_events" enable row level security;
drop policy if exists "owner_rw" on "calendar_events";
create policy "owner_rw" on "calendar_events" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "class_roles" enable row level security;
drop policy if exists "owner_rw" on "class_roles";
create policy "owner_rw" on "class_roles" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "class_sessions" enable row level security;
drop policy if exists "owner_rw" on "class_sessions";
create policy "owner_rw" on "class_sessions" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "club_members" enable row level security;
drop policy if exists "owner_rw" on "club_members";
create policy "owner_rw" on "club_members" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "clubs" enable row level security;
drop policy if exists "owner_rw" on "clubs";
create policy "owner_rw" on "clubs" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "counseling_logs" enable row level security;
drop policy if exists "owner_rw" on "counseling_logs";
create policy "owner_rw" on "counseling_logs" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "course_sections" enable row level security;
drop policy if exists "owner_rw" on "course_sections";
create policy "owner_rw" on "course_sections" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "creative_activity_records" enable row level security;
drop policy if exists "owner_rw" on "creative_activity_records";
create policy "owner_rw" on "creative_activity_records" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "creative_activity_student_overrides" enable row level security;
drop policy if exists "owner_rw" on "creative_activity_student_overrides";
create policy "owner_rw" on "creative_activity_student_overrides" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "enrollments" enable row level security;
drop policy if exists "owner_rw" on "enrollments";
create policy "owner_rw" on "enrollments" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "field_trip_reports" enable row level security;
drop policy if exists "owner_rw" on "field_trip_reports";
create policy "owner_rw" on "field_trip_reports" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "grades" enable row level security;
drop policy if exists "owner_rw" on "grades";
create policy "owner_rw" on "grades" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "homeroom_behavior_notes" enable row level security;
drop policy if exists "owner_rw" on "homeroom_behavior_notes";
create policy "owner_rw" on "homeroom_behavior_notes" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "homeroom_classes" enable row level security;
drop policy if exists "owner_rw" on "homeroom_classes";
create policy "owner_rw" on "homeroom_classes" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "homeroom_members" enable row level security;
drop policy if exists "owner_rw" on "homeroom_members";
create policy "owner_rw" on "homeroom_members" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "meal_cache" enable row level security;
drop policy if exists "owner_rw" on "meal_cache";
create policy "owner_rw" on "meal_cache" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "performance_assessments" enable row level security;
drop policy if exists "owner_rw" on "performance_assessments";
create policy "owner_rw" on "performance_assessments" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "performance_items" enable row level security;
drop policy if exists "owner_rw" on "performance_items";
create policy "owner_rw" on "performance_items" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "persons" enable row level security;
drop policy if exists "owner_rw" on "persons";
create policy "owner_rw" on "persons" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "public_pages" enable row level security;
drop policy if exists "owner_rw" on "public_pages";
create policy "owner_rw" on "public_pages" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "report_tracking" enable row level security;
drop policy if exists "owner_rw" on "report_tracking";
create policy "owner_rw" on "report_tracking" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "school_day_calendar" enable row level security;
drop policy if exists "owner_rw" on "school_day_calendar";
create policy "owner_rw" on "school_day_calendar" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "setup_state" enable row level security;
drop policy if exists "owner_rw" on "setup_state";
create policy "owner_rw" on "setup_state" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "special_note_drafts" enable row level security;
drop policy if exists "owner_rw" on "special_note_drafts";
create policy "owner_rw" on "special_note_drafts" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "student_activity_entries" enable row level security;
drop policy if exists "owner_rw" on "student_activity_entries";
create policy "owner_rw" on "student_activity_entries" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "student_extra_notes" enable row level security;
drop policy if exists "owner_rw" on "student_extra_notes";
create policy "owner_rw" on "student_extra_notes" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "student_years" enable row level security;
drop policy if exists "owner_rw" on "student_years";
create policy "owner_rw" on "student_years" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "subject_observations" enable row level security;
drop policy if exists "owner_rw" on "subject_observations";
create policy "owner_rw" on "subject_observations" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "subjects" enable row level security;
drop policy if exists "owner_rw" on "subjects";
create policy "owner_rw" on "subjects" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "tasks" enable row level security;
drop policy if exists "owner_rw" on "tasks";
create policy "owner_rw" on "tasks" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "teacher_profile" enable row level security;
drop policy if exists "owner_rw" on "teacher_profile";
create policy "owner_rw" on "teacher_profile" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "timetable_slots" enable row level security;
drop policy if exists "owner_rw" on "timetable_slots";
create policy "owner_rw" on "timetable_slots" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table "year_links" enable row level security;
drop policy if exists "owner_rw" on "year_links";
create policy "owner_rw" on "year_links" for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

