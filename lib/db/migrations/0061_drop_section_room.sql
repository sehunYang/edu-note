-- 0061_drop_section_room.sql — 특별실 예약 흔적 제거 (연간시나리오 기능갭 #2 폐기).
--
-- 기획안의 "특별실(과학실·컴퓨터실) 예약 여부 실시간 확인"을 염두에 두고 0000 에서
-- course_sections.room / timetable_slots.room 을 만들어 뒀는데, 끝내 구현되지 않았다.
-- 전수 조사 결과 이 두 컬럼을 **읽거나 쓰는 코드가 한 곳도 없었고**(유일한 참조가
-- lib/public/dto.ts 에서 학생 페이지로 새지 않게 '버리는' 코드였다), get_public_page
-- 를 포함한 어떤 SQL 함수도 참조하지 않는다.
--
-- 사용자 결정으로 기능 자체를 폐기한다. "학교 전체 실시간 예약"은 교사 1인용 앱에서
-- 성립하지 않는 요구였다(전 교사가 공유하는 예약 원장이 있어야 한다). 죽은 컬럼을
-- 남겨 두면 다음 사람이 "쓰다 만 기능"으로 오해하므로 지운다.
--
-- 데이터 손실 없음 — 적용 시점 실측으로 두 컬럼 모두 전 행 NULL 이었다
-- (course_sections 6행 중 0, timetable_slots 16행 중 0).
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 로 직접 적용.

alter table course_sections drop column if exists room;
alter table timetable_slots drop column if exists room;
