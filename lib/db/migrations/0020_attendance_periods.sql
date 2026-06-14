-- 0020_attendance_periods.sql — 출결 교시 기록(QC v3 Part B, AC-7.2~7.5).
-- 지각/조퇴 기점·결과 다중선택 교시를 int[] 로 저장. nullable, 기존행 보존(additive).
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용.

alter table attendance_records add column if not exists periods int[];
