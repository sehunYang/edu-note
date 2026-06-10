-- 0010_calendar_event_kind.sql — 학사일정 키워드 자동 분류 속성 추가 (QC v1 C3, AC-3.1~3.4)
-- calendar_events 에 event_kind(시험/방학식/개학식/동아리/none) + 시험 학기/회차를 태깅한다.
-- subjectExams 파생은 C5(태깅된 calendarEvents 로부터).
-- ⚠ 커스텀 SQL(드리즐 저널 외) → DB 리셋 시 db:migrate 후 따로 적용할 것.

do $$ begin
  create type "event_kind" as enum ('exam', 'vacation_start', 'vacation_end', 'club', 'none');
exception when duplicate_object then null;
end $$;

alter table "calendar_events" add column if not exists "event_kind" "event_kind" not null default 'none';
alter table "calendar_events" add column if not exists "exam_semester" integer;
alter table "calendar_events" add column if not exists "exam_ordinal" integer;
