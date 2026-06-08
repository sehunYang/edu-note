-- get_public_page(token): 공개 학생 페이지의 유일 읽기 진입점 (계획 §3.2)
--
-- 보안 규칙:
--  * 클라이언트는 학번/ID 를 전달하지 않는다. 토큰만으로 단 하나의 student_year_id 를
--    해석하고, 모든 하위 조회를 그 id 로만 필터한다.
--  * 출결은 DB 에서 성격별 '횟수'로 사전집계한다. reason / note_field 는 SELECT 하지 않는다.
--  * 성적은 Phase 1 목업이므로 '준비중'(preparing)으로 반환 — 어떤 값도 직렬화하지 않는다.
--  * 폐기/만료 토큰은 상태 마커를 반환(앱이 404/410 매핑). 유효하지 않은 토큰은 not_found.
--
-- 반환: jsonb { state: 'ok'|'not_found'|'revoked'|'expired', payload?: {...allowlist...} }

create or replace function get_public_page(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page         public_pages%rowtype;
  v_sy_id        uuid;
  v_attendance   jsonb;
  v_payload      jsonb;
begin
  -- 1) 토큰 → 단일 공개 페이지 행 (없으면 not_found)
  select * into v_page from public_pages where token = p_token limit 1;
  if not found then
    return jsonb_build_object('state', 'not_found');
  end if;

  -- 2) 상태 체크
  if v_page.revoked_at is not null then
    return jsonb_build_object('state', 'revoked');
  end if;
  if v_page.expires_at is not null and v_page.expires_at <= now() then
    return jsonb_build_object('state', 'expired');
  end if;

  v_sy_id := v_page.student_year_id;  -- 이후 모든 조회는 이 단일 id 로만

  -- 3) 출결 사전집계 (성격별 횟수 + 미제출 신고서 유무). reason/note_field 미참조.
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

  -- 4) allowlist 페이로드 조립 (공통칸 + 개별칸). 성적은 목업 → preparing.
  v_payload := jsonb_build_object(
    -- 공통칸
    'weekTodos', coalesce(
      (select jsonb_agg(jsonb_build_object('title', ce.title, 'at', ce.date))
       from calendar_events ce
       where ce.owner_id = v_page.owner_id
         and ce.date >= current_date
         and ce.date < current_date + 7), '[]'::jsonb),
    'commonNotice', null,  -- 교사 한마디(공통)는 추후 설정 소스 연결
    'timetable', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'weekday', ts.weekday, 'period', ts.period, 'subjectName', s.name))
       from enrollments e
       join timetable_slots ts on ts.section_id = e.section_id
       join course_sections cs on cs.id = e.section_id
       join subjects s on s.id = cs.subject_id
       where e.student_year_id = v_sy_id), '[]'::jsonb),
    'meals', coalesce(
      (select jsonb_agg(jsonb_build_object('date', mc.date, 'menu', mc.payload->>'menu'))
       from meal_cache mc
       where mc.owner_id = v_page.owner_id
         and mc.date >= current_date
         and mc.date < current_date + 7), '[]'::jsonb),
    -- 개별칸
    'attendanceSummary', coalesce(v_attendance, jsonb_build_object(
       'late', 0, 'earlyLeave', 0, 'absentPeriod', 0, 'absent', 0,
       'hasUnsubmittedReport', false)),
    'grades', jsonb_build_object('status', 'preparing'),  -- Phase 1 목업
    'personalMessage', v_page.teacher_message
  );

  return jsonb_build_object('state', 'ok', 'payload', v_payload);
end;
$$;

comment on function get_public_page(text) is
  '공개 학생 페이지 유일 읽기 진입점. 토큰→단일 student_year_id, 출결 횟수 사전집계, 성적 목업 준비중. reason/note_field/원점수 미반환 (계획 §3.2).';
