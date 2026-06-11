-- 0014: 기존 event_kind 값 매핑 + default 변경 (⚠ 0013 커밋 완전 후 별도 실행).
-- 구 값(vacation_start/end/none)은 미사용으로 잔존(타입 재생성=파괴적이라 회피).
update calendar_events set event_kind = 'vacation' where event_kind in ('vacation_start', 'vacation_end');
update calendar_events set event_kind = 'self_activity' where event_kind = 'none';
alter table calendar_events alter column event_kind set default 'self_activity';
