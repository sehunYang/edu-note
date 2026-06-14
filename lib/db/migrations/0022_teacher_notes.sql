-- 0022_teacher_notes.sql — 다중 교사 한마디 + 공지 내용 필드(QC v3 Part B, AC-10.1~10.2).
-- 기존 단일 teacher_profile.public_notice 를 teacher_notes 첫 행(sort_order=0)으로 이행.
-- get_public_page 의 다중노트 배열 반환은 US-B13(원자적 브랜치 머지)에서 함수 재정의로 처리
-- → 이 파일은 순수 additive(공개페이지는 US-B13 전까지 기존 단일 한마디 계속 노출).
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용.

create table if not exists teacher_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  body text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table teacher_notes enable row level security;
drop policy if exists "owner_rw" on teacher_notes;
create policy "owner_rw" on teacher_notes for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 기존 단일 한마디 이행(idempotent: 해당 owner 의 teacher_notes 가 비어있을 때만).
insert into teacher_notes (owner_id, body, sort_order)
select tp.owner_id, tp.public_notice, 0
from teacher_profile tp
where tp.public_notice is not null and tp.public_notice <> ''
  and not exists (
    select 1 from teacher_notes tn where tn.owner_id = tp.owner_id
  );

-- 공지(할일=calendar_events manual)에 '내용' 필드 추가(제목 외 본문). nullable.
alter table calendar_events add column if not exists content text;
