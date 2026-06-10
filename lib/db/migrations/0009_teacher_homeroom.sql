-- 0009_teacher_homeroom.sql — 교사 기본 설정(담임/학교명) 추가 (QC v1 C2, AC-2.1~2.2)
-- 교사 프로필에 학교명·담임여부·담임반(학년/반)을 영속한다. 담임여부 false 면
-- 담임 학년/반은 쿼리 계층(upsertTeacherSettings)에서 null 강제.
-- ⚠ 커스텀 SQL(드리즐 저널 외) → DB 리셋 시 db:migrate 후 따로 적용할 것.

alter table "teacher_profile" add column if not exists "school_name" text;
alter table "teacher_profile" add column if not exists "is_homeroom" boolean not null default false;
alter table "teacher_profile" add column if not exists "homeroom_grade" integer;
alter table "teacher_profile" add column if not exists "homeroom_class_no" integer;
