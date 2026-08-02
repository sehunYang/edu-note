-- 0060_class_session_makeup.sql — 결손 차시의 보강 기록 (연간시나리오 기능갭 #3).
--
-- class_sessions.status 는 planned/done/not_held 셋뿐이라, 출장·행사로 빠진 차시를
-- not_held 로 찍으면 잔여차시(=경계까지의 planned)에서 그냥 사라졌다. 실제로는 진도가
-- 한 차시 밀린 건데 그 손실이 어디에도 남지 않아, 교사가 "몇 차시를 못 나갔고 그중
-- 몇 개를 메웠는지"를 앱에서 알 수 없었다.
--
-- 보강을 별도 차시 행으로 만들지 않는 이유: class_sessions 는 (section_id, date)
-- 유니크인데 보강은 보통 다른 반 시간이나 방과후에 잡혀서 그 날짜에 이미 정규 차시가
-- 있으면 충돌한다. 결손 행에 "언제 메웠는지"만 적으면 모델이 단순하고 시수 계산
-- (tallySessions)도 건드리지 않는다. makeup_date 가 비어 있으면 미회복 결손이다.
--
-- 순수 가산(add column if not exists) — 기존 행은 전부 null 이라 무해하고 재적용 안전.
-- RLS 는 class_sessions 의 기존 owner_rw 정책이 그대로 덮는다(컬럼 추가는 정책 무관).
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 로 직접 적용.

alter table class_sessions
  add column if not exists makeup_date date;

alter table class_sessions
  add column if not exists makeup_note text;

comment on column class_sessions.makeup_date is
  '결손(not_held) 차시를 보강한(또는 보강 예정인) 날짜. null=미회복.';
comment on column class_sessions.makeup_note is
  '보강 메모(장소·교시 등). 선택.';
