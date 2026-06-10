-- 0011_course_eval.sql — 수업 관리: 지필 시행여부 + 시험일/수행일/분반역할 (QC v1 C5)
-- subjects 에 지필 시행 플래그, subject_exams(C3 태깅 → C5 파생), section_performance_dates,
-- section_roles 신규. examBoundaryDate 는 읽기시점 파생(subject_exams 중 오늘 이후 최소).
-- ⚠ 커스텀 SQL(드리즐 저널 외) → DB 리셋 시 db:migrate 후 따로 적용할 것.

alter table "subjects" add column if not exists "jipil_mid_enabled" boolean not null default true;
alter table "subjects" add column if not exists "jipil_final_enabled" boolean not null default true;

create table if not exists "subject_exams" (
  "id" uuid primary key default gen_random_uuid(),
  "owner_id" uuid not null,
  "subject_id" uuid not null references "subjects"("id") on delete cascade,
  "semester" integer not null,
  "ordinal" integer not null,
  "date" date,
  "enabled" boolean not null default true,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "uq_subject_exams" unique ("subject_id", "semester", "ordinal")
);

create table if not exists "section_performance_dates" (
  "id" uuid primary key default gen_random_uuid(),
  "owner_id" uuid not null,
  "section_id" uuid not null references "course_sections"("id") on delete cascade,
  "performance_item_id" uuid not null references "performance_items"("id") on delete cascade,
  "date" date,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "uq_section_performance_dates" unique ("section_id", "performance_item_id")
);

create table if not exists "section_roles" (
  "id" uuid primary key default gen_random_uuid(),
  "owner_id" uuid not null,
  "enrollment_id" uuid not null references "enrollments"("id") on delete cascade,
  "title" text not null,
  "description" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
