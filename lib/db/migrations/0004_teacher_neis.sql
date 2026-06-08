-- 0004_teacher_neis.sql — 교사 프로필에 NEIS(학사일정·급식) 동기화 설정 추가 (계획 §3.3 E)
-- ⚠ 커스텀 SQL(드리즐 저널 외) → DB 리셋 시 db:migrate 후 따로 적용할 것.

alter table "teacher_profile" add column if not exists "neis_office_code" text;
alter table "teacher_profile" add column if not exists "neis_school_code" text;
alter table "teacher_profile" add column if not exists "neis_school_name" text;
alter table "teacher_profile" add column if not exists "last_calendar_sync_at" timestamptz;
