# Edu_Note 진척 현황 (2026-06-06)

> 다음 세션 재개 한마디: **"Edu_Note 계획으로 이어가자"**
> → `.omc/plans/edu-note-architecture-plan.md`의 §0(RESUME)과 이 파일을 읽고 이어서 진행.

---

## ✅ 오늘까지 완료

### 1. 설계 (확정)
- **기획안** → **심층 인터뷰**(모호도 4.8% PASSED) → **합의 계획**(Planner→Architect→Critic **APPROVED**)
- 문서: `기획안.md`, `.omc/specs/deep-interview-edu-note.md`, `.omc/plans/edu-note-architecture-plan.md`

### 2. 핵심 결정 (오늘 확정)
| 결정 | 내용 | 이유 |
|------|------|------|
| **배포 호스트** | **Vercel Hobby** | Cloudflare는 Claude API **403 차단**으로 탈락, Render는 콜드스타트로 보류 |
| **AI 세특** | **코워크(Claude Code) 내보내기 워크플로** | Anthropic API는 Pro 구독과 **별개 과금** → Phase 1은 서버 Claude 호출 안 씀 |
- 메모리 저장됨: `host-vercel-hobby`, `ai-setech-cowork-export`

### 3. 코드 (작성 + 검증 완료)
| 영역 | 산출물 | 검증 |
|------|--------|------|
| **Phase 0 스캐폴드** | Next.js 15 + TS + Tailwind, 랜딩, `lib/integrations/claude.ts`(추후 API용 보존·비활성) | `npm run build` ✅ |
| **Phase 1-A 전체 스키마** | `lib/db/schema/` 11컴포넌트 **37테이블** (Drizzle) | `drizzle-kit generate` → `0000_init_full_schema.sql` ✅ |
| **도메인 규칙** | `lib/domain/` 7모듈 (byteCount·attendanceRules·escalation·remainingSessions·activityPlacement·evalMethodDisplay·nudge) | 단위테스트 **34** ✅ |
| **공개 페이지 보안** | `lib/public/`(DTO·파서·어댑터) + `0001_get_public_page.sql` | 골든 페이로드 **14** ✅ |
| **Phase 1-A CSV 파이프라인** | `lib/csv/`(RFC4180 파서 + `parseCsvRecords` + 학생명단 검증기) | 단위테스트 **23** ✅ |
| **Phase 1-C 세특 코워크 내보내기** | `content/세특 작성 지침.md` + `lib/setech/`(프롬프트 번들 어셈블러 + 붙여넣기 검수: 바이트·기재금지·문체 스캔) | 단위테스트 **17** ✅ |
| **Phase 2-I 공개 페이지 라우트** | `app/p/[token]/`(page+gone) — 단일 `getPublicPage` 어댑터만 사용, allowlist DTO 렌더, noindex+force-dynamic, 폐기/만료 410 안내 | `next build` ✅ (ƒ Dynamic) |
| **Phase 1-E NEIS 어댑터** | `lib/integrations/neis.ts`(학사일정·급식 순수 파서: 날짜정규화·수업일판정·알레르기코드제거·무데이터내성) + `neis-client.ts`(server-only fetch, 실패 Result fallback) | 단위테스트 **12** ✅ |
| **Phase 1-B 컴시간 어댑터** | `lib/integrations/comcigan.ts`(init코드추출·euc-kr hex·학교검색·시간표 디코딩 `code=교사×1000+과목`·동적키 구조탐지·마스킹교사명 매칭) + `comcigan-client.ts`(server-only, Result fallback) + `scripts/comcigan-probe.mjs`(라이브 스모크) | 단위 **15** + **라이브 실측** ✅ |

- **테스트 총 115건 그린** · `tsc --noEmit` 통과 · `next build` 통과
- **컴시간 라이브 검증(2026-06)**: 진입점 comci.kr:4081→**comci.net:4082** 이전 확인, 인천해송고(코드 79119) → **양세훈(교사#43) = 2-7·8·9 물리 주9시간** 실제 조회 성공. `전체학년`이 숫자 아닌 플래그배열이라 학년수는 `학급수.length-1`로 파생(회귀 테스트 가드).
- `iconv-lite` 의존성 추가(euc-kr 인코딩)
- vitest 에 `@/*` 별칭 추가(런타임 값 import 해소)
- 핵심 제약 SQL 반영 확인: 학번 `^[0-9]{5}$`, report_tracking `num_nonnulls=1`, 토큰 128bit, 38 FK
- CSV: 학번→학년/반/번호 파생·명시컬럼 일치검증, 학번중복·전화형식·필수헤더 검증, 행단위 오류 리포트(정상행 보존), 원본 미저장
- 세특: 지침+관찰+수행평가+활동→코워크 프롬프트 번들, 결과 붙여넣기 시 바이트상한(차단)·기재금지(수상/모의고사/어학/외부기관)·1인칭/이름노출(자문) 검수

---

## ✅ Supabase(서울) 라이브 — 게이트 해제 (2026-06-06)
- **프로젝트**: 서울 ap-northeast-2, project ref `ntdvgneiqzeopmlevuwj`. Session pooler(5432) 연결.
- **검증 B 통과**: `pg_cron`+`pg_net` 가용 확인.
- **마이그레이션 적용 완료**: `0000_init_full_schema`(drizzle migrate) → **public 37테이블** 생성, 학번 `ck_student_years_sid_format` CHECK·report_tracking 제약 확인.
- **`0001_get_public_page.sql` 수동 적용**: ⚠ 이 파일은 손으로 쓴 커스텀 SQL이라 **drizzle 저널에 없어 `db:migrate`가 건너뜀**. `node --env-file=.env.local -e`로 직접 적용함(함수는 `create or replace`라 재적용 안전). `get_public_page`(security definer) 생성·동작 확인(없는 토큰→`{"state":"not_found"}`).
  - 🔁 DB 리셋 후 재설정 시: `db:migrate` 다음에 `0001_get_public_page.sql`·`0002_rls_policies.sql`을 **반드시 따로 적용**할 것.
- `.env.local`: DATABASE_URL·SUPABASE_URL·ANON/SERVICE_ROLE·ALLOWED_EMAIL·NEIS·ANTHROPIC 키 채움(URL placeholder·service_role 꼬리주석 교정함).

### ✅ Phase 1-A 데이터 계층 + 보안 (2026-06-06, autopilot)
| 영역 | 산출물 | 검증 |
|------|--------|------|
| **RLS 보안 잠금** | `0002_rls_policies.sql` — 전 37테이블 RLS 활성 + `owner_rw`(authenticated 전용, `owner_id=auth.uid()`) | 실DB 적용·정책 전수검증(anon 대상 0, get_public_page=SECURITY DEFINER) ✅ |
| **쿼리 계층** | `lib/db/queries/`(roster 임포트·public-page 발급/폐기/재발급·audit) — ownerId 인자형(인증과 분리) | tsc ✅ |
| **실DB 통합테스트** | `integration.test.ts`(CSV→명단 / 토큰발급→get_public_page ok·성적'준비중' / 폐기→revoked / 재발급 1활성 / 감사) — `RUN_DB_ITEST=1` 게이트 | **서울 DB 6건 그린** ✅, 정리 0잔여 |

- **단위 115 그린 + 실DB 통합 6 그린** · tsc 통과 · build 통과
- ⚠ Supabase 는 public 테이블을 anon 키(브라우저 노출)로 PostgREST 공개 → **RLS 잠금이 필수였고 적용 완료**

### ✅ Phase 1-A 인증 + 학생화면 (2026-06-06, autopilot)
| 영역 | 산출물 | 검증 |
|------|--------|------|
| **Supabase 인증** | `lib/supabase/{server,client,middleware}.ts` + 루트 `middleware.ts`(본인 이메일 allowlist 강제) + `/login`·`/auth/callback`·`/auth/signout` + `lib/auth/owner.ts`(getOwnerId) | 런타임 스모크: 비로그인 `/`·`/students`→307 `/login`, `/p/*`·`/login` 공개 통과 ✅ |
| **학생 명단 화면** | `/students`(서버컴포넌트 명단+공개링크) + `import-form.tsx`(CSV 붙여넣기, useActionState) + `actions.ts`(임포트·발급/재발급·폐기, 전부 getOwnerId 가드+audit) | tsc·build ✅ |
| **홈 대시보드** | `app/page.tsx`(로그인 사용자·로그아웃·학생화면 링크) — 미들웨어 보호 | build ✅ |
- 패키지 추가: `@supabase/ssr`·`@supabase/supabase-js`
- 보안 검증: 서버액션 전부 getOwnerId 가드 / 미들웨어 getUser()(서버검증) / 클라 번들 service_role 부재 / allowlist 이중강제
- ⚠ `npm audit` 잔여 3건(moderate2·high1)은 **Next.js→postcss transitive**(프레임워크 내부) — `--force` 시 Next 메이저 변경·빌드파손 위험이라 미적용
- **남은 단 하나의 외부 단계**: Google Cloud OAuth 클라이언트 발급(가이드 `docs/GOOGLE_OAUTH_SETUP.md`) → Supabase 대시보드 입력 → 실제 Google 로그인 왕복 동작. 코드는 완료, 그 설정만 켜면 화면 동작. ✅ **사용자 설정 완료·로그인 동작 확인**

### ✅ Phase 1-B 시간표 동기화 (2026-06-06, autopilot)
| 영역 | 산출물 | 검증 |
|------|--------|------|
| **스키마/마이그레이션** | `0003_teacher_comcigan.sql` — teacher_profile 에 `comcigan_school`·`comcigan_teacher`·`last_timetable_sync_at` | 실DB 적용 ✅ |
| **sync 쿼리 계층** | `lib/db/queries/timetable.ts` — 컴시간 슬롯→subjects/course_sections/timetable_slots 멱등 upsert + 화면용 조회 + 프로필 설정 | tsc ✅ |
| **시간표 화면** | `/timetable`(주간 그리드 + 마지막동기화 배지) + `sync-form.tsx`(학교·교사 입력) + `actions.ts`(getOwnerId 가드+audit) | build ✅ |
| **실DB+라이브 통합테스트** | `timetable.integration.test.ts` — 인천해송고/양세훈 라이브 sync→물리/3분반/9슬롯 DB반영·화면조회·재sync멱등 | **2건 그린** ✅ |

- 단위 115 그린 + 실DB 통합 8 그린(roster6+timetable2) · tsc · build 통과
- vitest 에 `server-only` 스텁 별칭 추가(comcigan-client 등 server-only 모듈 테스트 가능)
- CSV 임포트 파일 업로드(EUC-KR 자동) + 공개링크 복사 버튼 추가됨
- 보안: sync 액션 getOwnerId 가드 / comcigan-client server-only / 클라폼 비밀참조 없음
- **사용법**: 홈→시간표→학교명+본인이름 입력→"컴시간 동기화"→주간 시간표 표시(읽기전용)
- 다음 후보: 시수(class_sessions·exam_boundary·잔여차시) / 캘린더(E, NEIS) / 출결(F)

### 🔧 컴시간 파서 수정 — 선택과목 누락 해결 (2026-06-06)
- **증상**: 양세훈 시간표에 물리(9)만 나오고 **물Ⅱ·생과(선택과목) 누락**.
- **원인**: 학급별 배열(`자료481`, `교사×1000+과목`)만 디코딩 → 반을 섞는 **선택과목은 학급 그리드에 없음**.
- **수정**: **교사별 배열(`자료542`)** 로 전환. 인코딩 = **`과목×1000 + (학년×100 + 반)`**(예 `44311`=물Ⅱ 3-11). `>` 접두 문자열은 금주 변경분(보강)이라 정규 시간표에서 제외. `isTeacherTimetable`(길이≈교사수+1·중첩) 구조탐지.
- **검증**: 라이브 양세훈 → **물리9 + 물Ⅱ3 + 생과4 = 16개** 전부 조회 확인. 단위테스트 선택과목·변경분제외 케이스 추가(17건), 실DB 통합테스트가 물리·물Ⅱ·생과 DB반영 단언. 전체 117 단위 그린.
- ⚠ 사용자: 시간표 화면에서 **"컴시간 동기화"를 다시 한 번** 누르면 선택과목 포함 전체가 반영됨.

### ✅ Phase 1-E 캘린더(NEIS 학사일정·급식) (2026-06-07, autopilot)
| 영역 | 산출물 | 검증 |
|------|--------|------|
| **NEIS 학교검색 파서** | `neis.ts` `parseSchoolInfo` + `neis-client.ts` `searchSchoolInfo`(학교명→교육청·학교코드) | 단위 + 라이브(인천해송고 E10/7310349) ✅ |
| **스키마/마이그레이션** | `0004_teacher_neis.sql` — teacher_profile 에 `neis_office_code`·`neis_school_code`·`neis_school_name`·`last_calendar_sync_at` | 실DB 적용 ✅ |
| **sync 쿼리 계층** | `lib/db/queries/calendar.ts` — 학사일정→**school_day_calendar(평일∧비휴일=수업일)**·calendar_events·meal_cache 멱등 upsert + 조회(다가오는 일정·급식·수업일수) | tsc ✅ |
| **캘린더 화면** | `/calendar`(NEIS 동기화 폼 + 다가오는 학사일정 + 이번주 급식) + 홈 카드 | build ✅ |
| **실DB+라이브 통합테스트** | `calendar.integration.test.ts` — 인천해송고 2026-06 sync→공휴일(6/3)·주말(6/7) 수업일제외·이벤트·급식 DB반영, 재sync 멱등 | **2건 그린** ✅ |

- 단위 **119 그린** + 실DB 통합 10 그린(roster6+timetable2+calendar2) · tsc · build 통과
- 🔑 **school_day_calendar 채워짐 → 시수·출결의 수업일 토대 확보**(다음 단계 선행작업 완료)
- 보안: sync 액션 getOwnerId 가드 / neis-client·NEIS_API_KEY server-only / 클라폼 비밀참조 없음
- **사용법**: 홈→학사일정·급식→학교명 입력→"NEIS 동기화"→학사일정·급식 표시
- ⚠ 마이그레이션 `0004_teacher_neis.sql`도 커스텀(드리즐 저널 외) → DB 리셋 시 따로 적용

### ✅ Phase 1-B 시수(차시) 관리 (2026-06-07, autopilot)
| 영역 | 산출물 | 검증 |
|------|--------|------|
| **sessions 쿼리 계층** | `lib/db/queries/sessions.ts` — 시험경계 설정·**N3 차시 생성(오늘~경계, 시간표요일∧수업일, done/not_held 불변)**·상태변경·분반별 진척(잔여차시) | tsc ✅ |
| **시수 화면** | `/sessions`(과목별 시험날짜 설정 + 차시 생성/갱신 + 분반별 잔여차시 + 차시 완료/미진행 마킹) + 홈 카드 | build ✅ |
| **실DB 통합테스트** | `sessions.integration.test.ts` — 경계거부 / 월·수 수업일 차시생성 / 완료→잔여감소 / 재생성 멱등+done보존 (동적 미래날짜로 시간안정) | **4건 그린** ✅ |

- 도메인 규칙 `remainingSessions`(tallySessions·resolveBoundary, 기존 단위테스트) 재사용
- **잔여차시 = plannedUpToBoundary**(아직 안 한 예정 차시 수). 차시 생성이 오늘~경계의 미래 planned만 만들므로, 완료 표시 시 자동 감소. (계획 §3.4 도메인 규칙의 `remaining=planned−done` 필드는 과거 done까지 빼는 다른 의미라 화면엔 plannedUpToBoundary를 '잔여'로 표기)
- 단위 **119 그린** + 실DB 통합 14 그린(roster6+timetable2+calendar2+sessions4) · tsc · build 통과
- 보안: 3개 서버액션 전부 getOwnerId 가드 + 차시생성 audit
- **사용법**: 홈→시수 관리→과목 시험날짜 저장→"차시 생성/갱신"→분반별 잔여차시 확인, 차시 완료/미진행 마킹
- 🔑 컴시간 시간표(B) + NEIS 수업일(E)을 결합한 첫 기능 — **시간표·캘린더 동기화가 선행돼야 정확**

### ✅ Phase 1-C/F + K-1 + 안전망 (2026-06-08, ralph) — 외부 데이터셋 불요 전 기능 일괄
| 영역 | 산출물 | 검증 |
|------|--------|------|
| **C 활동 기입** | `lib/db/queries/activities.ts`(both→placement 1곳 확정) + `/activities` | 통합 3 ✅ |
| **C 관찰·행특** | `observations.ts`(관찰/행특 add·list, 키워드 배열, 학생별 기록수 집계) + `/observations` | 통합 3 ✅ |
| **C 넛지엔진** | `domain/nudge.ts`(assembleNudges 결정론) + `queries/nudge.ts`(collectNudges, KST 16시 게이트) + `app/nudge-banner.tsx`(홈 배너) | 단위 12 ✅ |
| **C 세특 내보내기** | `setech.ts`(buildSourceBundle·saveDraft 검수차단·listDrafts) + `/setech`(번들 생성→복사→붙여넣기 검수→저장) | 통합 4 ✅ |
| **F 출결** | `attendance.ts`(reportRequired 파생, report_tracking 동기화, **unique(owner,student,date,kind) 원자 upsert**) + `/attendance` | 통합 6 ✅ |
| **F 에스컬레이션** | `escalation.ts`(recomputeEscalation 전이 audit, 교외체험) + `0005_pg_cron_escalation.sql`(일일 재계산) | 통합 2 ✅ |
| **K-1 오늘의 학교** | `/today`(시간표·급식·일정·넛지·신고서 티어·잔여차시 통합) | build ✅ |
| **백업** | `backup.ts`(exportOwnerData 37테이블) + `/api/backup`(getOwnerId 가드·attachment·no-store) + 홈 버튼 | 통합 2(owner 격리) ✅ |
| **시크릿 스캔** | `scripts/scan-client-secrets.mjs` + `npm run scan:secrets` | 빌드 후 35청크 0노출 ✅ |

- **테스트 총 158 그린**(단위 124 + 실DB 통합 34) · `tsc` 통과 · `next build` 통과 · `scan:secrets` 0노출
- **리뷰**(architect+code-reviewer, 별도 레인): 보안/PII 클린, 핵심 로직 정확. MAJOR 1건(출결 upsert 경합)→ **unique 제약 + onConflictDoUpdate** 로 해소·재검증.
- 🔁 **DB 리셋 시 커스텀 마이그레이션 추가 적용 목록**: 0001·0002·0003·0004 + **0005_pg_cron_escalation.sql**(pg_cron 일일 재계산) + **0006_attendance_unique.sql**(출결 unique). 실DB에 0006 적용 완료.
- 사용법: 홈→오늘의 학교(통합)/활동 기입/관찰·행특/세특 내보내기/출결. 16시 후 행특 넛지·미제출 신고서 넛지가 홈 배너에 노출.

### ✅ Phase 2 전체 — D·G·H·K-2·I (2026-06-08, autopilot)
| 영역 | 산출물 | 검증 |
|------|--------|------|
| **D 동아리** | `lib/db/queries/clubs.ts`(생성·삭제·부원add(멱등 onConflict)·remove·목록 학생조인) + `/club` | 통합 4 ✅ |
| **G 상담** | `counseling.ts`(작성·목록 최신일순·삭제, target 학생/학부모) + `/counsel`(AI 분석 '준비중' 목업 패널) | 통합 2 ✅ |
| **H 업무·예산** | `tasks.ts`(progress 0~100 클램프·마감순 정렬·진척갱신) + `budget.ts`(영역별 계획액·지출 누계 집계·집행률) + `/staffroom`(교무실 통합) | 통합 4 ✅ |
| **K-2 통계·인쇄** | `stats.ts`(getOwnerStats 8지표 병렬 집계, 성적 '준비중') + `/stats`(통계실) + `/print`(명렬표 인쇄, `print:hidden` + window.print 클라버튼) | build ✅ |
| **I 공지실** | `notice.ts`(공통 한마디 upsert·수동 공지 calendar_events CRUD) + `/notice` + **`0007_public_notice.sql`**(teacher_profile.public_notice 컬럼 + get_public_page commonNotice 연결) | 통합 3 ✅ |

- **테스트 총 171건**(단위 124 + 실DB 통합 47 = 기존34+신규13) · `tsc` 통과 · `next build` 통과(신규 6라우트 전부 ƒ Dynamic) · `scan:secrets` **41청크 0노출**
- **0007 라이브 적용 완료**: `add column if not exists` + `create or replace function`(멱등). get_public_page commonNotice를 0001의 하드코딩 null → teacher_profile.public_notice 로 연결.
- **실DB 통합 13건 그린(라이브 Supabase 실측)**: 동아리 cascade·부원 멱등 / 상담 최신순 / 업무 클램프·마감정렬·예산 집행누계·cascade / **공지 get_public_page가 commonNotice+weekTodos(7일 필터) 정확 노출**. 정리 0잔여.
- 보안: 신규 서버액션 전부 getOwnerId 가드 + audit(상담 본문 등 민감정보는 detail 미기록). 공개 페이지 allowlist DTO 불변 — 공지(commonNotice/weekTodos)는 교사 작성 공통 안내라 학생 PII 아님.
- 홈 대시보드에 6카드 추가(동아리·상담·교무실·통계실·인쇄실·공지실).
- 🔁 **DB 리셋 시 커스텀 마이그레이션 목록 갱신**: 0001·0002·0003·0004·0005·0006 + **0007_public_notice.sql** + **0008_public_weektodos_source_allowlist.sql**.
- 사용법: 홈→동아리(부원·희망진로)/상담(일지)/교무실(업무·예산)/통계실(현황)/인쇄실(명렬표 PDF)/공지실(공개페이지 한마디·할일).

#### 🔍 정식 리뷰 패스 (2026-06-08, Phase 4)
- ⚠ (당시) OMC 보안·코드 리뷰어 서브에이전트가 보고 본문을 반환 못함(출력 0바이트, 하네스 이슈) + git 부재로 네이티브 diff 리뷰 불가 → 직접 정식 패스 수행.
  - ✅ **해결됨(2026-06-10)**: omc 플러그인 업데이트 + ruby 설치 후 리뷰어 서브에이전트가 본문을 정상 반환함(스모크 테스트 확인). git도 초기화(branch main)되어 네이티브 `/code-review`·`/security-review`도 사용 가능. 이후 리뷰는 서브에이전트로 정상 진행 가능.
- **보안**: CRITICAL/HIGH 없음. owner 스코핑 27곳·서버액션 getOwnerId 16/16·allowlist DTO 불변·audit 민감본문 제외 전수 확인.
- **MEDIUM-1 수정 완료** → `0008_public_weektodos_source_allowlist.sql`: `get_public_page` weekTodos가 calendar_events 전 소스를 노출하던 것을 **`source in ('manual','neis')` 화이트리스트**로 제한(personal=개인일정·task=업무마감의 잠재 누출 차단, §3.2 allowlist 원칙). 라이브 적용·회귀 테스트(personal/task 제외 단언) 추가·그린.
- **방어심화**(리뷰 중 선반영): `listBudgets`/`listClubs` 집계 leftJoin에 owner 조건 추가.
- LOW(비차단): tasks.ts listTasks의 JS 재정렬 중복(동작 정확), notice.ts upsert 경합(ownerId unique 방어·기존 패턴 동일).
- 최종 재검증: tsc 0 · 단위 124 그린 · 실DB 통합 13 그린(라이브) · build · scan 0.

## ⏳ 남은 작업

### (보류) 검증 A — Claude 200 OK: API 미사용 결정으로 **게이트에서 제외**. 추후 API 과금 켤 때만.

### 다음 빌드 후보
- **검증 B와 독립** (DB 없이 진행 가능): ~~CSV(`/lib/csv`)~~ ✅ · ~~세특 묶음 내보내기(`/lib/setech`)~~ ✅ · ~~`/p/[token]` 페이지~~ ✅ · ~~NEIS 어댑터 파싱(`/lib/integrations/neis`)~~ ✅ — 완료
  - ~~컴시간 파서~~ ✅ (라이브 실측 완료) · 남은 DB-free 후보: 세특 CSV 입출력, 발급/폐기 토큰 서버액션(쿼리 레이어)
- **DB 연결 필요** (검증 B와 묶음): Google OAuth allowlist + 미들웨어 + RLS 정책, pg_cron 일일 sync(컴시간·신고서 에스컬레이션 재계산), `/p/[token]` 런타임 연결

---

## 빌드 순서 (계획 §4)
**Phase 1**: A(기반·인증·스키마·CSV) → B(수업·시수)·E(캘린더) → C(관찰·세특내보내기·넛지) → F(출결·에스컬레이션) → K-1(오늘의 학교)
**Phase 2** ✅ 완료: D(동아리) → G(상담 목업) → H(업무·예산) → K-2(통계·인쇄) → I(공지+공개페이지)

## 명령어
```powershell
npm run dev          # 개발 서버
npm test             # 단위테스트 (vitest)
npm run build        # 프로덕션 빌드
npm run db:generate  # 스키마 → SQL 마이그레이션
npm run db:migrate   # DB 적용 (DATABASE_URL 필요)
```
