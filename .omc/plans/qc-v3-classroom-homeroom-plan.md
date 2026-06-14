# QC v3 구현 계획 — 교실 재수정 + 담임 교실 허브

- 상태: **pending approval** (consensus-deliberate)
- 스펙: `.omc/specs/deep-interview-qc-v3.md` (모호도 4.1%)
- 모드: RALPLAN-DR **deliberate** (data migration + 12 컴포넌트 = high-risk)
- 작성: 2026-06-13

---

## RALPLAN-DR Summary

### Principles (P1–P5)
- **P1 Additive-only 마이그레이션**: 단일 공유 prod DB. 모든 스키마 변경은 `add column/table if not exists`·enum `ADD VALUE` 단독파일, `scripts/apply-sql.mjs` 직접 적용. drizzle generate 금지(저널 stale 0000 함정).
- **P2 기존 규약 보존**: `lib/db/queries/*` ownerId 인자, `index.ts` re-export, 서버컴포넌트+서버액션+audit, itest는 `RUN_DB_ITEST=1` 합성 데이터·`randomUUID` owner 격리.
- **P3 도메인 순수함수 우선**: 분기 로직(차시 N, 학기경계, 출결 결석범위, 마감 3단계, 선택과목 후보)은 `lib/domain/*` 순수함수로 빼고 단위테스트로 고정 → itest 부담 최소화.
- **P4 컴시간은 읽기전용·구조탐지**: 키 하드코딩 금지(이미 `comcigan.ts` 패턴). 파싱 실패는 throw→수기 fallback. 학생 선택과목은 컴시간으로 못 채우므로 교사 고정반설정 + 학생 자가매핑으로 보정.
- **P5 학기 경계 단일 출처**: 담임 컴포넌트=학기무관, 교실 컴포넌트=학기aware. 여름방학 경계는 `calendarEvents` vacation에서 도출하되 미설정시 8/14 fallback(무중단).

### Decision Drivers (top 3)
- **D1 무중단·데이터 보존**: 200+행 prod 데이터 유실 0. 모든 마이그 additive, 기존 쿼리 시그니처 변경은 호출처 전수 추적(2-1에서 today/page.tsx 누락 전례).
- **D2 검증 가능성**: 차시 공식·학기경계·출결 결석범위 등은 itest/unit으로 동치 단언 가능해야 함(사용자가 버그를 수치로 지적 — 물리 97차시).
- **D3 의존 순서**: 학생 안내 페이지(12)는 공지 한마디·고정반설정·상담슬롯·출결표에 의존 → 맨 마지막. 마이그는 맨 처음.

### Viable Options

**옵션 A — 단일 대형 브랜치, 권장 작업순서대로 순차 (채택)**
- 한 브랜치 `feat/qc-v3`에서 US-0(마이그)→Part A→허브→확장→신규→학생안내→배포.
- Pros: 의존성 충돌 없음, 기존 2-1/2-2 ralph 워크플로우와 동일, 리뷰 단순.
- Cons: 브랜치 수명 김, 중간 배포 불가(전부 끝나야 머지).

**옵션 B — Part A와 Part B 별도 브랜치 병렬, 2회 배포**
- Part A(교실 재수정, 독립적)를 먼저 머지·배포 → Part B(담임 허브) 별도.
- Pros: Part A 조기 배포·가치 조기 실현, 위험 분리.
- Cons: 출결 라우트 이전이 Part B인데 기존 /attendance가 Part A 기간 살아있어 혼선 가능. 컴시간 고정반설정(공지실)이 Part A·B 걸침.

**옵션 C — 컴포넌트별 마이크로 PR (기각)**
- 12개를 각각 PR.
- 기각 사유(invalidation): 마이그 의존·라우트 이전·학생안내 교차의존이 많아 PR 간 머지순서 강제와 충돌 해소 비용이 옵션 A 대비 큼. 단일 교사 prod라 조기 배포 이득도 작음.

**채택: 옵션 A** — 단, 배포 게이트를 2개 둠(Part A 완료시 1차 검증 체크포인트, 전체 완료시 배포). D3 의존순서와 P1 무중단에 가장 정합.

---

## Requirements Summary
qc-report-v3.md의 12개 컴포넌트(스펙 AC-1.x ~ AC-12.x)를 edu-note 기존 아키텍처로 구현. (A)교실 4개 재수정, (B)`/homeroom` 허브 신설 + 출결·상담·공지·행특 이전 + 자율진로·생기부 신규 + 학생안내 개편.

## Acceptance Criteria
스펙 `.omc/specs/deep-interview-qc-v3.md` §Acceptance Criteria(AC-1.1~AC-12.9) 전체를 그대로 채택. 각 US 단계 끝에 해당 AC를 itest/unit로 검증.

---

## Foundational Decisions (consensus iteration 2 — Architect+Critic REQUIRED)

These are load-bearing decisions that US-6~US-13 depend on. Resolved here so executors cannot diverge.

- **FD1 담임반 멤버십 단일 출처 = `homeroomMembers`/`homeroomClasses` 테이블** (`observations.ts:392`, 이미 `app/homeroom/behavior/page.tsx:21`가 사용). **`roster.ts:557 isHomeroomStudent`(profile-derived) 퇴역** → `listHomeroomStudents`(테이블) 기반의 얇은 래퍼로 재구현하거나 호출처 전환. **백필**: 마이그 시 `studentYears.grade/classNo == teacherProfile.homeroomGrade/homeroomClassNo`인 학생을 `homeroomMembers`로 채움. 전환 호출처: behavior(이미 테이블), 신규 출결/상담/공지/자율진로/생기부 전부 `listHomeroomStudents` 사용. **itest**: 백필 후 두 술어(테이블 vs profile)가 동일 집합 반환 단언. → **AC-8.1의 실제 버그 = `homeroomMembers` 미채움**(profile만 설정됨). 와이어링이 아니라 백필이 수정.
- **FD2 `get_public_page` SQL 함수가 학생 공개페이지 단일 read 경로** (`0007_public_notice.sql:41`, `0008`). 쿼리계층 아님. 모든 AC-12 섹션은 이 함수 계약을 통해 나간다. → US-0b·US-13에서 `create or replace get_public_page` 명시 작업. **신뢰경계 주의**: 현 함수는 `security definer`로 `reason`·원점수를 의도적으로 제외. AC-12.6 출결 2D표(성격×사유)는 **`reason`을 공개면에 노출** = 트러스트 경계 변경(명시 승인 필요, 성적 제거 AC-12.7과 함께 검토).
- **FD3 출결 tier = 모델 교체(재매핑 아님)**. 기존 `computeTier`(`escalation.ts:18`)=경과일 monotonic-up(normal/warning/critical). AC-7.7=잔여 수업일(≥3/<3/<0)로 **축이 역전**. **결정: 신규 `submissionTier(remainingSchoolDays)` 별도 함수로 교체**, `reportTracking.lastTier` enum 스냅샷 마이그레이션 + 소비처 `app/today/page.tsx:180-184`·`lib/domain/nudge.ts:126` 갱신. 에스컬레이션 cron이 경과일을 계속 쓰면 `computeTier`는 그 용도로만 잔존(중복 명시).
- **FD4 Part A = 신규 마이그레이션 0건**. US-1~US-5(교실 재수정)는 쿼리·도메인 재작성 + 상수/함수 변경뿐(신규 테이블·컬럼 없음). US-0b 스키마는 **Part B 전용**. → Part A는 US-0b 없이 독립 검증·체크포인트 가능.

## Implementation Steps (작업 단위 = US)

### US-0a 도메인 상수/함수 변경 (Part A, 마이그 0건)
AC-7.6 체험 5→10은 사실 `escalation.ts:30 fifthSchoolDayAfter`(하드코딩 5/`after[4]`) — 상수 아닌 함수 시그니처 변경. Part A에는 영향 없음(US-7로 이연). Part A는 신규 스키마 불필요.

### US-0b 마이그레이션 + 스키마 + audit (Part B 전용, P1, D1)
파일: `lib/db/migrations/00NN_*.sql`(손작성, idempotent) + `lib/db/schema/{records,attendance,misc,classes}.ts` + `lib/db/queries/audit.ts`
- 0020 `attendance_periods`: attendanceRecords에 `periods int[]` 컬럼 add(지각/조퇴/결과 교시). **타입 확정=`int[]`**(jsonb 아님). nullable, 기존행 보존.
- 0021 `counsel_slots` / `counsel_reservations`: (ownerId, date, capacity) / (ownerId, slotId FK, studentYearId, createdAt). RLS owner_rw, unique(slotId, studentYearId).
- 0022 `teacher_notes` 다중화: 기존 단일 한마디(`teacherProfile.publicNotice`, misc.ts:182) → `teacher_notes(ownerId, body, sortOrder, timestamps)` 신규 테이블. **기존 publicNotice 값을 첫 행(sortOrder=0)으로 insert(데이터 이행)** + `todos`에 `content text` 컬럼 add. **반드시 `create or replace get_public_page`** 하여 한마디를 신규 테이블 배열로 읽도록 갱신(FD2). 단일 simple-query 제약상 enum/함수/테이블이 한 파일 내 신규값 사용 충돌 없도록 파일 분리(테이블 생성+데이터이행 / 함수 재정의 순서). **부분적용 윈도우**: 테이블 insert 성공·함수 재정의 실패 시 공개페이지 한마디 공백 → 함수 재정의를 후행 파일로 두고 적용 후 행수+함수 반환 단언, 실패시 재적용(idempotent).
- 0023 `fixed_class_settings`: (ownerId, grade, classNo, subjectName, isFixed) — 컴시간 학년파싱 기반 고정반 체크.
- 0024 `student_elective_mappings`: (ownerId, studentYearId, weekday, period, mappedSubject) unique(studentYearId, weekday, period).
- 0025 `homeroom_records` 생기부 초안: (ownerId, studentYearId, **area text + CHECK(area in ('self','career','behavior'))**, draft text, source) — pg enum 금지(apply-sql 단일쿼리 분리 회피, M1). 세특 draft 테이블 형상이 3-area 판별자를 지원하는지 **확인 후** 재사용 결정(가정 아님).
- 0026 `reportTracking.lastTier` tier 모델 교체(FD3): 신규 단계값으로 enum/CHECK 갱신 + 기존 스냅샷 값 매핑 마이그레이션.
- 0027 `homeroomMembers` 백필(FD1): profile 술어로 현 담임반 학생 채움(idempotent).
- audit.ts: AuditEvent 유니온에 신규 이벤트 추가(attendance_period_record, counsel_slot_open/reserve/cancel, teacher_note_*, fixed_class_save, elective_map_save, homeroom_record_*, homeroom_backfill 등).
- 검증: `apply-sql.mjs` 적용 후 `relrowsecurity` 확인, `get_public_page` 반환 계약 단언, schema additive 동기화, typecheck 0.

### US-1 도메인 순수함수 (P3, D2) — itest 전에 unit로 고정
파일: `lib/domain/*.ts` + `*.test.ts`
- `lesson-plan.ts`: `computePlanLength` 재정의 — 대표분반(주당 슬롯 최대) 단일 기준. + `representativeSectionDates(schoolDays, slotWeekdays)` → k번째 수업일 배열(월/주차·시험마커용).
- `school-year.ts`: `semesterRange`에 vacation boundary 주입 가능하게 시그니처 확장 또는 `resolveSemesterBoundary(events, year)` 신규(여름 vacation 시작 도출, 없으면 8/14).
- `attendance.ts`(신규 또는 확장): `absentPeriods(kind, pivotPeriod, periodList)` — 지각=조회~pivot 포함, 조퇴=pivot~끝, 결과=선택 그대로, 결석=전체. `submissionTier(dueSchoolDaysRemaining)` → 1/2/3단계(≥3 / <3 / <0).
- `elective.ts`(신규): `electiveCandidates(gradeSlots, fixedSubjects, weekday, period)` → 그 (요일,교시) 비고정 과목 목록.
- 단위테스트: 각 함수 경계값(물리 다분반 동치, 8월초 경계, 지각 inclusive, 마감 3단계, 후보 필터).

### US-2 수업계획실 (AC-1.x)
파일: `lib/db/queries/lesson-plan.ts:getPlanLength` 재작성(union→대표분반) + `app/classroom/plan/page.tsx`/`plan-editor.tsx`(월주차·시험마커 표시) + itest.
- 시험마커: `calendarEvents` exam(ordinal 1/2) ∩ 대표분반 k번째 수업일 시기 → 차시행 마커.

### US-3 진척도 (AC-2.x)
파일: `lib/db/queries/progress.ts`(`generateSemesterSessions`/`listSectionsForSemester`/`listProgressPopup`가 쓰는 경계 도출) + `app/classroom/progress/*` + itest(8월초 vacation 후=2학기 단언, vacation 미설정시 8/14 fallback 단언).

### US-4 성적기록 (AC-3.x)
파일: `lib/db/queries/grades.ts:getGradeView` → 회차별·항목별 분해 반환(jipilMid/Final 별도, perf 항목별) + `app/classroom/grades/page.tsx`/`grades-uploader.tsx`(미시행 숨김) + 신규 `app/classroom/grades/view/page.tsx`(저장 CSV 테이블 조회) + itest.

### US-5 세특작성 (AC-4.x)
파일: `app/classroom/setech/*` — 예시 CSV 다운로드(`lib/ui/download-csv.ts` 재사용), 과목→수강생 필터 드롭다운(enrollments), 추가입력 목록 CRUD(서버액션+audit) + itest.

### US-6 담임 허브 셸 + 라우트 이전 (AC-5.x)
파일: `app/homeroom/layout.tsx`+`page.tsx`(6 하위 카드, 담임 게이팅) + `app/homeroom/{attendance,counsel,notice,behavior,activities,record}/` + 기존 `app/{attendance,counsel,notice}` 제거/리다이렉트 + `app/page.tsx` 홈카드 갱신. `isHomeroomStudent`/세팅 profile 재사용.

### US-7 출결 확장 (AC-7.x)
파일: 출결 쿼리/액션 + `app/homeroom/attendance/*` + `lib/domain/escalation.ts`/`attendance.ts` — 교시 목록(조회+컴시간 당일 N), absentPeriods 적용, 결과 다중선택, **체험 5→10**(`escalation.ts:30 fifthSchoolDayAfter` 함수 시그니처 변경, 상수 아님), **tier 모델 교체**(FD3: 신규 `submissionTier(remainingSchoolDays)`, `reportTracking.lastTier` 마이그(0026) + 소비처 `today/page.tsx:180-184`·`nudge.ts:126` 갱신), 월별/학생별/미제출 뷰 + itest. 담임반 학생 = `listHomeroomStudents`(FD1).

### US-8 행특 판별 수정 (AC-8.x)
파일: `app/homeroom/behavior/*` + 0027 백필 — **실제 버그=`homeroomMembers` 미채움**(FD1). behavior는 이미 `listHomeroomStudents` 사용 중이므로 코드 재작성 아님; 0027 백필로 담임반 학생을 채워 동작하게 함. itest: 백필 후 두 술어 동일 집합 단언 + behavior 렌더 회귀.

### US-9 상담실 (AC-9.x)
파일: `app/homeroom/counsel/*`(rename) — 기록 수정 액션 추가, counsel_slots/reservations CRUD(교사 오픈), 코워크 CSV 원천화(세특 패턴), 담임반 필터 + itest(슬롯 정원·선착순·중복예약 거부).

### US-10 공지실 + 고정반 설정 (AC-10.x)
파일: `app/homeroom/notice/*` — teacher_notes 다중 CRUD+순서, 공개 스와이프(클라), 할일 수정+content, **고정반 설정 패널**(컴시간 학년 전체 파싱→체크 저장 fixed_class_settings) + itest.

### US-11 자율·진로활동 (AC-6.x)
파일: `app/homeroom/activities/*`(신규) — self_activity 이벤트 로드, 학생 복수체크 일괄저장(학생별 행), 자유탐구 공통/개별+자율/진로 토글, 수정/삭제 + itest.

### US-12 생기부 작성 (AC-11.x)
파일: `app/homeroom/record/*`(신규) — 세특 동일 틀, 3영역 원천 CSV 내보내기(자율←activities자율, 진로←activities진로, 행발←behavior+상담CSV+class_roles)→업로드 초안 + itest.

### US-13 학생 안내 페이지 (AC-12.x) — 맨 마지막
**⛔ 선행 차단(hard blocker)**: AC-12.6 출결 2D표(성격×사유)는 `get_public_page`(security definer) 공개면에 `reason`을 노출한다. **사용자 명시 승인 전까지 이 sub-task 착수 금지**(Follow-up 아님). 승인 없으면 2D표를 성격(kind)만 1차원으로 축소하거나 보류.
파일: `app/p/[token]/page.tsx` + 컴포넌트 + **`get_public_page` 함수 재정의(FD2 핵심)**.
- **`create or replace get_public_page`로 반환 계약 확장**(쿼리계층 우회 불가 — 단일 read 경로): (a) 출결 **성격×사유 2D 집계**(현 함수는 `kind`만 count, `reason` 미포함 → `reason` 차원 추가 = **트러스트 경계 변경, 명시 승인 후 적용**), (b) 상담 슬롯 잔여 가용성(AC-12.8 학생 read 경로 = 함수, `isHomeroomStudent` 서버로직 호출 불가), (c) 다중 `teacher_notes` 배열, (d) 컴시간 파싱 담임반 시간표(현 함수는 enrollments 조인 → 파싱본으로 교체). **관측성**: 함수가 신규 섹션에서 throw하면 학생 페이지 전체 500(React try/catch로 SQL 함수 실패 격리 불가) → 함수 내 신규 섹션을 NULL-safe·결측 graceful 처리, 적용 후 계약 itest.
- UI: 이름 헤더, 일정 캘린더(학사+공지할일, 오늘강조, 월이동), 시간표(컴시간 담임반 base + 선택과목 표기 + 학생 자가매핑 토글), 급식 당일, 출결 2D표, 성적 제거, 상담신청 캘린더(슬롯 잔여). + 컴시간 학생시간표 매일 동기화(교사 동기화와 동일 cron/route 패턴).
- 공개링크 버그(AC-12.9): `app/setting/students` 토큰 발급 후 재조회 표시(이미 yearLinks 저장됨, UI만).

### US-14 회귀 + 배포
typecheck 0 + build exit0 + 전체 itest green + architect 검증 → git push origin main(Vercel icn1). 익명 스모크 한계 인지(보호라우트 404=인증게이트).

---

## Risks and Mitigations
- **R1 쿼리 시그니처 변경 누락(D1 전례)**: 실제 호출처 census(grep 확인) — `semesterRange`=`lesson-plan.ts:39`+`progress.ts:52` **2곳뿐**, `getPlanLength`=`plan/page.tsx:37` **1곳뿐**. (sessions/today/student-report는 `examBoundaryDate` 사용, semesterRange 미호출 — phantom 제거.) 변경 후 grep 재확인 + typecheck 게이트.
- **R2 마이그 enum/컬럼 비가역**: additive·idempotent만, ADD VALUE 단독파일. 롤백=잔존(무해). 적용 전 `apply-sql.mjs` 단일 simple-query 제약 인지(enum ADD와 사용 분리 파일).
- **R3 컴시간 구조 변동**: 학년 전체 파싱·학생 시간표가 파서 의존. 파싱 실패시 throw→고정반설정/시간표는 "동기화 실패, 수기" 안내 + audit. 기존 `decodeTimetable` 재사용(키 하드코딩 없음).
- **R4 teacher_notes 단일→다중 마이그**: 기존 단일 한마디 데이터 보존하며 신규 테이블로 이행(첫 행 sortOrder=0). 마이그에서 기존값 insert.
- **R5 라우트 이전 중 깨진 링크**: /attendance 등 제거시 리다이렉트 + app/page.tsx·내부 Link 전수 grep 갱신.
- **R6 학생 자가매핑 후보 부정확**: 컴시간 선택과목 (요일,교시) 추출이 명목 classNo라 후보에 잡음 가능 → electiveCandidates 단위테스트 + 교사 고정반설정으로 1차 필터.

## Verification Steps
- 단위: `node ./node_modules/vitest/vitest.mjs run lib/domain/*.test.ts`(US-1 경계값 전부).
- 통합: `RUN_DB_ITEST=1 node --env-file=.env.local ./node_modules/vitest/vitest.mjs run <file>` — lesson-plan/progress/grades/attendance/counsel/notice/activities/homeroom-record integration.
- 빌드: `npm run build`(전 라우트 exit0).
- 타입: `npm run typecheck` 0err.
- architect 검증(opus) APPROVED + deslop(ai-slop-cleaner) 후 재회귀 green.

---

## Pre-mortem (5 시나리오)
1. **차시 수정이 진척도를 깬다**: getPlanLength 대표분반 변경이 진척도 분반별 생성과 불일치 → 계획실(과목단위 N)과 진척도(분반별 실제차시)는 의도적으로 다름(스펙 명시). 회귀: 둘의 itest 독립 단언 + k>N null path 단언. 실패신호=진척도 차시 수 급변.
2. **teacher_notes 마이그가 기존 한마디 유실 / get_public_page 불일치**: 단일→다중 이행 중 기존값 누락, 또는 테이블만 갱신·함수 미갱신으로 공개페이지가 stale publicNotice 표시 → 마이그에 기존값 첫행 insert + `create or replace get_public_page`(후행 파일) + 적용 후 행수·함수반환 단언. 실패신호=공개페이지 한마디 공백/stale.
3. **학생안내 페이지 500 (get_public_page throw)**: 신규 섹션(2D출결·상담슬롯·다중노트)에서 SQL 함수 throw → 학생 페이지 전체 500(React try/catch는 함수 실패 격리 불가) → 함수 내 NULL-safe·graceful + 계약 itest. 실패신호=/p/[token] 500.
4. **담임반 멤버십 분기 divergence (FD1)**: 한 실행자는 `homeroomMembers`, 다른 실행자는 profile 술어 사용 → 출결/생기부가 서로 다른 학생집합 → 데이터 정합 깨짐. 차단: FD1로 단일출처 강제 + 0027 백필 + 두 술어 동일집합 itest. 실패신호=출결·생기부 학생 명단 불일치.
5. **컴시간 포맷 변동으로 시간표 동기화 실패**: 파싱 throw → 시간표 섹션만 "동기화 대기" placeholder + 나머지 정상 렌더 + audit 경고. 실패신호=시간표 공백+동기화 audit 실패.

## Expanded Test Plan
- **Unit**: computePlanLength(다분반 동치 + k>N null), resolveSemesterBoundary(8월초/미설정 fallback), absentPeriods(지각 조회~기점 inclusive/조퇴/결과 다중/결석 전체), submissionTier(잔여 3일경계 ≥3/<3/<0), electiveCandidates(고정반 제외, 요일·교시 필터).
- **Integration(RUN_DB)**: 계획실 N 분반독립, 진척도 vacation 경계 분류, 성적 분해뷰, 상담 슬롯 정원·선착순·중복거부, 공지 다중한마디 순서, 자율진로 일괄저장, 생기부 3영역 원천 집계, 출결 교시/마감, **FD1 두 술어 동일집합(0027 백필 후)**, **FD2 get_public_page 재정의 계약**(다중노트 배열·reason 2D집계·상담슬롯 — `notice.integration.test.ts`/공개페이지 itest 확장), **FD3 reportTracking.lastTier 마이그 값 매핑 단언**.
- **E2E(수기/인증)**: 사용자 인증 후 /homeroom 6하위 렌더, 학생 /p/[token] 신규 섹션 렌더, 공개링크 재조회. (익명 스모크는 404 한계 — 사용자 영역.)
- **Observability**: 신규 audit 이벤트 writeAudit, 컴시간 동기화 실패 audit+경고, 마이그 적용 행수+`get_public_page` 반환 로그, today-page nudge tier 카운트 회귀.

---

## ADR
- **Decision**: 옵션 A(단일 브랜치 `feat/qc-v3`, 권장순서 순차) + deliberate 검증. 도메인 순수함수 우선(P3).
- **Drivers**: D1 무중단·데이터보존, D2 검증가능성, D3 의존순서.
- **Alternatives considered**: B(Part A/B 병렬 2배포 — 라우트 이전 혼선·컴시간 교차로 기각), C(마이크로 PR — 머지순서 강제비용으로 기각).
- **Why chosen**: 12컴포넌트의 마이그·라우트·학생안내 교차의존이 강해 단일 순차가 충돌 최소. 기존 2-1/2-2 ralph 워크플로우와 동일해 학습비용 0.
- **Consequences**: 단일 브랜치지만 **Part A 하드 배포 게이트**(FD4): Part A(US-0a + US-1~US-5)는 신규 마이그 0건으로 독립 검증→머지·배포 가능 → 사용자 보고 수치버그(물리 97, 8월초 학기, 성적분해) 조기 실현 + Part B(US-0b~US-13) 고위험 분리. Part B는 fresh 브랜치 권장.
- **Follow-ups**: 선택과목 시간표 변동 능동감지·알림(이번 제외), 상담 AI/생기부 실제 코워크 운영 가이드, performance_assessments unique 제약 추가(현 수동 upsert), `get_public_page` reason 노출 트러스트 경계 사용자 명시승인 확인.

---

## Execution Notes (Critic ACCEPT-WITH-RESERVATIONS — 실행 시 반영)
- **EN1 reason 노출 승인 게이트**: US-13 상단 ⛔ 차단으로 격상(완료). 실행자는 2D표 착수 전 사용자 승인 확인.
- **EN2 lastTier 구체 값셋 결정**: `submissionTier`는 1/2/3 단계 반환하나 저장 enum은 현 `normal/warning/critical`. US-0b/US-7에서 **저장 enum의 구체 값 + 구→신 매핑을 확정**(today/page.tsx는 `"warning"`/`"critical"` 리터럴 필터 → 소비처 동시 갱신 필수). test plan이 매핑 단언으로 보호.
- **EN3 setech draft 스키마 확인 시점**: 0025 작성 **전에** 기존 setech draft 테이블 형상(3-area 판별자 수용 여부) 확인 단계 선행(재사용 vs 신규 결정).
- **EN4 브랜치 모델 단일 명시**: Option A = `feat/qc-v3` 단일 브랜치로 Part A 완료·머지·배포 → 그 후 **Part B는 main에서 분기한 fresh 브랜치**로 진행. (ADR 단일브랜치와 모순 아님 — 순차 분기.)
- **EN5(open) tier 5번째 소비처 확인**: `escalation.ts:21` pg_cron 백스톱이 `lastTier`를 쓰는지 US-7 착수 시 grep 확인. 쓰면 today/page·nudge.ts 외 추가 소비처로 갱신 대상.

## Changelog (consensus iteration 2 반영)
Architect(SOUND-WITH-CHANGES) + Critic(REJECT→해소) 필수 7건 전부 반영:
- **C1/FD1**: 담임반 멤버십 단일출처=`homeroomMembers` 테이블 확정, `isHomeroomStudent` 퇴역·백필(0027), AC-8.1 실제버그=미채움 재해석, 두 술어 동일집합 itest.
- **C2/FD2**: `get_public_page` 재정의를 US-0b(다중노트)·US-13(2D출결·상담슬롯·시간표)에 명시, reason 노출 트러스트 경계 플래그.
- **C3/FD3**: 출결 tier=모델 교체 선언, `submissionTier` 신규, `reportTracking.lastTier` 마이그(0026), 소비처 today/page·nudge.ts 갱신.
- **M1**: `homeroom_records.area` → text+CHECK(enum 금지).
- **M2**: R1 호출처 census 교정(phantom 제거, 실제 2/1곳).
- **M3/FD4**: Part A 신규 마이그 0건 명시, US-0 → US-0a/US-0b 분할, Part A 배포 게이트 구조화.
- **Pre-mortem/Test**: 5 시나리오(FD1·FD2 추가), test plan에 술어동일성·함수계약·tier마이그 행 추가.
- 부수: periods=int[] 확정, AC-7.6=escalation.ts:30 함수변경, teacher_notes 부분적용 윈도우 롤백 노트.

상태: **pending approval** — 비대화형 consensus, 자동 실행 없음. 실행은 별도 명시 승인 필요.
