-- 0031_attendance_ranges.sql — 교외체험학습 기간(start/end) (QC v4 US-4, AC-4.2~4.4).
-- 단일 trip_date 를 기간으로 확장: start_date/end_date 추가 + tripDate→start/end 백필.
-- additive·idempotent, 기존행 보존. ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용.
--
-- ⚠ 불변식(S3.2c): trip_date 는 NOT NULL 로 유지하며 start_date 의 미러로 둔다.
--   out-of-band pg_cron(recompute_report_tracking)·기타 함수가 물리 컬럼 trip_date 를
--   참조하므로 rename/drop 금지. cron/escalation 이 end_date 로 완전히 전환된 뒤
--   별도 마이그레이션으로 정리한다.

alter table field_trip_reports add column if not exists start_date date;
alter table field_trip_reports add column if not exists end_date date;

-- 기존 단일 trip_date 보존 백필(당일=start=end=trip_date).
update field_trip_reports set start_date = trip_date where start_date is null;
update field_trip_reports set end_date = trip_date where end_date is null;
