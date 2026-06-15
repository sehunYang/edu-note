-- 0035_meal_nutrition.sql — 급식 영양정보 + 상담 취소요청 (QC v4 US-6, AC-6.6/6.7).
--
-- (1) 급식 영양정보(NTR_INFO) 저장 — DDL 없음(의도적 선택).
--     영양정보는 meal_cache.payload(jsonb) 안의 meals[].ntrInfo 로 저장한다.
--     payload = { meals: [ { mealType, menu: text[], calInfo, ntrInfo } ] }.
--     새 컬럼을 추가하지 않는 이유: payload 가 이미 끼니별 가변 구조를 담는 jsonb 이고,
--     calInfo 와 동일한 레벨에 ntrInfo 를 함께 두는 것이 가장 단순하며(스키마 무변경),
--     get_public_page v4(0036) 가 payload->'meals' 를 평탄화해 calInfo/ntrInfo 를 분리
--     노출한다. 따라서 meal_cache 에 대한 alter table 은 필요하지 않다.
--
-- (2) 상담 취소요청 — 추가/멱등 컬럼.
--     학생이 본인 예약의 취소를 '요청'(cancel_requested=true)하면 교사가 별도로 승인한다.
--     승인 시 예약 행을 삭제(정원 환원)한다. 기본 false = 기존 행 하위호환.
--
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용. 추가/멱등.

alter table counsel_reservations
  add column if not exists cancel_requested boolean not null default false;
