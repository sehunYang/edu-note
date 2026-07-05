-- 0047_public_page_hardening.sql — 공개 페이지 보안 강화 (보안점검 2026-07 ①·④).
--
-- ① get_public_page EXECUTE 회수: Postgres 는 함수 실행권한을 기본으로 PUBLIC 에
--    부여한다 → Supabase PostgREST 의 /rest/v1/rpc/get_public_page 를 anon 키로 직접
--    호출할 수 있는 별도 진입구가 생긴다(토큰 필요하니 추가 유출은 없지만 TS allowlist
--    심층방어·앱 레이트리밋을 우회). 앱은 service-role/직접연결(owner)로만 호출하므로
--    PUBLIC 회수로 영향 없이 닫는다. create or replace 는 기존 ACL 을 보존하므로
--    이후 v8+ 재정의에도 이 회수는 유지된다.
--
-- ④ 토큰 기본 만료 = 발급일 + 1년: 기존 무기한(null) 토큰을 created_at + 1년으로
--    백필하고, 컬럼 기본값도 now() + 1년으로 설정한다(앱 issuePublicPage 와 동일).
--    Drizzle 스키마 대응: lib/db/schema/misc.ts publicPages.expiresAt.
--
-- ⚠ 커스텀 SQL(드리즐 저널 외) — DB 리셋 시 0046 다음에 따로 적용(오케스트레이터).

-- ① EXECUTE 회수 (PUBLIC 기본 부여 제거) + service_role 만 명시 허용
revoke execute on function get_public_page(text) from public;

do $$
begin
  -- Supabase 외 환경(로컬 postgres 등)에는 service_role 이 없을 수 있다.
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function get_public_page(text) to service_role;
  end if;
end $$;

-- ④ 만료 기본값 + 기존 무기한 토큰 백필 (발급일 + 1년)
alter table public_pages
  alter column expires_at set default (now() + interval '1 year');

update public_pages
  set expires_at = created_at + interval '1 year',
      updated_at = now()
  where expires_at is null;
