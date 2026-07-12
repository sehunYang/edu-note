-- 0054_student_notice_reads.sql — 학생별 공지 읽음 상태(New 배지용). v12 준비.
-- 학생 페이지의 교사 한마디/개별 공지 New 배지를 "이 학생이 안 읽음" 기준으로 판정하기 위한
-- 읽음 기록. (student_year_id, note_id) 유일. read_at = 마지막 읽은 시각.
-- get_public_page(v12, 0055)가 `read_at >= teacher_notes.updated_at` 이면 '읽음'으로 보고,
-- 그렇지 않으면(미기록이거나 수정 이후 미열람) unread=true → New. 교사가 공지를 수정하면
-- updated_at 이 갱신되어 자동으로 다시 New 가 된다.
-- 토큰(학생) 스코프: 읽음 기록은 student-write.ts(markNoticeRead)가 토큰 해석 후에만 쓴다.
-- Drizzle 스키마: misc.ts studentNoticeReads.
-- ⚠ 커스텀 SQL(드리즐 저널 외) — scripts/apply-sql.mjs 직접 적용. 0053 다음(0055 이전)에 적용.

create table if not exists student_notice_reads (
  id uuid primary key default gen_random_uuid(),
  student_year_id uuid not null references student_years(id) on delete cascade,
  note_id uuid not null references teacher_notes(id) on delete cascade,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_student_notice_reads unique (student_year_id, note_id)
);

-- 보조 인덱스: note 삭제 cascade·note 기준 조회 대비.
create index if not exists idx_student_notice_reads_note
  on student_notice_reads (note_id);

-- RLS: anon 전면 차단(인증 앱 표면에서 직접 접근 없음). 쓰기는 service-role 어댑터
-- (PUBLIC_DATABASE_URL, student-write.ts)가 토큰 스코프 검증 후 수행, 읽기는
-- get_public_page(SECURITY DEFINER)가 전담. 방어적으로 RLS 를 켜고 정책은 비워 둔다.
alter table student_notice_reads enable row level security;
