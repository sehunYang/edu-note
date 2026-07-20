-- 0059_get_public_page_v14.sql — 공개 학생 안내 페이지 v14 (누적 별칭 학습용 쌍 추가).
--
-- v13(0058) 기반 재정의. 함수명·시그니처 동일(create or replace) → 호출부 변경 불필요.
--
-- v14 변경점 (딱 한 곳, 추가만):
--   payload.subjectAliasPairs = 이 학생 (grade,class_no) 의 **누적** neis_timetable_slots
--   (이번 주만이 아니라 저장된 전 주차)를 표준(homeroom_timetable_slots)과 같은 칸
--   (요일=isodow(date), 교시)에서 짝지어 (표준과목 std, NEIS과목 act, 동시등장 count) 로
--   집계한 배열. 클라이언트가 std 별 최빈 act 로 과목 별칭(일어→일본어)을 학습해 어휘
--   표기차 노이즈를 제거한다(특별활동 제외는 TS 에서). 여러 주치라 최빈값이 안정적.
--   ⚠ 특별활동 필터링은 SQL 이 아니라 TS(buildAliasMapFromPairs)에서 — 키워드 단일 소스 유지.
--   ⚠ v13 의 다른 모든 섹션은 그대로 유지(회귀 방지). 금지 필드(사유텍스트·원점수) 불변.
--
-- 함수는 create or replace 라 재적용 안전. ⚠ 커스텀 SQL(드리즐 저널 외).
-- ⚠ 선행 필수: 0057(neis_timetable_slots), 0058(v13).

create or replace function get_public_page(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page          public_pages%rowtype;
  v_sy_id         uuid;
  v_owner         uuid;
  v_grade         int;
  v_class_no      int;
  v_student_name  text;
  v_attendance    jsonb;
  v_attendance2d  jsonb;
  v_att_detail    jsonb;
  v_week_mon      date;
  v_payload       jsonb;
begin
  select * into v_page from public_pages where token = p_token limit 1;
  if not found then
    return jsonb_build_object('state', 'not_found');
  end if;

  if v_page.revoked_at is not null then
    return jsonb_build_object('state', 'revoked');
  end if;
  if v_page.expires_at is not null and v_page.expires_at <= now() then
    return jsonb_build_object('state', 'expired');
  end if;

  v_sy_id := v_page.student_year_id;
  v_owner := v_page.owner_id;
  v_week_mon := date_trunc('week', (now() at time zone 'Asia/Seoul')::date)::date;

  select sy.grade, sy.class_no, sy.name
    into v_grade, v_class_no, v_student_name
  from student_years sy where sy.id = v_sy_id limit 1;

  select jsonb_build_object(
    'late',          count(*) filter (where ar.kind = 'late'),
    'earlyLeave',    count(*) filter (where ar.kind = 'early_leave'),
    'absentPeriod',  count(*) filter (where ar.kind = 'absent_period'),
    'absent',        count(*) filter (where ar.kind = 'absent'),
    'hasUnsubmittedReport',
      coalesce(bool_or(ar.report_required and not ar.report_submitted), false)
  )
  into v_attendance
  from attendance_records ar
  where ar.student_year_id = v_sy_id;

  select jsonb_build_object(
    'late', jsonb_build_object(
      'accepted',   count(*) filter (where ar.kind = 'late' and ar.reason = 'accepted'),
      'illness',    count(*) filter (where ar.kind = 'late' and ar.reason = 'illness'),
      'unaccepted', count(*) filter (where ar.kind = 'late' and ar.reason = 'unaccepted'),
      'etc',        count(*) filter (where ar.kind = 'late' and ar.reason = 'etc')),
    'earlyLeave', jsonb_build_object(
      'accepted',   count(*) filter (where ar.kind = 'early_leave' and ar.reason = 'accepted'),
      'illness',    count(*) filter (where ar.kind = 'early_leave' and ar.reason = 'illness'),
      'unaccepted', count(*) filter (where ar.kind = 'early_leave' and ar.reason = 'unaccepted'),
      'etc',        count(*) filter (where ar.kind = 'early_leave' and ar.reason = 'etc')),
    'absentPeriod', jsonb_build_object(
      'accepted',   count(*) filter (where ar.kind = 'absent_period' and ar.reason = 'accepted'),
      'illness',    count(*) filter (where ar.kind = 'absent_period' and ar.reason = 'illness'),
      'unaccepted', count(*) filter (where ar.kind = 'absent_period' and ar.reason = 'unaccepted'),
      'etc',        count(*) filter (where ar.kind = 'absent_period' and ar.reason = 'etc')),
    'absent', jsonb_build_object(
      'accepted',   count(*) filter (where ar.kind = 'absent' and ar.reason = 'accepted'),
      'illness',    count(*) filter (where ar.kind = 'absent' and ar.reason = 'illness'),
      'unaccepted', count(*) filter (where ar.kind = 'absent' and ar.reason = 'unaccepted'),
      'etc',        count(*) filter (where ar.kind = 'absent' and ar.reason = 'etc'))
  )
  into v_attendance2d
  from attendance_records ar
  where ar.student_year_id = v_sy_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'date',    ar.date,
           'kind',    ar.kind,
           'reason',  ar.reason,
           'periods', to_jsonb(ar.periods))
         order by ar.date), '[]'::jsonb)
  into v_att_detail
  from attendance_records ar
  where ar.student_year_id = v_sy_id;

  v_payload := jsonb_build_object(
    'studentName', v_student_name,
    'weekTodos', coalesce(
      (select jsonb_agg(item order by item->>'at')
       from (
         select jsonb_build_object(
                  'title', ce.title, 'at', ce.date, 'eventKind', ce.event_kind) as item
         from calendar_events ce
         where ce.owner_id = v_owner
           and ce.date >= current_date - 31
           and ce.date <= current_date + 93
           and ce.source in ('manual', 'neis')
           and ce.is_public = true
         union all
         select jsonb_build_object(
                  'title', '상담 예약', 'at', cs.date, 'eventKind', 'counsel') as item
         from counsel_reservations cr
         join counsel_slots cs on cs.id = cr.slot_id
         where cr.student_year_id = v_sy_id
           and cs.owner_id = v_owner
           and cs.date >= current_date - 31
           and cs.date <= current_date + 93
       ) merged), '[]'::jsonb),
    'commonNotice', (
      select tn.body from teacher_notes tn
      where tn.owner_id = v_owner
        and coalesce(tn.target_scope, 'all') = 'all'
      order by tn.sort_order, tn.created_at
      limit 1),
    'notices', coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'id', tn.id,
                  'body', tn.body,
                  'postedAt', tn.updated_at,
                  'unread', not exists (
                    select 1 from student_notice_reads r
                    where r.student_year_id = v_sy_id
                      and r.note_id = tn.id
                      and r.read_at >= tn.updated_at))
                order by tn.sort_order, tn.created_at)
       from teacher_notes tn
       where tn.owner_id = v_owner
         and coalesce(tn.target_scope, 'all') = 'all'), '[]'::jsonb),
    'individualNotices', coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'id', tn.id,
                  'body', tn.body,
                  'postedAt', tn.updated_at,
                  'unread', not exists (
                    select 1 from student_notice_reads r
                    where r.student_year_id = v_sy_id
                      and r.note_id = tn.id
                      and r.read_at >= tn.updated_at))
                order by tn.sort_order, tn.created_at)
       from teacher_notes tn
       join teacher_note_targets tnt
         on tnt.note_id = tn.id
        and tnt.student_year_id = v_sy_id
       where tn.owner_id = v_owner
         and tn.target_scope = 'individual'), '[]'::jsonb),
    'timetable', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'weekday', hts.weekday,
                'period', hts.period,
                'subjectName', hts.subject_name,
                'isFixed', coalesce(fcs.is_fixed, false),
                'electiveMapped', sem.mapped_subject)
              order by hts.weekday, hts.period)
       from homeroom_timetable_slots hts
       left join fixed_class_settings fcs
         on fcs.owner_id = v_owner
        and fcs.grade = hts.grade
        and fcs.class_no = hts.class_no
        and fcs.subject_name = hts.subject_name
        and fcs.is_fixed = true
       left join student_elective_mappings sem
         on sem.student_year_id = v_sy_id
        and sem.weekday = hts.weekday
        and sem.period = hts.period
       where hts.owner_id = v_owner
         and hts.grade = v_grade
         and hts.class_no = v_class_no), '[]'::jsonb),
    'weeklyActual', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'weekday', extract(isodow from nts.date)::int,
                'period', nts.period,
                'subjectName', nts.subject_name)
              order by nts.date, nts.period)
       from neis_timetable_slots nts
       where nts.owner_id = v_owner
         and nts.grade = v_grade
         and nts.class_no = v_class_no
         and nts.date >= v_week_mon
         and nts.date < v_week_mon + 5), '[]'::jsonb),
    'weeklyActualSyncedAt', (
      select tp.last_neis_timetable_sync_at from teacher_profile tp
      where tp.owner_id = v_owner limit 1),
    -- v14: 누적 NEIS↔표준 동시등장 집계(별칭 학습용). 전 주차 대상 — 최빈값 안정.
    -- 특별활동 제외는 TS(buildAliasMapFromPairs)에서 처리하므로 여기선 필터하지 않는다.
    'subjectAliasPairs', coalesce(
      (select jsonb_agg(jsonb_build_object('std', p.std, 'act', p.act, 'count', p.c))
       from (
         select hts.subject_name as std, nts.subject_name as act, count(*)::int as c
         from homeroom_timetable_slots hts
         join neis_timetable_slots nts
           on nts.owner_id = hts.owner_id
          and nts.grade = hts.grade
          and nts.class_no = hts.class_no
          and extract(isodow from nts.date)::int = hts.weekday
          and nts.period = hts.period
         where hts.owner_id = v_owner
           and hts.grade = v_grade
           and hts.class_no = v_class_no
         group by hts.subject_name, nts.subject_name
       ) p), '[]'::jsonb),
    'meals', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'date', mc.date,
                'menu', concat_ws(' · ', m->>'mealType',
                          (select string_agg(item, E'\n')
                           from jsonb_array_elements_text(m->'menu') as item)),
                'calInfo', m->>'calInfo',
                'ntrInfo', m->>'ntrInfo'))
       from meal_cache mc
       cross join lateral jsonb_array_elements(
         coalesce(mc.payload->'meals', '[]'::jsonb)) as m
       where mc.owner_id = v_owner
         and mc.date = (now() at time zone 'Asia/Seoul')::date), '[]'::jsonb),
    'attendanceSummary', coalesce(v_attendance, jsonb_build_object(
       'late', 0, 'earlyLeave', 0, 'absentPeriod', 0, 'absent', 0,
       'hasUnsubmittedReport', false)),
    'attendance2D', coalesce(v_attendance2d, '{}'::jsonb),
    'attendanceDetail', coalesce(v_att_detail, '[]'::jsonb),
    'counselSlots', coalesce(
      (select jsonb_agg(slot order by slot->>'date')
       from (
         select jsonb_build_object(
                  'date', cs.date,
                  'remaining', cs.capacity - coalesce(rc.cnt, 0),
                  'reserved', exists (
                    select 1 from counsel_reservations cr2
                    where cr2.slot_id = cs.id and cr2.student_year_id = v_sy_id),
                  'cancelRequested', coalesce((
                    select cr3.cancel_requested from counsel_reservations cr3
                    where cr3.slot_id = cs.id and cr3.student_year_id = v_sy_id
                    limit 1), false)
                ) as slot
         from counsel_slots cs
         left join (
           select slot_id, count(*) as cnt
           from counsel_reservations group by slot_id
         ) rc on rc.slot_id = cs.id
         where cs.owner_id = v_owner
           and cs.date >= current_date
           and (
             cs.capacity - coalesce(rc.cnt, 0) > 0
             or exists (
               select 1 from counsel_reservations cr
               where cr.slot_id = cs.id and cr.student_year_id = v_sy_id)
           )
       ) s), '[]'::jsonb),
    'studentMemos', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', scm.id,
                'date', scm.date,
                'body', scm.body)
              order by scm.date, scm.created_at)
       from student_calendar_memos scm
       where scm.student_year_id = v_sy_id), '[]'::jsonb),
    'grades', jsonb_build_object('status', 'preparing'),
    'personalMessage', v_page.teacher_message,
    'vacationSpans', coalesce(
      (select jsonb_agg(jsonb_build_object('start', av.start_date, 'end', av.end_date)
                order by av.start_date)
       from academic_vacations av
       where av.owner_id = v_owner
         and av.start_date <= current_date + 93
         and av.end_date >= current_date - 31), '[]'::jsonb)
  );

  return jsonb_build_object('state', 'ok', 'payload', v_payload);
end;
$$;

comment on function get_public_page(text) is
  '공개 학생 안내 페이지 유일 읽기 진입점(v14, 0059). v13(0058) 기반. 추가: payload.subjectAliasPairs(이 학생 grade/class_no 의 누적 neis_timetable_slots ↔ homeroom_timetable_slots 를 같은 칸(isodow,교시)에서 짝지은 {std,act,count} 집계 — 클라이언트가 std별 최빈 act 로 과목 별칭 학습, 특별활동 제외는 TS). 나머지 v13 동일 — 금지 필드 불변.';
