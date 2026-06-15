-- 0033_pg_cron_trip_range.sql — 교외체험 기간 마감 기준일 = end_date (QC v4 US-4, AC-4.2).
-- recompute_report_tracking() 을 0005 와 동일하게 재정의하되, 체험 기준일을
--   coalesce(ar.date, ft.trip_date) → coalesce(ar.date, ft.end_date, ft.trip_date) 로 바꾼다.
--   (사후보고서는 체험 종료 후 제출 → 마감 기준일 = end_date, 미설정 시 trip_date 폴백.)
-- cron 스케줄은 0005 가 이미 등록 — 여기선 함수 본문만 교체(재스케줄 안 함).
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
        when c.sd_count > 5 then 'critical'
        when c.sd_count > 3 then 'warning'
        else 'normal'
      end::report_tier as tier,
      (
        select s.date
        from school_day_calendar s
        where s.owner_id = rt2.owner_id
          and s.is_school_day
          and s.date > coalesce(ar.date, ft.end_date, ft.trip_date)
        order by s.date
        offset 4 limit 1
      ) as deadline
    from report_tracking rt2
      left join attendance_records ar on ar.id = rt2.attendance_record_id
      left join field_trip_reports ft on ft.id = rt2.field_trip_id
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
