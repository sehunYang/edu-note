-- 0039_today_calendar_memos.sql — 오늘의학교 전용 일자별 메모. QC v5 c7 (US-0 Step 0.2).
-- 날짜 클릭 → 모달로 그날 학사일정·상담·메모 표시, "일정 추가하기"로 메모 추가.
-- 일자별 다건 허용(수정/삭제 가능) → (owner_id, date) unique 두지 않음.
-- 오직 오늘의학교 캘린더에서만 노출(공개 페이지/타 캘린더 비노출).
-- Drizzle 스키마: misc.ts todayCalendarMemos.
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용.

create table if not exists today_calendar_memos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  date date not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 보조 인덱스: (owner_id, date) 일자별 조회. unique 아님(다건 허용).
create index if not exists idx_today_calendar_memos_owner_date
  on today_calendar_memos (owner_id, date);

-- RLS: anon 전면 차단, 로그인 사용자=본인 행만 (0002 패턴).
alter table today_calendar_memos enable row level security;
drop policy if exists "owner_rw" on today_calendar_memos;
create policy "owner_rw" on today_calendar_memos for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
