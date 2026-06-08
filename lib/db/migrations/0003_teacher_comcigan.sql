-- 0003_teacher_comcigan.sql — 교사 프로필에 컴시간 동기화 설정 추가 (계획 §3.3 B)
-- 시간표 sync(컴시간) 재실행·pg_cron 일일 동기화에 필요한 학교/교사명을 영속한다.
-- ⚠ 커스텀 SQL(드리즐 저널 외) → DB 리셋 시 db:migrate 후 따로 적용할 것.

alter table "teacher_profile" add column if not exists "comcigan_school" text;
alter table "teacher_profile" add column if not exists "comcigan_teacher" text;
alter table "teacher_profile" add column if not exists "last_timetable_sync_at" timestamptz;
