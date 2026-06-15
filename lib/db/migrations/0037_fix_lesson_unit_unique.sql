-- 0037_fix_lesson_unit_unique.sql — lesson_units/exam_targets unique 정정 (QC v4 US-2 회귀).
-- 0030 이 unique 키에 owner_id 를 포함해 생성했으나, Drizzle 스키마(records.ts)와
-- upsert 코드(onConflict)는 owner_id 없는 키(subject_id 가 이미 owner 종속)를 기대한다.
-- → ON CONFLICT 추론 불일치("no unique constraint matching"). 스키마/코드 기준으로 DB 정렬.
-- subject_id 는 subjects.owner_id 에 종속되므로 owner_id 없는 키로 동치·충분.
-- 신규 테이블(빈 상태) DDL — 데이터 영향 없음. 멱등(drop if exists → add). create or replace 성격.
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용.

alter table lesson_units drop constraint if exists lesson_units_owner_id_subject_id_major_no_mid_no_minor_no_key;
alter table lesson_units drop constraint if exists uq_lesson_units;
alter table lesson_units add constraint uq_lesson_units unique (subject_id, major_no, mid_no, minor_no);

alter table exam_targets drop constraint if exists exam_targets_owner_id_subject_id_exam_ordinal_key;
alter table exam_targets drop constraint if exists uq_exam_targets;
alter table exam_targets add constraint uq_exam_targets unique (subject_id, exam_ordinal);
