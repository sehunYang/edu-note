-- 0005_pg_cron_escalation.sql — 신고서 에스컬레이션 일일 재계산 (계획 §3.4 escalation, AC-F)
-- ⚠ 커스텀 SQL(드리즐 저널 외) → DB 리셋 시 db:migrate 후 따로 적용할 것.
--   적용: node --env-file=.env.local -e "..." 또는 Supabase SQL editor 로 실행.
--
-- 동작: report_tracking 의 각 행에 대해, 기준일(결석일/체험일) 이후 경과 '수업일'을
--   school_day_calendar(is_school_day=true) 로 세어 티어를 재계산한다.
--   정상 ≤3 / 위험 >3 / 심각 >5. 제출된 신고서는 정상으로 정리한다.
--   마감일(deadline_date) = 기준일 이후 5번째 수업일.
--
-- 주: 티어 '전이' 감사로그는 앱(TS recomputeEscalation)이 남긴다(전이 전후 비교 필요).
--   이 SQL 함수는 무접속 기간에도 스냅샷이 갱신되도록 하는 pg_cron 백스톱이다.

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
          and s.date > coalesce(ar.date, ft.trip_date)
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
          and s.date > coalesce(ar.date, ft.trip_date)
          and s.date <= current_date
      ) c
    where coalesce(ar.date, ft.trip_date) is not null
  ) sub
  where rt.id = sub.id;
$$;

-- 매일 1회(KST 06:00 = UTC 21:00) 재계산.
-- pg_cron 확장과 권한이 필요(검증 B 통과: pg_cron+pg_net 가용 확인됨).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'recompute-report-tracking-daily',
      '0 21 * * *',
      $cron$ select recompute_report_tracking(); $cron$
    );
  end if;
end $$;
