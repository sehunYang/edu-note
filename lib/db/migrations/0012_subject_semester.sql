-- 0012: subjects.semester (학기 모델, QC v2 2-1 단계 A) + year_course_key (교실 2-2 연간 과목 링크 선설치)
-- additive·idempotent. 기존 행은 1학기로 백필, year_course_key는 normalize(name)+'_'+schoolYear.
alter table subjects add column if not exists semester integer not null default 1;
alter table subjects add column if not exists year_course_key text;
update subjects
  set year_course_key = regexp_replace(name, '\s', '', 'g') || '_' || school_year::text
  where year_course_key is null;
