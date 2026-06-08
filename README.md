# Edu_Note (Edu_Flow Core)

고등학교 **교사 1인용** 교수–수업–평가–기록 일체화 클라우드 웹앱.
공간(`~실`) 기반 UI, 공통/담임 이원화. 무료티어·서울 리전·본인 계정 전용·개인정보 최소노출을 원칙으로 한다.

- 기획안: [`기획안.md`](기획안.md)
- 심층 인터뷰 명세(모호도 4.8% PASSED): [`.omc/specs/deep-interview-edu-note.md`](.omc/specs/deep-interview-edu-note.md)
- 아키텍처 합의 계획(Critic APPROVED): [`.omc/plans/edu-note-architecture-plan.md`](.omc/plans/edu-note-architecture-plan.md)
- 상세 진척 로그: [`PROGRESS.md`](PROGRESS.md)

---

## 1. 스택 & 핵심 결정

| 레이어 | 선택 |
|--------|------|
| 프레임워크 | **Next.js 15 (App Router) + TypeScript** |
| UI | React 19 + Tailwind CSS |
| DB | **Supabase Postgres (서울 ap-northeast-2)** · Drizzle ORM · RLS |
| 인증 | **Supabase Auth — Google OAuth**, 단일 이메일 allowlist(본인만) |
| 외부 연동 | 컴시간알리미(시간표), NEIS 개방포털(학사일정·급식) — 서버 전용·읽기 전용 |
| 배포 | **Vercel Hobby** |
| 테스트 | Vitest (단위 + 실DB 통합) |

**핵심 결정 2가지**
- **AI 세특 = 코워크(Claude Code) 내보내기 워크플로.** Anthropic API가 Pro 구독과 별개로 과금되므로, Phase 1은 서버사이드 Claude 호출을 쓰지 않는다. 앱은 관찰기록·수행평가·작성지침을 **프롬프트 번들로 내보내고**, 교사가 Claude Code에서 생성한 결과를 붙여넣어 **바이트·기재금지 검수 후 저장**한다. (서버 API 경로는 추후 과금 활성화 시를 위해 보존)
- **배포 = Vercel Hobby.** Cloudflare는 실측 Claude API 403 차단으로 탈락.

---

## 2. 구현 현황 (기획안 공간별)

> 범례: ✅ **동작 화면까지 완료** · 🟡 **데이터모델·라이브러리 완성, 화면 미연결** · ⬜ **미착수(스키마만 존재)**
>
> 📌 11개 컴포넌트 **DB 스키마(37테이블)는 1차에 전부 설계 완료**되어 있다. 즉 대부분의 🟡/⬜ 항목은 "테이블은 있고 화면만 없는" 상태다.

### 공통 / 비담임

| 공간 | 기능 | 상태 | 비고 |
|------|------|:---:|------|
| ⚙️ 세팅실 | 기본 세팅(교사 인적) | 🟡 | `teacher_profile`(+컴시간 설정) 존재, 전용 화면 미구현 |
| | 학생 세팅(명렬표) | ✅ | `/students` — CSV 붙여넣기/파일 업로드(EUC-KR 자동), 학번 검증·행단위 오류 |
| | 수업 세팅(시간표) | ✅ | `/timetable` — 컴시간 동기화 → 주간 시간표 |
| | 수업 세팅(교과·평가설정·특별실) | ⬜ | `subjects`·`performance_items` 스키마 존재 |
| | 상담/업무 세팅 | ⬜ | |
| | 일년 업무 세팅(학사일정 연동) | ✅ | `/calendar` — NEIS 학사일정→`school_day_calendar`(수업일)·급식 동기화 |
| | 수업 세팅(시수) | ✅ | `/sessions` — 과목 시험날짜 → 시간표·수업일 기반 남은 차시 계산·관리 |
| 🏫 교실 | 수업 진척도(잔여 차시) | ✅ | `/sessions` — 분반별 잔여 차시 + 완료/미진행 마킹 |
| | 수업 계획룸·특별실 예약 | ⬜ | `course_sections.room` 스키마 존재 |
| | 학생 성취 기록(세특 키워드·관찰) | 🟡 | 스키마 + 세특 코워크 라이브러리(`lib/setech`) 완성, 화면 미구현 |
| 📋 교무실 | 업무 대시보드·계획룸 | ⬜ | `tasks` 스키마 존재 |
| | 예산 관리 | ⬜ | `budgets`·`budget_expenses` 스키마 존재 |
| 📊 통계실 | 종합 데이터 조회 | ⬜ | |
| | 출결 보조(NEIS 입력 전 통계) | 🟡 | 출결 도메인 규칙 완성, 화면 미구현 |
| | AI 세특 생성기 | 🟡 | **코워크 내보내기 워크플로**(`lib/setech`) 완성, 화면 미구현 |
| 🖨️ 인쇄실 | 데이터 연동·일괄 출력 | ⬜ | |
| 📆 오늘의 학교 | 통합 타임라인 대시보드 | 🟡 | 기본 홈(`/`, 링크 허브)만 구현, 강제 팝업 넛지·타임라인 미구현 |

### 담임 전용

| 공간 | 기능 | 상태 | 비고 |
|------|------|:---:|------|
| 🛏️ 담임 교실 | 출결 마스터(사유×성격) | 🟡 | `attendance_records` + 출결 규칙(`lib/domain`) 완성, 화면 미구현 |
| | 증빙 서류(신고서) 관리 | 🟡 | `report_tracking` + 에스컬레이션(수업일 5일·3/5 티어) 규칙 완성, 화면 미구현 |
| | 행동 특성 기록 | 🟡 | `homeroom_behavior_notes` 스키마 존재 |
| 💬 상담실 | 스케줄러·상담 일지 | ⬜ | `counseling_logs` 스키마 존재 |
| | 학부모 공유 발췌 페이지 | 🟡 | 공개 토큰 페이지 기반(`/p/[token]`) ✅, 상담 발췌 전용 미구현 |
| 📢 공지실 | 학급 공지·아카이빙 | ⬜ | `public_pages.common_payload`로 일부 수용 가능 |

### 기반(전 기능 공통) — ✅ 완료

| 항목 | 상태 |
|------|:---:|
| Supabase 인증(본인 Google 로그인 + allowlist 미들웨어) | ✅ |
| 전 37테이블 **RLS 잠금**(anon 차단, owner 전용) | ✅ |
| 공개 학생 페이지(`/p/[token]`, 단일 `get_public_page` + allowlist DTO) | ✅ |
| 도메인 규칙 라이브러리(바이트·출결·에스컬레이션·시수·평가표기·넛지·활동배치) | ✅ |
| 외부 어댑터(컴시간 라이브 검증 / NEIS 파서) | ✅ |
| 감사 로그(`audit_log`) — CSV임포트·토큰발급/폐기·sync 기록 | ✅ |

---

## 3. 기술 아키텍처

### 디렉터리
```
/app                  ~실 라우트 (현재: /, /login, /students, /timetable, /sessions, /calendar, 공개 /p/[token])
  /auth/{callback,signout}   OAuth 콜백·로그아웃
/lib/domain           순수 규칙: byteCount·attendanceRules·escalation·remainingSessions·
                      activityPlacement·evalMethodDisplay·nudge (클라/서버 공용·테스트 가능)
/lib/db               Drizzle schema(37테이블)·migrations·queries(ownerId 인자형 데이터 계층)
/lib/integrations     neis·comcigan (server-only fetch + 순수 파서) / claude.ts(추후 API 보존)
/lib/setech           세특 코워크 프롬프트 번들 어셈블러 + 붙여넣기 검수
/lib/csv              엔티티별 CSV 파서/검증기(원본 미저장)
/lib/public           공개 페이지 service-role 어댑터 + allowlist DTO
/lib/supabase         server·client·middleware 인증 클라이언트
/lib/auth             getOwnerId (세션 → ownerId, allowlist 가드)
/content              세특 작성 지침.md (레포 자산)
/docs                 SUPABASE_SETUP.md · GOOGLE_OAUTH_SETUP.md
```

### 보안 설계 (PII 심층방어)
- **인증 표면**: 미들웨어가 비로그인/비허용 계정을 전면 차단(`ALLOWED_EMAIL` 이중 강제). 전 테이블 RLS(`owner_id = auth.uid()`)가 백스톱.
- **공개 표면**(`/p/[token]`): RLS를 우회하는 service-role로 동작하므로, **유일한 보호는 단일 `get_public_page(token)` 함수 + 사전집계 allowlist DTO**. 출결 사유텍스트·원점수·타 학생 데이터·내부 ID는 절대 직렬화하지 않는다(골든 페이로드 테스트로 단언). 토큰 128bit·noindex·폐기/만료 지원.
- **비밀키**: NEIS·service_role 키는 서버 env 전용. 클라이언트 번들에 비밀 부재.

### 데이터 모델
영속 학생(`persons`) ↔ 연도별 학적(`student_years`) 분리로 연도 간 추적. `year_links`가 3종 종결상태(자동연결/보류/신규). 출결·신고서 에스컬레이션은 `school_day_calendar`(수업일) 기반 파생 + 티어 스냅샷 영속. 자세한 설계는 합의 계획 §3.3 참조.

---

## 4. 향후 개발 방향

### 빌드 순서 (계획 §4)
- **Phase 1**: A(기반·인증·스키마·CSV) ✅ → **B(수업·시수)·E(캘린더)** → C(관찰·세특·넛지) → F(출결·에스컬레이션) → K-1(오늘의 학교)
- **Phase 2**: D(동아리) → G(상담 목업) → H(업무·예산) → K-2(통계·인쇄) → I(공지)

### 바로 다음 후보 (우선순위)
1. **세특 화면(C)** — 관찰/행특 기입 + 코워크 번들 내보내기 + 붙여넣기 검수 UI. (`lib/setech` 라이브러리 완성, 화면만 연결)
2. **출결(F)** — 사유×성격 기입 + 신고서 에스컬레이션 대시보드. (도메인 규칙 + 수업일 캘린더 준비 완료)
3. **오늘의 학교(K-1)** — 강제 팝업 넛지 엔진 + 통합 타임라인.

> ✅ **시수(B)·캘린더(E) 완료** — `/sessions`(잔여 차시), `/calendar`(NEIS 학사일정·급식). 컴시간 시간표 + NEIS 수업일을 결합해 차시를 계산한다.

### 운영 자동화 (예정)
- `pg_cron` 일일 동기화: 컴시간 시간표 재동기화 + 신고서 에스컬레이션 티어 재계산. (`pg_cron`/`pg_net` 가용 확인됨)
- 주간 백업 내보내기(무료 DB 일시정지 안전망).

---

## 5. 개발 환경

### 최초 설정
1. **Supabase(서울)**: [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md) — 프로젝트 생성·연결문자열·마이그레이션.
   - ⚠ DB 리셋 시: `db:migrate` 후 **`0001_get_public_page.sql`·`0002_rls_policies.sql`을 따로 적용**(커스텀 SQL이라 드리즐 저널 외).
2. **Google 로그인**: [`docs/GOOGLE_OAUTH_SETUP.md`](docs/GOOGLE_OAUTH_SETUP.md) — OAuth 클라이언트 발급·Supabase 입력.
3. **환경변수**: `.env.example`를 `.env.local`로 복사해 채운다.

```bash
# .env.local (서버 전용 비밀은 절대 커밋 금지)
DATABASE_URL=postgresql://...                 # Supabase Session pooler(5432)
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...                 # 서버 전용. 공개 /p/[token] 어댑터 독점
ALLOWED_EMAIL=your@email.com                  # 로그인 허용 단일 계정
NEIS_API_KEY=...                              # NEIS 개방포털(선택)
```

### 명령어
```bash
npm run dev          # 개발 서버 (http://localhost:3000)
npm test             # 단위 테스트 (vitest)
npm run build        # 프로덕션 빌드
npm run db:generate  # 스키마 → SQL 마이그레이션 생성
npm run db:migrate   # DB 적용 (DATABASE_URL 필요)

# 실DB 통합 테스트 (서울 Supabase + 라이브 외부 API)
RUN_DB_ITEST=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/db/queries
# 컴시간 라이브 스모크
node scripts/comcigan-probe.mjs "학교명" "교사명"
```

> ⚠ **`npm run dev`가 떠 있는 동안 `npm run build`를 실행하지 말 것** (같은 `.next`를 두 프로세스가 건드리면 청크가 깨짐). 깨지면 dev 종료 후 `.next` 삭제 → 재시작.

### 테스트 현황
- 단위 **119건** 그린 · 실DB 통합 14건(명단/토큰/시간표/캘린더/시수, `RUN_DB_ITEST` 게이트) 그린 · `tsc --noEmit`·`next build` 통과.
