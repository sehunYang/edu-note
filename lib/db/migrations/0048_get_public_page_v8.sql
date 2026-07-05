-- 0048_get_public_page_v8.sql — 공개 학생 안내 페이지 v8 (학생 출결 상세 확인).
--
-- v7(0046) 기반 재정의. 함수명·시그니처 동일(create or replace) → 호출부 변경 불필요.
--
-- v8 변경점 (딱 한 곳 추가):
--   (a) `attendanceDetail` 추가 — 출결 기록별 { date, kind, reason, periods } 목록.
--       학생이 출결 2D 표의 0 이 아닌 칸을 눌러 "언제 어떤 사유(카테고리)로" 처리됐는지
--       스스로 확인하는 용도. reason 은 **카테고리 enum**(인정/질병/미인정/기타)만 —
--       이미 2D 매트릭스에서 승인된 노출 축과 동일. note_field 자유텍스트는 절대 미참조.
--   ⚠ v7 의 다른 섹션(weekTodos is_public 필터, studentMemos, 급식 KST, 출결 1D/2D 등)은
--     그대로 유지(회귀 방지).
--
-- 0008 의 token→not_found/revoked/expired 판정 로직을 유지한다.
-- 함수는 create or replace 라 재적용 안전(기존 ACL 보존 — 0047 revoke 이후에도 유지).
-- ⚠ 커스텀 SQL(드리즐 저널 외) — DB 리셋 시 0047 다음에 따로 적용(오케스트레이터).

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
  v_payload       jsonb;
begin
  -- 1) 토큰 → 단일 공개 페이지 행 (없으면 not_found)
  select * into v_page from public_pages where token = p_token limit 1;
  if not found then
    return jsonb_build_object('state', 'not_found');
  end if;

  -- 2) 상태 체크 (0008 유지)
  if v_page.revoked_at is not null then
    return jsonb_build_object('state', 'revoked');
  end if;
  if v_page.expires_at is not null and v_page.expires_at <= now() then
    return jsonb_build_object('state', 'expired');
  end if;

  v_sy_id := v_page.student_year_id;  -- 이후 모든 조회는 이 단일 id 로만
  v_owner := v_page.owner_id;

  -- 2.5) 학생 본인 학적(학년/반/이름) — 본인 페이지라 이름 노출 OK
  select sy.grade, sy.class_no, sy.name
    into v_grade, v_class_no, v_student_name
  from student_years sy where sy.id = v_sy_id limit 1;

  -- 3) 출결 1D 사전집계 (성격별 횟수 + 미제출 신고서 유무). reason/note_field 미참조.
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

  -- 3.5) 출결 2D 매트릭스 (성격×사유 카운트). 승인된 노출 — 사유 '카테고리 카운트'만.
  -- note_field/reason 자유텍스트는 절대 미참조(카운트 숫자만).
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

  -- 3.7) v8: 출결 상세 목록 — 날짜·성격·사유 '카테고리'·교시만. 학생 본인 셀 클릭 확인용.
  -- note_field 자유텍스트는 절대 미참조. reason 축은 3.5 의 2D 와 동일한 승인 노출.
  select coalesce(jsonb_agg(jsonb_build_object(
           'date',    ar.date,
           'kind',    ar.kind,
           'reason',  ar.reason,
           'periods', to_jsonb(ar.periods))
         order by ar.date), '[]'::jsonb)
  into v_att_detail
  from attendance_records ar
  where ar.student_year_id = v_sy_id;

  -- 4) allowlist 페이로드 조립 (전 필드 coalesce/NULL-safe). 성적은 목업 → preparing.
  v_payload := jsonb_build_object(
    -- 머리말
    'studentName', v_student_name,
    -- 공통칸
    -- weekTodos = 월간 일정창(manual/neis, is_public 만) ∪ 본인 확정 상담예약(AC-6.1).
    'weekTodos', coalesce(
      (select jsonb_agg(item order by item->>'at')
       from (
         select jsonb_build_object('title', ce.title, 'at', ce.date) as item
         from calendar_events ce
         where ce.owner_id = v_owner
           and ce.date >= current_date - 31
           and ce.date <= current_date + 93
           and ce.source in ('manual', 'neis')
           and ce.is_public = true  -- v7: 학생 비공개 이벤트 제외 (0045)
         union all
         -- 본인 확정 상담예약을 캘린더 항목으로 반영(취소요청분 포함 — 아직 확정상태).
         select jsonb_build_object('title', '상담 예약', 'at', cs.date) as item
         from counsel_reservations cr
         join counsel_slots cs on cs.id = cr.slot_id
         where cr.student_year_id = v_sy_id
           and cs.owner_id = v_owner
           and cs.date >= current_date - 31
           and cs.date <= current_date + 93
       ) merged), '[]'::jsonb),  -- 월간 네비 창
    'commonNotice', (
      select tn.body from teacher_notes tn
      where tn.owner_id = v_owner
        and coalesce(tn.target_scope, 'all') = 'all'
      order by tn.sort_order, tn.created_at
      limit 1),  -- 하위호환: 첫 '전체' 한마디
    'notices', coalesce(
      (select jsonb_agg(tn.body order by tn.sort_order, tn.created_at)
       from teacher_notes tn
       where tn.owner_id = v_owner
         and coalesce(tn.target_scope, 'all') = 'all'), '[]'::jsonb),
    -- 개별 공지(AC-5.3): 이 학생 대상으로 매핑된 'individual' 한마디만. 'all' 과 병렬.
    'individualNotices', coalesce(
      (select jsonb_agg(tn.body order by tn.sort_order, tn.created_at)
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
    'meals', coalesce(
      -- meal_cache.payload = { meals: [ { mealType, menu: text[], calInfo, ntrInfo } ] }.
      -- v4: menu(메뉴 항목 평탄화)·calInfo·ntrInfo 를 **분리** 필드로 노출(표 렌더용).
      -- v5: (b) 메뉴 항목 사이를 E'\n' 로 합쳐 whitespace-pre-line 줄바꿈 렌더(AC-6.3).
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
         and mc.date = (now() at time zone 'Asia/Seoul')::date), '[]'::jsonb),  -- 당일만(KST, AC-6.2)
    -- 개별칸
    'attendanceSummary', coalesce(v_attendance, jsonb_build_object(
       'late', 0, 'earlyLeave', 0, 'absentPeriod', 0, 'absent', 0,
       'hasUnsubmittedReport', false)),
    'attendance2D', coalesce(v_attendance2d, '{}'::jsonb),
    'attendanceDetail', coalesce(v_att_detail, '[]'::jsonb),  -- v8
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
    -- 학생 개인 메모/일정(QC v6 ⑤, AC-5.4) — v_sy_id 스코프(본인만). { id, date, body }.
    'studentMemos', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', scm.id,
                'date', scm.date,
                'body', scm.body)
              order by scm.date, scm.created_at)
       from student_calendar_memos scm
       where scm.student_year_id = v_sy_id), '[]'::jsonb),
    'grades', jsonb_build_object('status', 'preparing'),  -- Phase 1 목업
    'personalMessage', v_page.teacher_message
  );

  return jsonb_build_object('state', 'ok', 'payload', v_payload);
end;
$$;

comment on function get_public_page(text) is
  '공개 학생 안내 페이지 유일 읽기 진입점(v8, 0048). v7(0046) 기반. 변경점: (a) attendanceDetail — 출결 기록별 날짜·성격·사유 카테고리·교시 목록(학생 셀 클릭 상세 확인용, note_field 자유텍스트 절대 미참조). 나머지 동작은 v7 동일: 토큰→단일 student_year_id, studentName, 전체/개별 공지, 월간 일정창(is_public)∪상담예약, 시간표, 당일 급식(KST), 출결 1D/2D, 상담 슬롯, studentMemos, 성적=preparing. 전 필드 NULL-safe.';
