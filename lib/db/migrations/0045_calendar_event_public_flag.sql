-- 0045_calendar_event_public_flag.sql — 캘린더 이벤트 공개 여부 플래그 (보안점검 2026-07 ③).
--
-- 배경: get_public_page 의 weekTodos 가 owner 의 manual/neis 캘린더 이벤트 제목을
-- 반 전체 학생 페이지에 노출한다. 특정 학생 관련 민감 제목("○○ 상담" 등)을 학생에게
-- 숨길 수 있도록 이벤트별 is_public 플래그를 도입한다. 기본 true(기존 동작 보존).
-- 노출 필터링은 0046(get_public_page v7)에서 적용한다.
--
-- Drizzle 스키마 대응: lib/db/schema/misc.ts calendarEvents.isPublic.
-- ⚠ 커스텀 SQL(드리즐 저널 외) — DB 리셋 시 0044 다음에 따로 적용(오케스트레이터).

alter table calendar_events
  add column if not exists is_public boolean not null default true;

comment on column calendar_events.is_public is
  '학생 공개 페이지(weekTodos) 노출 여부. false=교사 내부용(학생 비공개). 기본 true.';
