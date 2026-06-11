-- 0016: event_kind 에 'etc'(기타) 값 추가 (QC v2 후속). 수동 전용 분류 — 자동 미부여.
-- ⚠ ADD VALUE 만(같은 파일/트랜잭션에서 새 값을 UPDATE 하면 "unsafe use of new value of
-- enum" 실패). apply-sql.mjs 는 파일을 단일 simple-query 로 실행 → 값 추가만 한다.
-- default(self_activity) 불변, 기존 행 remap 없음 → 별도 remap 파일 불필요.
-- 비가역(Postgres DROP VALUE 불가): 롤백 = 잔존(미사용 무해, 기존 dormant 값 선례).
alter type event_kind add value if not exists 'etc';
