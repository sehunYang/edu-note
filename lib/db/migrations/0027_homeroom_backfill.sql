-- 0027_homeroom_backfill.sql — 담임반 멤버십 백필(QC v3 Part B, FD1, AC-8.1).
-- 단일 출처 = homeroom_classes/homeroom_members 테이블. 실제 버그 = 이 테이블 미채움
-- (교사 profile 은 설정됐으나 멤버십 미생성). teacher_profile.is_homeroom 인 교사의
-- 담임 학년/반(homeroom_grade/class_no)과 일치하는 student_years 를 학년도별로 백필.
-- idempotent: on conflict do nothing. 비가역 아님(행 추가만).
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용.

-- 1) 담임 학급(학년도별)
insert into homeroom_classes (owner_id, school_year, grade, class_no)
select distinct sy.owner_id, sy.school_year, tp.homeroom_grade, tp.homeroom_class_no
from teacher_profile tp
join student_years sy
  on sy.owner_id = tp.owner_id
 and sy.grade = tp.homeroom_grade
 and sy.class_no = tp.homeroom_class_no
where tp.is_homeroom = true
  and tp.homeroom_grade is not null
  and tp.homeroom_class_no is not null
on conflict (owner_id, school_year, grade, class_no) do nothing;

-- 2) 멤버십(담임 학급 ↔ 해당 학년/반 학생)
insert into homeroom_members (owner_id, homeroom_id, student_year_id)
select sy.owner_id, hc.id, sy.id
from teacher_profile tp
join student_years sy
  on sy.owner_id = tp.owner_id
 and sy.grade = tp.homeroom_grade
 and sy.class_no = tp.homeroom_class_no
join homeroom_classes hc
  on hc.owner_id = sy.owner_id
 and hc.school_year = sy.school_year
 and hc.grade = sy.grade
 and hc.class_no = sy.class_no
where tp.is_homeroom = true
on conflict (homeroom_id, student_year_id) do nothing;
