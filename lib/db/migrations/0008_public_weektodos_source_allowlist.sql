-- 0008: 공개 페이지 weekTodos 소스 화이트리스트 (보안 하드닝, 계획 §3.2 allowlist)
--
-- get_public_page 의 weekTodos 는 0001 이래 calendar_events 의 '전 소스'를 노출해 왔다.
-- calendar_events.source enum 에는 personal(개인 일정)·task(업무 데드라인) 같은 교사 비공개
-- 항목이 포함될 수 있으므로(현재 생성 경로는 없으나 향후 추가 가능), 공개 표면에는
-- 학생에게 안전한 소스만 노출하도록 명시적으로 제한한다: 'manual'(공지실)·'neis'(학사일정).
-- 함수는 create or replace 라 재적용 안전.
--
-- ⚠ 커스텀 SQL(드리즐 저널 외) — DB 리셋 시 0001~0007 다음에 따로 적용.

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
  v_notice       text;
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

  -- 2.5) 공통 교사 한마디(공지실) — 소유자 teacher_profile 에서
  select public_notice into v_notice
  from teacher_profile where owner_id = v_page.owner_id limit 1;

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
         and ce.date < current_date + 7
         and ce.source in ('manual', 'neis')), '[]'::jsonb),  -- 0008: 학생 안전 소스만
    'commonNotice', v_notice,  -- 교사 한마디(공통) — 공지실에서 설정
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
  '공개 학생 페이지 유일 읽기 진입점. 토큰→단일 student_year_id, 출결 횟수 사전집계, 성적 목업 준비중, 공통 한마디=teacher_profile.public_notice, weekTodos=manual/neis 소스만. reason/note_field/원점수/개인·업무일정 미반환 (계획 §3.2, 0008).';
