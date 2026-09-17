-- 0064_attendance_field_trip_link.sql — 교외체험이 만든 출결에 소속 체험을 연결한다.
--
-- 이제까지 체험학습이 자동 생성한 인정결석은 비고 '체험학습' 문자열로만 알아볼 수 있었다.
-- 체험을 수정·삭제하면 그 출결도 따라 바뀌어야 하는데, 문자열은 교사가 손으로 똑같이
-- 적을 수도 있고, 같은 학생의 체험 두 건이 날짜를 겹치면 누구 것인지 가릴 수 없다.
-- 그래서 출결 행이 자기를 만든 체험을 FK 로 가리키게 한다. null = 수동 입력(체험이
-- 건드리지 않는다). 체험 행이 지워지면 cascade 로 함께 사라진다.
--
-- 백필: 기존 데이터는 (학생, 기간, 결석, 인정, 비고 '체험학습')로 소속을 복원한다.
-- 겹치는 체험이 있으면 시작일이 빠른 쪽에 붙는다(그 날짜의 결석 행은 어차피 하나뿐이다).
--
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/migrate.mjs 가 적용. additive·idempotent.

alter table attendance_records
  add column if not exists field_trip_id uuid
    references field_trip_reports(id) on delete cascade;

create index if not exists idx_attendance_records_field_trip
  on attendance_records (field_trip_id)
  where field_trip_id is not null;

update attendance_records a
set field_trip_id = m.trip_id
from (
  select distinct on (r.id) r.id as record_id, t.id as trip_id
  from attendance_records r
  join field_trip_reports t
    on t.owner_id = r.owner_id
   and t.student_year_id = r.student_year_id
   and r.date between coalesce(t.start_date, t.trip_date)
                  and coalesce(t.end_date, t.trip_date)
  where r.field_trip_id is null
    and r.kind = 'absent'
    and r.reason = 'accepted'
    and r.note_field = '체험학습'
  order by r.id, coalesce(t.start_date, t.trip_date), t.created_at
) m
where a.id = m.record_id;
