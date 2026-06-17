-- 0042_student_calendar_memos.sql — 학생 안내 페이지 전용 개인 메모/일정. QC v6 ⑤(AC-5.4).
-- 학생 캘린더 날짜 클릭 → 모달로 개인 메모/일정 조회·추가·수정·삭제(CRUD).
-- 토큰(학생) 스코프: 해당 학생만 자신의 메모를 보고 CRUD하며, 교사·타학생에게 절대
-- 비노출(get_public_page v6 가 v_sy_id 스코프로만 노출, 쓰기는 student-write.ts 토큰 해석).
-- 일자별 다건 허용(today_calendar_memos 패턴) → (student_year_id, date) unique 없이 인덱스만.
-- Drizzle 스키마: misc.ts studentCalendarMemos.
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용. 0040 다음에 적용.

create table if not exists student_calendar_memos (
  id uuid primary key default gen_random_uuid(),
  student_year_id uuid not null references student_years(id) on delete cascade,
  date date not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 보조 인덱스: (student_year_id, date) 일자별 조회. unique 아님(다건 허용).
create index if not exists idx_student_calendar_memos_student_date
  on student_calendar_memos (student_year_id, date);

-- RLS: anon 전면 차단(인증 앱 표면에서 직접 접근 없음). 쓰기는 service-role 어댑터
-- (PUBLIC_DATABASE_URL, student-write.ts)가 RLS 우회로 토큰 스코프 검증 후 수행.
-- 읽기는 get_public_page(SECURITY DEFINER)가 전담. 따라서 authenticated 정책은 불필요하나,
-- 방어적으로 RLS 를 켜고 정책을 비워 둔다(service-role/definer 만 접근).
alter table student_calendar_memos enable row level security;
