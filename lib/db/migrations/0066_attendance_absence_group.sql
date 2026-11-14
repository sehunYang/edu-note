-- 0066_attendance_absence_group.sql — 기간으로 입력한 결석을 서류 1건으로 묶는다.
--
-- 지금까지 결석 기간 입력(예: 3일 질병결석)은 수업일마다 출결 행을 만들고, 행마다
-- 신고서를 따로 요구했다 — 같은 결석에 결석계가 3장, 마감도 3개였다. 교외체험처럼
-- 기간 1건 = 서류 1장으로 바꾼다.
--
-- 같은 기간 입력으로 만들어진 행은 absence_group_id 를 공유한다. null = 하루씩 입력한
-- 행(지금까지와 같다). 묶음의 서류 상태는 행 전체에 함께 기록되고, 신고서 추적
-- (report_tracking)은 묶음에서 서류가 필요한 가장 늦은 날짜의 행 하나에만 둔다 —
-- 그래서 마감(기준일 이후 5수업일)이 기간의 마지막 날을 기준으로 잡힌다. pg_cron
-- (recompute_report_tracking, 0062)은 추적행의 출결 날짜를 기준으로 삼으므로 그대로 맞다.
--
-- 백필 없음: 이미 입력된 기간 결석은 어느 행이 한 번에 입력됐는지 확실히 알 수 없어
-- 하루씩 입력한 것으로 남는다.
--
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/migrate.mjs 가 적용. additive·idempotent.

alter table attendance_records
  add column if not exists absence_group_id uuid;

create index if not exists idx_attendance_records_absence_group
  on attendance_records (absence_group_id)
  where absence_group_id is not null;
