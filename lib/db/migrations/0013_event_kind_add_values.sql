-- 0013: event_kind 신규 값 추가 (QC v2 2-1 단계 B). ⚠ 값 추가만 — 같은 트랜잭션/파일에서
-- 새 값을 사용(UPDATE)하면 "unsafe use of new value of enum" 실패하므로 remap은 0014로 분리.
-- apply-sql.mjs 는 파일을 단일 simple-query(암묵 tx)로 실행 → 이 파일은 값 추가만 한다.
alter type event_kind add value if not exists 'mock_exam';
alter type event_kind add value if not exists 'holiday';
alter type event_kind add value if not exists 'self_activity';
alter type event_kind add value if not exists 'career_activity';
alter type event_kind add value if not exists 'vacation';
