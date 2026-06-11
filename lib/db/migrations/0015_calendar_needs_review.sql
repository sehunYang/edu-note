-- 0015: calendar_events.needs_review (미분류 자동분류 경고 플래그, QC v2 2-1 단계 B).
-- fallback self_activity 로 떨어진 이벤트만 true 세팅(분류기/sync). additive·idempotent.
alter table calendar_events add column if not exists needs_review boolean not null default false;
