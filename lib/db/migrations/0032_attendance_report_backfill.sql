-- 0032_attendance_report_backfill.sql — report_required 재분류 백필 (QC v4 US-4, AC-4.1).
-- ⚠ 데이터 마이그레이션(승인 게이트). 기존 attendance_records 의 영속 파생 컬럼
--   report_required 를 새 규칙(AC-4.1)으로 일괄 재계산하고, 더 이상 불필요해진
--   report_tracking 고아 행을 정리한 뒤 deadline/tier 스냅샷을 재계산한다.
--
-- 새 규칙: 신고서 필요 = (사유 질병 AND 종류 결석) OR (비고 '생리통' 포함, 종류 무관).
--   기존 'absent 항상 필요' / 'accepted 항상 필요' 규칙을 뒤집는다.
-- 롤백: 재계산은 attendance-rules 에서 결정적 — 이 마이그레이션의 결정적 재실행으로 복원.
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용.

-- (1) report_required 재계산(AC-4.1 도메인 규칙과 동치).
update attendance_records
set report_required =
  (reason = 'illness' and kind = 'absent')
  or (note_field is not null and note_field ilike '%생리통%');

-- (2) 더 이상 신고서 불필요한 출결의 추적 행 정리(고아 방지).
delete from report_tracking
where attendance_record_id in (
  select id from attendance_records where report_required = false
);

-- (3) 생존 추적행의 deadline_date/last_tier 스냅샷 재계산.
select recompute_report_tracking();
