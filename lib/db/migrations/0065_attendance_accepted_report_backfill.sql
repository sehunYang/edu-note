-- 0065_attendance_accepted_report_backfill.sql — 인정 출결 서류 필수화 소급 적용.
-- ⚠ 데이터 마이그레이션. 0032 가 '인정은 불필요'로 뒤집었던 것을 다시 뒤집는다.
--
-- 새 규칙: 사유 '인정'은 종류(결석·지각·조퇴·결과) 무관 신고서 필요.
--   단, 교외체험이 만든 인정결석(field_trip_id not null)은 체험 1건당 사후보고서로
--   이미 서류를 받는다 — 날짜마다 신고서까지 요구하면 같은 체험에 서류가 이중으로 잡힌다.
-- 이번에 새로 서류 대상이 된 행 중 마감(기준일 이후 5수업일)이 지난 것은 제출됨으로 닫는다
-- — 당시엔 요구하지 않은 서류를 뒤늦게 독촉하지 않기 위한 사용자 결정. 마감 경과 판정은
-- 미제출 화면의 제출불가와 같다(오늘까지 지난 수업일 > 5). 마감 전 행은 미제출로 남는다.
-- 원래 서류 대상이던 행(비고 '생리통' 등)의 제출 여부는 건드리지 않는다.
-- 롤백: 이 파일이 제출됨으로 바꾼 행은 실제 제출과 구분되지 않는다 — 백업에서 복원.
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/migrate.mjs 가 적용. idempotent
--   (재실행해도 (1)은 report_required=false 인 행만 잡으므로 대상이 없다).

-- (1) report_required 재계산(lib/domain/attendance-rules.ts 와 동치) + 마감 경과분 제출 처리.
update attendance_records
set
  report_required = true,
  report_submitted = report_submitted or (
    select count(*) > 5
    from school_day_calendar s
    where s.owner_id = attendance_records.owner_id
      and s.is_school_day
      and s.date > attendance_records.date
      and s.date <= current_date
  )
where reason = 'accepted'
  and field_trip_id is null
  and report_required = false;

-- (2) 추적행 생성 — 넛지·에스컬레이션은 report_tracking 을 기준으로 집계한다.
--     attendance_record_id 에 unique 가 없어 not exists 로 중복을 막는다.
insert into report_tracking (owner_id, attendance_record_id)
select a.owner_id, a.id
from attendance_records a
where a.reason = 'accepted'
  and a.field_trip_id is null
  and a.report_required
  and not exists (
    select 1 from report_tracking rt where rt.attendance_record_id = a.id
  );

-- (3) 새 추적행의 deadline_date/last_tier 를 즉시 채운다(다음 cron 까지 기다리지 않음).
select recompute_report_tracking();
