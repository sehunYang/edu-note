# 구글 캘린더 단방향 동기화 + 일정 시간 필드 — 구현 계획 v3 (컨센서스)

상태: **pending approval** · 2026-07-05 · ralplan(deliberate — OAuth 토큰 보안 요소)
검토: Architect APPROVE_WITH_IMPROVEMENTS(5건 v3 반영) → **Critic APPROVED**(minor 2건
v4 반영) — 컨센서스 도달, 1회전 종결

## 요구사항 요약

1. 오늘의 학교 캘린더에서 **교사가 직접 추가한 일정만** 본인 구글 캘린더(primary)로
   자동 동기화한다 — 생성·수정·삭제 모두 전파(단방향 push).
2. 일정에 **선택적 시작/종료 시간**을 추가한다(미입력 = 종일 일정).
3. 사용자가 직접 수행할 외부 설정(Google Cloud·Vercel)은 쉬운 단계별 매뉴얼로 제공한다.

코드 조사·Architect 실측으로 확정된 사실:
- 오늘의 학교 "일정 추가하기"는 `today_calendar_memos`(0039, `lib/db/schema/misc.ts:71`)에
  저장된다(`app/(shell)/today/actions.ts:60` `createMemoAction` →
  `lib/db/queries/today-memo.ts:26`). NEIS 학사일정·상담·업무와 **테이블이 분리**되어
  "내가 추가한 일정만" 조건이 구조적으로 보장된다(AC-9의 전제).
- 로그인은 Supabase 구글 OAuth(`app/login/login-button.tsx:13`)·PKCE 콜백
  (`app/auth/callback/route.ts:23`). 현재 콜백은 `data.session`을 버리므로
  refresh token 캡처는 이 지점 수정이 유일 경로(Architect 확인).
- `lib/db/index.ts:22`의 서버 커넥션은 `postgres` 역할(BYPASSRLS,
  `docs/SUPABASE_SETUP.md:51`) → "정책 없는 RLS 테이블 = PostgREST 전면차단 + 서버만
  접근" 보안 모델 성립(Architect 확증).
- `get_public_page`(v8, 0048)는 `today_calendar_memos` 미참조 → 공개 표면 무영향.
- `lib/db/queries/backup.ts`는 `today_calendar_memos`를 백업하지 않음(참조 부재 —
  v2의 "백업 반영" 항목은 오기였음, 제거).

## RALPLAN-DR 요약

### 원칙 (Principles)
1. **오늘의 학교 = 진실원**: 단방향 push만. 양방향 충돌 해소 로직을 절대 만들지 않는다.
2. **비밀은 서버 전용**: 구글 토큰(refresh+access 캐시)은 AES-256-GCM 암호화 + RLS
   전면차단 테이블. 클라이언트로는 연결 여부(boolean)와 오류 문자열만 내려간다.
3. **동기화 실패는 로컬을 막지 않는다**: 구글 push는 best-effort. 실패해도 일정 저장은
   성공하고, 상태를 가시화(last_error)한 뒤 다음 저장에서 재시도한다.
4. **기존 관례 준수**: additive 커스텀 SQL 마이그(apply-sql.mjs), 순수 도메인 함수 +
   단위테스트, ownerId 스코프 쿼리, RUN_DB_ITEST 게이트, fail-closed allowlist.
5. **작은 검증 단계**: 각 단계가 독립적으로 tsc/test green을 유지한다.

### 결정 동인 (Decision Drivers)
1. **쓰기가 필요** → 읽기 전용 ICS로는 불가, Google Calendar API가 유일 경로.
2. **단독 사용자·Vercel Hobby** → 최소 인프라(웹훅·큐 없음), 구글 검증 심사 회피,
   서버액션 지연 예산을 Hobby 함수 상한 안에 고정.
3. **기존 Supabase 구글 OAuth 재사용** → 증분 동의만 추가하면 별도 로그인 체계 불필요.

### 검토한 대안 (Options)
- **A′. Calendar API 단방향 push + 결정론적 멱등 이벤트 ID (채택)** — 구글 이벤트 id를
  메모 UUID에서 파생(하이픈 제거 32-hex, 구글 규격 a–v/0–9·5–1024자 충족). 장점: 완전
  자동 + **재시도가 자동 멱등이라 중복 구조적 불가** + `google_event_id` 저장 배관 자체가
  불필요. 단점: 파생 id 규격 검증 필요(경미).
- **A. push + 저장형 `google_event_id` 매핑 (기각)** — insert 성공 후 응답 유실/DB 기록
  실패 창에서 재시도가 **구글 이벤트를 중복 생성**(Architect HIGH 결함). AC-4 위반
  가능성으로 invalidation.
- **B. URL 템플릿 "구글 캘린더에 추가" 버튼 (기각)** — 무설정이지만 일정마다 수동 클릭,
  수정·삭제 전파 불가 → "자동 동기화" 요구 불충족. (Architect steelman: 단독 사용자에겐
  B로 80% 커버 후 필요 시 A 승격이 위험 대비 가치가 높다는 반론이 성립하나, 사용자가
  완전 자동을 명시 요구·승인함 — A′가 B의 주요 리스크(중복·배관)를 제거해 반론 흡수.)
- **C. 양방향 동기화 (기각)** — 웹훅 채널 갱신·충돌 해소 복잡도, Hobby 제약. 단방향을
  사용자가 명시 승인.
- **토큰 저장 대안**: Supabase 세션 `provider_token` 단독(1시간 만료·갱신 불가 → 기각)
  vs **refresh token 암호화 저장 + 직접 갱신 + access token 만료캐시(채택)**. Supabase는
  provider 토큰을 자동 갱신하지 않으므로(콜백 캡처가 유일 지점) 후자가 유일하게 지속 가능.

## 수용 기준 (Acceptance Criteria — 전부 검증 가능)

- **AC-1** 시간 미입력 저장 → `start_time`/`end_time` = null 저장, 연결 시 구글에
  **종일 이벤트**(start.date=당일, end.date=익일 — exclusive)가 **파생 id**로 생성된다.
- **AC-2** 시작 14:00·종료 미입력 → 구글에 14:00~15:00(+1h 기본), timeZone
  'Asia/Seoul', dateTime은 오프셋 없는 로컬 문자열("YYYY-MM-DDTHH:MM:00").
- **AC-3** 종료 < 시작 또는 시작 없이 종료만 입력 → 저장 거부 + 인라인 오류 메시지.
- **AC-4** 같은 메모를 두 번 push(재시도 포함)해도 구글 이벤트는 **정확히 1개**
  (결정론 id로 구조 보장; insert 409 시 PATCH 폴백으로 성공 처리).
- **AC-5** 삭제 → 파생 id로 구글 삭제. 이미 지워진 경우(404/410)에도 로컬 삭제 성공.
- **AC-6** 연결 없음 → 기존과 동일 동작, 구글 HTTP 호출 0회.
- **AC-7** 구글 push 실패(네트워크·토큰) → 로컬 저장은 성공, `last_error` 기록 +
  프로필 카드·오늘의 학교 캘린더 상단에 "구글 동기화 오류" 표시, 다음 수정·저장 시
  자동 재시도(멱등이라 안전). `invalid_grant`는 "구글 재연결 필요" 문구로 구분 표시.
- **AC-8** 토큰(원문·암호문)은 클라이언트 응답에 포함되지 않는다(연결 상태 조회는
  `{connected, lastError}`만 반환). 콜백은 `ALLOWED_EMAIL` 일치 시에만 토큰을 저장
  (fail-closed, `lib/auth/owner.ts:38` 관례).
- **AC-9** NEIS·상담·업무 일정은 구글로 전송되지 않는다(push 코드가
  `today_calendar_memos` 경로에만 존재 — 코드 리뷰 + 통합테스트).
- **AC-10** 연결 해제 → connections 행 삭제, 이후 CRUD는 구글 호출 0회. 기존에 넘어간
  구글 이벤트는 남는다(문서화된 동작).
- **AC-11** 구글에서 사용자가 이벤트를 직접 삭제한 뒤 앱에서 그 메모를 수정하면,
  PATCH 404/410 → insert(409 시 status:'confirmed' PATCH로 부활) 폴백으로 재생성된다
  (진실원 원칙 1).
- **AC-12** access token 캐시가 유효(만료 60초 전 여유)하면 정상 경로에서 토큰 갱신
  HTTP 호출이 발생하지 않는다(구글 왕복 1회). 이벤트 호출 타임아웃 3s, 갱신 5s —
  최악 합계가 Hobby 함수 상한(10s) 아래(≤8s + DB 기록 여유).
- **AC-13** 삭제 push가 실패해도 로컬 삭제는 성공한다(원칙 3). 이 경우 구글 이벤트가
  고아로 남을 수 있으며 이는 **의도된 동작**(AC-10의 잔존과 동일 클래스)이다 —
  `last_error` 에 기록해 가시화하고, 사용자는 구글에서 수동 삭제 가능(문서화·Critic
  minor-2 결정: 원칙 3 "실패가 로컬을 막지 않는다"와 정합인 (a)안 채택).

## 구현 단계

### 1단계 — 마이그레이션 0049 (additive · idempotent)
`lib/db/migrations/0049_google_calendar_sync.sql` + `lib/db/schema/misc.ts` 갱신:
```sql
alter table today_calendar_memos
  add column if not exists start_time time,        -- null=종일
  add column if not exists end_time time;
-- google_event_id 컬럼 없음: 이벤트 id는 메모 UUID에서 결정론 파생(멱등 설계 A′).

create table if not exists google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique,
  refresh_token_enc text not null,                 -- AES-256-GCM 암호문
  access_token_enc text,                           -- 만료캐시(AC-12). null 허용
  access_token_expires_at timestamptz,
  calendar_id text not null default 'primary',
  sync_enabled boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table google_calendar_connections enable row level security;
-- 정책 없음 = PostgREST(anon/authenticated) 전면 차단. 서버 드리즐 커넥션만 접근
-- (lib/db/index.ts 커넥션은 postgres 역할 BYPASSRLS — Architect 확증).
```
⚠ 커스텀 SQL(드리즐 저널 외) — DB 리셋 시 0048 다음 적용.

### 2단계 — 순수 도메인: `lib/domain/google-event.ts` (신규) + 단위테스트
- `deriveGoogleEventId(memoId)`: UUID 하이픈 제거·소문자 32-hex. 구글 이벤트 id 규격
  (charset a–v/0–9, 길이 5–1024) 준수를 테스트로 고정.
- `validateMemoTime(startTime, endTime)`: HH:MM 형식, 종료≥시작, 시작 없는 종료 거부.
- `buildGoogleEventPayload({ date, startTime, endTime, content })`:
  - 종일: `{ summary, description, start:{date}, end:{date: 익일} }` (end-exclusive,
    날짜 연산은 UTC 문자열 연산 — 기존 `weekdayOf` 관례와 동일).
  - 시간: `{ start:{dateTime:"YYYY-MM-DDTHH:MM:00", timeZone:"Asia/Seoul"}, end:{…} }`,
    종료 미입력 시 시작+1시간(23:30 등 자정 경계는 익일 이월).
  - summary = content 첫 줄(최대 80자), description = 전체 content.
- `isAccessTokenFresh(expiresAt, now)`: 만료 60초 전 여유 판정(AC-12, 순수 함수).

### 3단계 — 연동 어댑터: `lib/integrations/google-calendar.ts` (신규, server-only)
- `encryptToken`/`decryptToken`: Node crypto AES-256-GCM(iv 12B + tag 16B, base64).
  키 = env `GOOGLE_TOKEN_ENC_KEY`(base64 32바이트). 복호화 실패는 명시적 오류 →
  호출측이 "재연결 필요"로 강등(크래시 금지 — 사전부검 2).
- `refreshAccessToken(refreshToken)`: POST `oauth2.googleapis.com/token`, 타임아웃 5s.
  `invalid_grant`를 구분된 오류 타입으로 반환(재연결 필요 신호).
- `insertEvent(token, calendarId, id, payload)` / `patchEvent` / `deleteEvent`:
  `www.googleapis.com/calendar/v3/calendars/{calendarId}/events…`, 타임아웃 3s.
  - insert 409(id 충돌·취소된 이벤트 포함) → `patchEvent(…, {…payload, status:'confirmed'})`
    폴백(부활 처리, AC-11).
  - patch 404/410 → insert 폴백. delete 404/410 → 무시(성공 취급).

### 4단계 — 쿼리: `lib/db/queries/google-calendar.ts` (신규) + `today-memo.ts` 확장
- connections: `getGoogleConnection` / `upsertGoogleConnection`(refresh 갱신 시
  access 캐시 무효화) / `deleteGoogleConnection` / `setGoogleSyncError(owner, msg|null)`
  / `cacheAccessToken(owner, tokenEnc, expiresAt)`.
- today-memo(Critic 참조 정정): `TodayMemoRow`(`today-memo.ts:13-17`)에
  `startTime`/`endTime` 추가, **두 select 모두**(`listTodayMemos` :26,
  `listTodayMemosInRange` :49) 확장, `createTodayMemo`(:66)/`updateTodayMemo`에
  시간 인자 추가.
- `lib/db/queries/audit.ts`의 strict union `AuditEvent`(:11-122)에
  **`| "gcal_sync_fail"` 추가**(Critic minor-1 — 누락 시 5단계에서 tsc 실패, 원칙 5 위반).

### 5단계 — 동기화 훅: `app/(shell)/today/actions.ts`
공통 헬퍼 `pushMemoToGoogle(db, ownerId, memo)`(best-effort, 원칙 3):
1. 연결 조회(없음/sync_enabled=false → no-op) → 2. access 캐시 신선하면 사용, 아니면
   refresh 후 캐시(AC-12) → 3. `deriveGoogleEventId(memo.id)`로 insert(신규)/patch(수정)
   → 폴백 규칙은 3단계 참조 → 4. 성공 시 `last_error=null`, 실패 시 원인 기록
   (`invalid_grant` → "구글 재연결 필요"). 전 과정 try/catch — 로컬 결과에 영향 없음.
- `createMemoAction(date, content, startTime?, endTime?)`: `validateMemoTime` → DB 저장
  → push. `updateMemoAction(...)`: 동일. `deleteMemoAction`: 구글 delete(404 무시,
  실패해도 진행 — AC-13) → DB 삭제.
- audit: 실패 시 `gcal_sync_fail`(원인 포함) 기록 — 관측성(사전부검 1·3).
  단, 함수가 Hobby 상한으로 push 도중 강제 종료되면 그 1회는 last_error 조차 못 남기고
  조용히 유실될 수 있다(Critic 지적) — 다음 편집 시 멱등 재시도로 자가 치유되는 것이
  설계상 안전망이며, 타임아웃 예산(≤8s)이 1차 방어다.

### 6단계 — OAuth 증분 동의 + 콜백 가드
- `app/auth/callback/route.ts`: `exchangeCodeForSession` 반환 `data.session`에서
  `provider_refresh_token` 존재 시 — **`session.user.email`이 `ALLOWED_EMAIL`
  (`lib/auth/owner.ts:38`)과 일치할 때만** — 암호화 후 `upsertGoogleConnection`
  (fail-closed, Architect MED-3). 일반 로그인은 스코프가 없어 refresh token이 안
  내려오므로 영향 없음.
  - **executor 노트(Critic)**: 기존 `next` 오픈 리다이렉트 가드와 `?error=auth` 실패
    경로는 절대 변경하지 않는다(회귀 방지). 최초 구현 시 `provider_refresh_token`
    **존재 여부만**(값 금지) 1회 콘솔 확인으로 Supabase 전달을 실증한다.
- `app/(shell)/setting/profile/`에 "구글 캘린더" 카드(신규 client 컴포넌트):
  - 연결: `supabase.auth.signInWithOAuth({ provider:'google', options:{
    scopes:'https://www.googleapis.com/auth/calendar.events',
    queryParams:{ access_type:'offline', prompt:'consent' },
    redirectTo: origin + '/auth/callback?next=/setting/profile' }})`
    (재연결도 같은 버튼 — `prompt=consent`로 새 refresh token 재발급, 사전부검 1 복구 경로)
  - 상태 표시(연결됨/안 됨/재연결 필요 + last_error) · "연결 해제" 서버액션(AC-10).
  - 상태 조회 액션 반환은 `{connected, lastError}`만(AC-8).

### 7단계 — UI: `app/(shell)/today/events-calendar.tsx`
- DayDetailModal "일정 추가하기"·수정 폼에 `<input type="time">` 시작/종료(선택),
  목록에 "14:00–15:00"/"종일" 표시.
- 연결돼 있고 `last_error`가 있으면 캘린더 상단에 한 줄 경고("구글 동기화 오류 —
  프로필에서 확인"). **메모별 뱃지는 두지 않는다**(도입 이전 과거 메모 전체에 노이즈 —
  Architect LOW-4; 멱등 재시도가 수정·저장 경로에 내장되므로 상태는 전역 1곳으로 충분).

### 8단계 — 검증·배포
tsc → 단위(vitest) → 통합(RUN_DB_ITEST) → build → 마이그 0049 적용(사용자 게이트)
→ 커밋·push → 배포 후 실계정 수동 E2E(아래 체크리스트).

## 사전부검 (Pre-mortem — 3가지 실패 시나리오)

1. **"일주일 뒤부터 조용히 동기화가 안 된다"** — 동의화면 '테스트' 상태면 refresh token
   7일 만료(`invalid_grant`). → 완화: 매뉴얼 ③에서 프로덕션 게시를 필수 단계로 명시,
   `invalid_grant` 감지 시 프로필·캘린더에 "구글 재연결 필요" 표시, 재연결은
   `prompt=consent`로 재발급. audit `gcal_sync_fail`로 발생 시점 추적 가능.
2. **"암호화 키가 바뀌어 복호화가 전부 실패한다"** — env 재설정·키 분실 시 기존 암호문
   무효. → 완화: 복호화 실패를 잡아 "재연결 필요"로 강등(크래시 금지), 매뉴얼 ④에서
   키 백업(비밀번호 관리자) 명시. 재연결 한 번으로 완전 복구(파생 id라 매핑 유실 없음).
3. **"구글 API 지연으로 일정 추가가 느려진다/함수가 잘린다"** — 서버리스에서 응답 전
   push 완료가 필수(fire-and-forget은 freeze로 신뢰 불가)라 지연이 직결. → 완화:
   access token 만료캐시로 정상 경로 왕복 1회(AC-12), 이벤트 3s·갱신 5s 타임아웃으로
   최악 ≤8s(Hobby 10s 상한 내 last_error 기록 여유 확보), 실패 즉시 로컬 완료.

## 확장 테스트 계획

- **단위(vitest)** `lib/domain/google-event.test.ts`: 파생 id(32-hex·구글 charset·
  결정론), 종일 payload(end 익일·exclusive·월말/연말 경계), 시간 payload(timeZone·
  +1h 기본·23:30 자정 이월), 시간 검증(형식·역전·종료 단독), summary 80자 절단,
  `isAccessTokenFresh`(60s 여유 경계). `google-calendar` 암호화 라운드트립 + 변조
  (tag 불일치) 감지 + 잘못된 키 길이 거부.
- **통합(RUN_DB_ITEST)**: 시간 필드 포함 메모 CRUD 왕복, 기존 행 NULL 호환,
  connections upsert(재연결 시 refresh 교체·access 캐시 무효화)·삭제·last_error 갱신.
- **E2E(배포 후 수동 체크리스트, AC 대응)**: 연결(⑤) → 종일 추가→구글 확인(AC-1) →
  시간 추가(AC-2) → 잘못된 시간 거부(AC-3) → 수정→구글 반영·중복 0(AC-4) → 구글에서
  삭제 후 앱 수정→재생성(AC-11) → 앱 삭제→구글 삭제(AC-5) → 연결 해제→무호출(AC-10).
- **관측성**: `last_error` + audit `gcal_sync_fail`(원인 문자열) — 실패가 조용히
  사라지지 않게(사전부검 1·3). 프로필 카드가 사람이 보는 1차 대시보드.

## 사용자 매뉴얼 — 직접 해주셔야 하는 일 (쉬운 단계별)

> **정식 매뉴얼은 `docs/GOOGLE_CALENDAR_SETUP_GUIDE.md` 입니다**(FAQ·문제해결·체크리스트
> 포함, 이 절보다 상세). 아래는 계획 검토용 요약본이며 내용이 갈리면 docs 쪽이 우선.
> 소요 약 15분. ①~③은 Google Cloud, ④는 Vercel, ⑤는 배포 후 앱에서 1회.
> ①~④는 구현과 병행 가능하며, 순서는 ①→②→③→④를 권장합니다.

### ① Google Calendar API 켜기
1. https://console.cloud.google.com 접속 → 상단 프로젝트 드롭다운에서 **Supabase 구글
   로그인을 만들 때 썼던 프로젝트** 선택. (어느 프로젝트인지 모르겠으면: Supabase
   대시보드 → Authentication → Providers → Google에 적힌 Client ID 맨 앞 숫자가
   그 프로젝트 번호입니다.)
2. 왼쪽 메뉴 **API 및 서비스 → 라이브러리** 클릭.
3. 검색창에 `Google Calendar API` 입력 → 클릭 → 파란 **사용(Enable)** 버튼 클릭.
   (이미 "API 사용 설정됨"이면 그대로 다음 단계로.)

### ② 동의 화면에 캘린더 권한(스코프) 추가
1. **API 및 서비스 → OAuth 동의 화면**으로 이동. (2024년 이후 새 UI에서는 왼쪽
   **"데이터 액세스"** 메뉴가 같은 화면입니다.)
2. **범위 추가 또는 삭제(Add or remove scopes)** 버튼 클릭.
3. 필터에 `calendar.events` 입력 → `…/auth/calendar.events` ("캘린더의 모든 일정 보기
   및 수정") 앞 체크박스 선택 → 하단 **업데이트** → 화면 아래 **저장**.

### ③ 앱을 '프로덕션'으로 게시 ⚠ 건너뛰면 매주 재연결해야 합니다
1. **OAuth 동의 화면**(새 UI: **"대상(Audience)"** 메뉴)에서 게시 상태 확인.
2. '테스트(Testing)'라면 **앱 게시(Publish app)** 버튼 → 확인. 상태가
   '프로덕션(In production)'으로 바뀌면 됩니다.
3. 검증 심사는 **신청하지 않아도 됩니다.** 나중에 ⑤에서 연결할 때 "Google에서 확인하지
   않은 앱" 경고가 한 번 뜨는데, **고급 → (앱 이름)(안전하지 않음)으로 이동** 클릭으로
   통과하면 됩니다. 본인이 만든 본인 전용 앱이므로 안전합니다.

### ④ 환경변수 3개 등록 (Vercel + 로컬)
1. 값 준비:
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Google Cloud **API 및 서비스 →
     사용자 인증 정보(Credentials) → OAuth 2.0 클라이언트 ID** 항목 클릭 → 오른쪽
     패널에서 복사. (Supabase → Authentication → Providers → Google에 입력된 값과
     같아야 합니다. 다르면 Supabase 쪽 값을 기준으로 쓰세요.)
   - `GOOGLE_TOKEN_ENC_KEY`: 프로젝트 폴더 터미널에서 아래 실행 → 출력된 한 줄 복사.
     **비밀번호 관리자 등에 반드시 백업**(분실 시 캘린더 재연결 1회 필요):
     ```
     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
     ```
2. https://vercel.com → 프로젝트(edu-note) → **Settings → Environment Variables** →
   3개를 각각 추가. Environment는 **Production·Preview·Development 모두 체크** → Save.
3. 로컬 개발용으로 프로젝트의 `.env.local` 파일 맨 아래에 같은 3줄 추가:
   ```
   GOOGLE_CLIENT_ID=복사한값
   GOOGLE_CLIENT_SECRET=복사한값
   GOOGLE_TOKEN_ENC_KEY=복사한값
   ```
4. Vercel 환경변수는 **다음 배포부터 반영**됩니다(이 기능 배포와 함께 자동 해결).

### ⑤ 앱에서 연결 (배포 후 1회)
1. 오늘의 학교 앱 로그인 → 세팅실 → 프로필 → **"구글 캘린더 연결"** 클릭.
2. 구글 동의 화면에서 캘린더 권한 **허용**. ("확인하지 않은 앱" 경고 시 ③-3 방법으로
   통과.) 완료되면 프로필 카드에 "연결됨"이 표시됩니다.
3. 오늘의 학교 캘린더에서 일정 하나 추가 → https://calendar.google.com 에서 보이면 끝.
4. (만약 나중에 "구글 재연결 필요" 표시가 뜨면 같은 버튼을 다시 누르면 됩니다.)

## 리스크와 완화 (요약)

| 리스크 | 완화 |
|---|---|
| 테스트 모드 refresh token 7일 만료 | 매뉴얼 ③ 프로덕션 게시 필수화 + invalid_grant 감지 → "재연결 필요" 표시 + 재연결 버튼 |
| 구글 이벤트 중복 생성(재시도 창) | **결정론 파생 id로 구조적 제거**(A′) — insert 409→PATCH 폴백 |
| 암호화 키 분실·변경 | 복호화 실패 → 재연결 유도(크래시 금지), 키 백업 안내. 파생 id라 매핑 유실 없음 |
| 서버액션 지연·함수 타임아웃 | access token 만료캐시(정상 왕복 1회) + 3s/5s 타임아웃 → 최악 ≤8s < Hobby 10s |
| 토큰 유출 표면 | AES-256-GCM + RLS 정책無(전면차단) + 콜백 ALLOWED_EMAIL fail-closed 가드(AC-8) |
| 구글 쪽 수정·삭제 미반영 | 단방향 설계 명시(사용자 승인), 앱에서 재수정 시 앱 값으로 덮어씀·재생성(AC-11) |

## 검증 단계 (구현 완료 판정)

1. `npx tsc --noEmit` clean, `npx vitest run` 전체 green(신규 단위 포함).
2. RUN_DB_ITEST=1 통합(0049 적용 DB) green.
3. `npm run build` 성공.
4. 배포 후 E2E 체크리스트(AC-1~12) 사용자와 함께 수행 — AC-4(중복 0)·AC-11(재생성)은
   실계정에서만 최종 확인 가능.

## ADR

- **Decision**: Google Calendar API 기반 단방향(앱→구글) push. 대상은
  `today_calendar_memos` 한정. 구글 이벤트 id는 메모 UUID에서 결정론 파생(멱등 insert,
  매핑 컬럼 없음). refresh token은 AES-256-GCM 암호화 + RLS 전면차단 테이블 저장,
  access token은 만료시각과 함께 캐시. 시간 필드는 nullable `time` 2개(null=종일).
- **Drivers**: 쓰기 필요(ICS 불가) · 단독 사용자/Hobby 최소 인프라·지연 예산 ·
  기존 Supabase 구글 OAuth 재사용.
- **Alternatives considered**: 저장형 event id 매핑(재시도 중복 창 — 기각),
  URL 템플릿 버튼(자동화 불충족), 양방향(복잡도·Hobby 제약), provider_token 단독
  (1h 만료), ICS(읽기 전용).
- **Why chosen**: 요구(완전 자동)를 충족하는 최소 배관이면서, 결정론 id가 중복·매핑
  유실·재시도 문제를 클래스째 제거(Architect synthesis 채택). 테이블 분리로 "내
  일정만"이 필터 없이 구조 보장.
- **Consequences**: GCP·Vercel 사용자 설정 필요(매뉴얼 제공), 구글 쪽 편집은 역반영
  안 됨(앱 수정 시 덮어씀·재생성), 정상 경로 구글 왕복 1회(캐시 히트 시)·최악 2회.
- **Follow-ups**: (v2 후보) 세팅실 manual 학사일정 push 옵션, 기존 메모 일괄 업로드
  버튼, 대상 캘린더 선택, last_error 자동 해소 알림.

## 변경 이력
- v4: Critic APPROVED — 필수 minor 2건 반영: ① `audit.ts` AuditEvent union에
  `gcal_sync_fail` 추가를 변경 파일 목록에 명시(누락 시 tsc 실패), ② 삭제 push 실패
  시 고아 이벤트를 **의도된 동작으로 명문화**(AC-13 신설, 원칙 3 정합·last_error
  가시화). 비필수 2건 반영: 타임아웃 킬=silent 유실 경로 관측성 주석, 콜백 회귀 방지
  executor 노트 + provider_refresh_token 존재 실증 절차. today-memo.ts 참조 정정
  (:13-17/:26/:49/:66).
- v3: Architect 개선 5건 반영 — ① 결정론 파생 이벤트 id로 멱등 insert(HIGH: 중복 창
  제거, `google_event_id` 컬럼·배관 삭제), ② access token 만료캐시 + 3s/5s 타임아웃
  예산(MED: Hobby 상한 방어, AC-12 신설), ③ 콜백 ALLOWED_EMAIL fail-closed 가드
  (MED: AC-8 강화), ④ 메모별 뱃지 → 전역 오류 표시(LOW: 과거 메모 노이즈 제거),
  ⑤ backup.ts 오기 정정(참조 부재 확인). AC-11(부활 재생성) 추가.
- v2: 컨센서스 검토용 구체화 — AC 명문화, 파일 단위 구현 단계, 사전부검·확장 테스트,
  사용자 매뉴얼. (v1: 초안)
