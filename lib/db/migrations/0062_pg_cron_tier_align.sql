-- 0062_pg_cron_tier_align.sql — 넛지 티어를 미제출 화면 기준에 정렬 (출결관리 QC 2026-08).
-- recompute_report_tracking() 을 0033 에서 재정의:
--   (1) 티어 규칙 교체: 경과>3 위험/경과>5 심각 → 남은 수업일 ≥3 정상 / 2 위험 / ≤1 심각.
--       남은 수업일 = 마감 수업일 수 − 경과 수업일 수. 마감 경과(제출불가)는 report_tier
--       enum 이 3단이라 심각으로 캡(TS computeTier 와 동일).
--   (2) 마감을 소스별로 분리: 출결=기준일 이후 5수업일(offset 4), 교외체험 사후보고서=
--       10수업일(offset 9). 0033 까지는 체험도 offset 4 로 계산해 TS(10일)와 어긋났다.
-- 기준일은 0033 그대로 coalesce(ar.date, ft.end_date, ft.trip_date).
-- cron 스케줄은 0005 가 이미 등록 — 함수 본문만 교체하고, 스냅샷 즉시 갱신을 위해 1회 실행.
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용.

create or replace function recompute_report_tracking() returns void
language sql
as $$
  update report_tracking rt
  set
    last_tier = sub.tier,
    deadline_date = sub.deadline,
    last_computed_at = now(),
    updated_at = now()
  from (
    select
      rt2.id,
      case
        when coalesce(ar.report_submitted, ft.post_report_submitted, false) then 'normal'
        when d.deadline_days - c.sd_count >= 3 then 'normal'
        when d.deadline_days - c.sd_count = 2 then 'warning'
        else 'critical'
      end::report_tier as tier,
      (
        select s.date
        from school_day_calendar s
        where s.owner_id = rt2.owner_id
          and s.is_school_day
          and s.date > coalesce(ar.date, ft.end_date, ft.trip_date)
        order by s.date
        offset (d.deadline_days - 1) limit 1
      ) as deadline
    from report_tracking rt2
      left join attendance_records ar on ar.id = rt2.attendance_record_id
      left join field_trip_reports ft on ft.id = rt2.field_trip_id
      cross join lateral (
        -- 마감 수업일 수: 출결 신고서=5, 교외체험 사후보고서=10.
        select case when rt2.field_trip_id is not null then 10 else 5 end
          as deadline_days
      ) d
      cross join lateral (
        select count(*)::int as sd_count
        from school_day_calendar s
        where s.owner_id = rt2.owner_id
          and s.is_school_day
          and s.date > coalesce(ar.date, ft.end_date, ft.trip_date)
          and s.date <= current_date
      ) c
    where coalesce(ar.date, ft.end_date, ft.trip_date) is not null
  ) sub
  where rt.id = sub.id;
$$;

-- 낡은 3/5 기준 스냅샷을 즉시 새 기준으로 갱신(다음 cron 까지 기다리지 않음).
select recompute_report_tracking();
