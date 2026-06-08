-- 0006_attendance_unique.sql — 출결 (owner,student,date,kind) 유일 제약 (US-005 경합 방지)
-- ⚠ 커스텀 SQL(드리즐 저널 외) → DB 리셋 시 db:migrate 후 따로 적용할 것.
--   upsertAttendance 의 onConflictDoUpdate 타깃. 하루·한 성격당 1행을 보장한다.

alter table "attendance_records"
  add constraint "uq_attendance_owner_student_date_kind"
  unique ("owner_id", "student_year_id", "date", "kind");
