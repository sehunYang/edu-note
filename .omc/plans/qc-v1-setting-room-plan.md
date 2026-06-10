# RALPLAN: QC v1 — 세팅실(Setting Room) 컴포넌트 단위 점진 구현

- 상태: **pending approval** (consensus 진행 중)
- 입력 스펙: `.omc/specs/deep-interview-qc-v1-setting-room.md` (모호도 5%, PASSED)
- 모드: **deliberate** (스키마 마이그레이션 = 고위험 자동 활성)
- 실행 전략: **순차 게이팅 · 컴포넌트 단위 점진 실행** · **통합 테스트 기반 검증**
- 생성: 2026-06-10

---

## RALPLAN-DR (구조화 심의 요약)

### Principles (원칙)
1. **단일 진실원(Single Source of Truth)**: 학년도·학사일정·시수는 파생 함수/단일 테이블에서만 산출. 중복 저장 금지.
2. **점진적 안전성**: 한 번에 한 컴포넌트. 각 컴포넌트는 마이그레이션→쿼리→통합테스트 그린→UI 순으로 닫고 다음으로 진행.
3. **기존 자산 재사용 우선**: `persons`/`studentYears`/`yearLinks`/`subjects`/`performanceItems`/`courseSections` 등 이미 존재하는 스키마·쿼리를 확장, 재작성 최소화.
4. **범위 봉쇄**: QC §향후계획 준수 — 라우트만 세팅실로 이관, 부가 조회화면·타 공간 불변(Non-Goal).
5. **검증 우선**: 각 AC는 통합 테스트(`RUN_DB_ITEST=1`)로 표현 가능해야 "완료"로 간주.

### Decision Drivers (상위 3)
1. **의존성 위계** — C5(수업)는 C2(sync설정)·C3(시험일)·C4(명단)에 의존. 따라서 C1→C2→C3→C4→C5 순서가 강제됨(= QC §1~5 서술 순서와 일치).
2. **마이그레이션 위험 격리** — 13개 스키마 변경을 컴포넌트별 독립 마이그레이션으로 쪼개 롤백 단위를 작게.
3. **테스트 가능성** — 쿼리 계층(`lib/db/queries/`)에 로직을 두고 통합 테스트로 검증, UI는 얇게.

### Viable Options (≥2)

**Option A — 컴포넌트별 수직 슬라이스 (스키마+쿼리+테스트+UI를 컴포넌트마다 완결)** ✅ 채택
- Pros: 각 단계 끝에 동작하는 세팅실 단계 + 그린 테스트. 게이팅 UX와 자연 정합. 롤백 단위 작음.
- Cons: 공유 스키마(enums, teacherProfile) 일부를 여러 단계에서 만지므로 마이그레이션 순서 주의 필요.

**Option B — 수평 레이어 (전 스키마 일괄 → 전 쿼리 → 전 UI)**
- Pros: 스키마를 한 번에 설계해 일관성 최상.
- Cons: 중간 산출물이 동작 안 함(부분 검증 불가). 순차 게이팅·점진 실행 요구와 충돌. 거대 PR.
- 무효화 근거: 사용자가 명시적으로 "컴포넌트 단위 점진 실행" 요구 → B 탈락.

**Option C — 기능 플래그로 신구 병존**
- Pros: 무중단.
- Cons: 운영 데이터 없음(R13) → 무중단 불필요. 복잡도만 증가.
- 무효화 근거: 보존할 운영 데이터 없음 → 오버엔지니어링.

→ **채택: Option A**. (B는 점진 실행 요구 위반, C는 데이터 없음으로 불필요)

---

## Pre-Mortem (deliberate — 실패 시나리오 3)

**시나리오 1 — NEIS 학교명→코드 자동 해석 실패/동명학교.**
`upsertTeacherNeisConfig`는 이미 코드를 받는 구조. 학교명만으로 검색하는 API 래퍼가 없거나 동명 학교 다수면 C2가 막히고 C3·C5가 전부 게이팅에 걸림.
- 완화: C2에 학교검색 함수(`neis.searchSchool(name)`) 추가 + 0건/다건 시 picker fallback. 통합테스트로 단일/다건/0건 3케이스 검증. 자동해석 실패해도 수동 코드 입력 경로 유지(게이트 막힘 방지).

**시나리오 2 — 키워드 추출 오탐/누락으로 시험일 4건이 잘못 유입.**
NEIS 자유텍스트("1학기 1차 지필평가" vs "중간고사" vs "1차 고사")가 키워드와 안 맞아 examOrdinal 오매핑 → C5 examBoundaryDate 오류 → 잔여시수 계산 전파 오염.
- 완화: 추출은 best-effort, **교사 보정 UI가 최종 진실원**(AC-3.3). 추출 규칙을 `lib/domain/calendar-keywords.ts`로 분리해 단위테스트로 다양한 NEIS 표기 케이스 고정.
- **[Architect 수정] 시점 정정**: C3는 `calendarEvents`에 속성(eventKind/examSemester/examOrdinal)을 태깅하기만 한다. `subjects`는 C5 시간표 sync 전까지 존재하지 않으므로 **`subjectExams`는 C5에서 태깅된 calendarEvents로부터 파생 생성**한다(C3에서 유입 불가 — 원래 계획의 내부 모순 해소).

**시나리오 3 — 마이그레이션 순서 의존 깨짐.**
`eventKind` enum, `sectionRoles`(enrollment FK), `subjectExams`(subject FK)가 선행 테이블 존재를 전제. 컴포넌트별 마이그레이션을 잘못 배열하면 FK 생성 실패.
- 완화: 마이그레이션 순서를 컴포넌트 순서에 못박음(아래 §실행 순서). 각 컴포넌트 시작 시 `npx drizzle-kit generate` → 적용 → 해당 통합테스트 그린 확인 후 커밋. enums는 C3 시작 시 추가(소비처와 동일 단계).

---

## 실행 순서 (순차 게이팅 · 위계)

> 각 단계 게이트: `setupState.feature` completedAt 기록 + 해당 통합테스트 그린 + 직전 단계 완료. 미충족 시 다음 단계 잠금.

### 단계 0 — 세팅실 셸 + 학년도 도메인 (기반)
- 신규 `lib/domain/school-year.ts`: `activeSchoolYear(today): number` (3/1 경계).
- 신규 `app/setting/layout.tsx`: 5단계 네비 + `setupState` 기반 순차 게이팅.
- 기존 `app/students`·`app/timetable`·`app/calendar` → `app/setting/{students,courses,calendar}`로 이동, 최상위 라우트는 세팅실 리다이렉트.
- **검증(ITEST)**: `school-year.test.ts`(경계 2/28↔3/1), 게이팅 헬퍼 `setupState` 조회 테스트.
- **AC**: AC-1.1, AC-0.1.

### 단계 1 — C1 학년도 생명주기
- 모든 연도 스코프 쿼리에 `activeSchoolYear` 적용 확인(파생 필터). 신규 저장 시 school_year 주입.
- 레거시: 연도별 조회 쿼리 + 연도 단위 삭제.
- **[Critic 명료화] 보존 술어(testable)**: school_year=Y 삭제 시 `studentYears(Y)` 행은 제거하되, 영속 학생 `persons.p`는 **(p가 school_year>Y인 `studentYears`를 1건 이상 보유) 또는 (resolvedAt 이후 연도의 `yearLinks`가 candidatePersonId=p로 참조)** 이면 보존. 그 외 p는 cascade로 제거. (= 미래 연도가 상속·참조 중인 영속 학생은 절대 삭제되지 않음)
- 마이그레이션: 없음(기존 school_year 컬럼 활용) 또는 인덱스 보강.
- **검증(ITEST)** `lifecycle.integration.test.ts`: (a) 활성연도 필터, (b) 과거연도 조회, (c) 연도삭제 시 참조 persons 잔존, (d) 비참조 데이터 제거.
- **AC**: AC-1.2~1.4.

### 단계 2 — C2 교사 기본 설정
- 마이그레이션 `teacherProfile`: `isHomeroom` boolean, `homeroomGrade` int?, `homeroomClassNo` int?, `schoolName`(neisSchoolName 통합 여부 결정).
- 신규 `lib/integrations/neis.ts > searchSchool(name)` + `app/setting/profile`.
- 학교명 저장 시 코드 자동해석(0/1/다건 분기).
- **[Architect 추가] 양대 통합 동시 해석**: 동일 `학교명` 1개 입력으로 **NEIS(office/school 코드)와 comcigan(자체 학교 식별자) 둘 다** 해석·저장해야 한다. `comcigan-client.ts`의 학교검색을 C2에서 함께 호출해 `teacherProfile.comciganSchool`도 채운다. 그래야 C3(NEIS sync)·C5(comcigan 시간표 sync)가 모두 재입력 없이 동작(AC-2.3). 미해결 시 해당 sync는 수동 입력 fallback 유지(게이트 막힘 방지).
- **검증(ITEST)** `profile.integration.test.ts`: 프로필 upsert, 담임필드 조건부, NEIS 학교검색 단일/다건/0건, comcigan 학교 해석 성공/실패.
- **AC**: AC-2.1~2.3.

### 단계 3 — C3 학사 일정 + 키워드
- 마이그레이션 `enums.ts`: `eventKind` enum. `calendarEvents`: `eventKind` default 'none', `examSemester` int?, `examOrdinal` int?.
- 신규 `lib/domain/calendar-keywords.ts`: 추출 규칙(시험/방학식/개학식/동아리 → eventKind+semester+ordinal).
- `calendar.ts`: sync 시 자동 부여 + 보정 update 쿼리. (subjectExams 유입은 단계 5에서 소비)
- `app/setting/calendar`: 추출 결과 보정 UI.
- **검증(ITEST)** `calendar-keywords` 단위테스트 + `calendar.integration.test.ts` 확장(속성 부여·보정 멱등성).
- **[Critic 명료화] AC-3.1 검증 범위**: C3 통합테스트는 **`calendarEvents`의 eventKind/examSemester/examOrdinal 태깅**만 검증한다. 과목 레벨 4개 시험일 materialization(subjectExams)과 examBoundaryDate 파생은 **C5(AC-5.4)에서 검증**한다.
- **AC**: AC-3.1~3.4(calendarEvents 태깅 한정), AC-2.3(재사용 확인).

### 단계 4 — C4 학생 명단 관리
- 마이그레이션: 신규 `homeroomRoles`(studentYearId, title, desc). (studentYears 기존 phone/career 재사용)
- `roster.ts`/`students.ts`: 동명이인 매칭(displayName+과거연도)→`yearLinks`(auto_linked/pending), 개별 즉시팝업 + 일괄 해소 큐, 상속 resolve(과거학번·연락처·동아리·기록), 학급역할 CRUD, 담임반여부 파생(`studentYears.grade/classNo` == `teacherProfile.homeroomGrade/homeroomClassNo`; sid 문자열 파싱 대신 — Architect 권고).
- `app/setting/students`: 속성 편집 + 상속 팝업/큐 + 담임반 이모지 체크 + 공개링크(담임만).
- **[Critic 명료화] 공개링크 서버 게이팅**: 담임반(True) 한정은 UI 숨김이 아니라 **공개링크 발급 서버 액션에서 담임반 파생값을 재검증**(비담임 학생 요청은 거부). 통합테스트로 비담임 발급 거부 케이스 포함.
- **검증(ITEST)** `roster`/`students.integration.test.ts` 확장: 매칭/상속, 담임반 파생, 공개링크 게이팅, 역할 복수.
- **AC**: AC-4.1~4.6.

### 단계 5 — C5 수업 관리
- 마이그레이션: `subjects`에 `jipilMidEnabled`/`jipilFinalEnabled` boolean. 신규 `subjectExams`(subjectId, semester, ordinal, date?, enabled; unique(subjectId,semester,ordinal)), `sectionPerformanceDates`(sectionId, performanceItemId, date), `sectionRoles`(enrollmentId, title, desc).
- `timetable.ts`: 기존 sync 재사용. 평가설정 100% 검증(Σ수행+지필1+지필2=100, 미시행 0강제, 수행≤5). enrollment 필터는 **`studentYears.grade/classNo/number` 컬럼 기준**(sid 문자열 파싱 대신 — Architect 권고)+전체선택 일괄등록. subjectExams는 **C3에서 태깅된 calendarEvents로부터 파생 생성**.
- **[Architect 수정] examBoundaryDate 신선도**: 저장 컬럼을 1회 갱신에 의존하지 말고 **읽기 시점 파생**(subjectExams 중 오늘 이후 최소 날짜)으로 산출. 저장 컬럼을 유지하려면 잔여시수/시험 관련 쿼리에서 매번 재계산. (cron 부재로 staleness 방지)
- `app/setting/courses`: 분반 상세(등록/평가/날짜/역할).
- **검증(ITEST)** `timetable.integration.test.ts` 확장: 100%검증(통과/실패), 일괄등록 필터, 시험일 유입·경계일 갱신, 분반역할.
- **AC**: AC-5.1~5.8, AC-0.2.

---

## Expanded Test Plan (deliberate)

| 레벨 | 대상 | 도구 |
|------|------|------|
| Unit | `school-year`, `calendar-keywords`(추출 규칙), 100% 검증 순수함수, sid 파싱 | vitest (no DB) |
| Integration | 각 컴포넌트 쿼리 계층 (위 단계별 `*.integration.test.ts`) | `RUN_DB_ITEST=1` vitest |
| E2E (경량) | 세팅실 5단계 게이팅 흐름 1패스(수동 또는 추후) | 범위 외(2차 QC) — 통합테스트로 대체 |
| Observability | 마이그레이션 적용 로그 + `auditLog` 이벤트(연도삭제·상속확정) | 기존 audit_log 재사용 |

- **회귀 가드**: 각 단계 종료 시 전체 통합테스트 스위트 그린 유지(`RUN_DB_ITEST=1 ... run`).
- **검증 게이트 = AC-별 통합테스트 1:1 매핑** (스펙 22개 AC).

---

## ADR (Architecture Decision Record)

- **Decision**: 세팅실을 컴포넌트별 수직 슬라이스(Option A)로, C1→C2→C3→C4→C5 순차 게이팅 구현. 통합테스트를 완료 게이트로 사용.
- **Drivers**: 의존성 위계(C5가 C2/C3/C4 의존), 마이그레이션 위험 격리, 테스트 가능성.
- **Alternatives considered**: B 수평 레이어(점진 실행 요구 위반), C 기능플래그 병존(데이터 없음→불필요).
- **Why chosen**: 각 단계가 동작+그린 테스트로 닫혀 게이팅 UX와 정합하고 롤백 단위가 작음.
- **Consequences**: 공유 스키마(enums/teacherProfile)를 여러 단계서 만짐 → 마이그레이션 순서 못박음으로 완화. 단계별 PR/커밋.
- **Follow-ups (2차/3차 QC)**: 기존 페이지 일상 조회·수정 화면, 동아리 일정↔활동기록 자동연결, E2E 게이팅 테스트, AI 세특.

---

## 실행 진척 (Execution Log)

> 2026-06-10 ralph 실행 시작. 검증 게이트: `RUN_DB_ITEST=1 node --env-file=.env.local ./node_modules/vitest/vitest.mjs run <file>`. DB 도달 확인(Supabase pooler, public 37 tables). 사용자 요청으로 **C1 완료 후 일시 중지**.

### ✅ 단계 0 — 세팅실 셸 + 학년도 도메인 (완료)
- `lib/domain/school-year.ts` — `activeSchoolYear`(3/1 경계)·`schoolYearRange`·`schoolYearRangeYmd`. 단위테스트 `school-year.test.ts` 6 그린.
- `lib/db/queries/setup-state.ts` — `getSetupState`/`markSetupComplete`/`clearSetupComplete`/`isStageComplete`/`isStageUnlocked`/`getStageStatuses`. `SETTING_STAGES=[year,profile,calendar,students,courses]`. 통합테스트 `setup-state.integration.test.ts` 5 그린.
- `app/setting/` 셸: `layout.tsx`(5단계 게이팅 네비, 잠금 표시), `page.tsx`(→/setting/year 리다이렉트), `actions.ts`(completeStage/reopenStage), `stage-gate.tsx`, `locked-notice.tsx`, 5개 하위 페이지(year 실구현 + profile/calendar/students/courses 단계별 placeholder). 홈(`app/page.tsx`)에 세팅실 카드 추가.
- 검증: typecheck 클린 · build exit0(/setting/* 라우트 6개) · 단위 130 그린(회귀 없음).
- 매핑 AC: **AC-1.1, AC-0.1**.

### ✅ C1 — 학년도 생명주기 (완료)
- `lib/db/queries/lifecycle.ts` — `listSchoolYears`(연도별 학생수), `deleteSchoolYear`(트랜잭션: studentYears(Y) 제거 + 참조 영속학생 보존).
- 보존 술어 구현(Critic 명료화 그대로): p 보존 ⟺ (school_year>Y studentYears 보유) ∨ (resolvedAt 기록된 yearLinks 가 candidatePersonId=p 로 미래연도 newStudentYear 참조). 그 외 cascade 제거.
- 통합테스트 `lifecycle.integration.test.ts` 5 그린: (a) 활성연도 필터, (b) 과거연도 조회, (c) 미래 학적 보유 보존, (c2) 미래 resolvedAt yearLink 참조 보존, (d) 미참조 cascade 제거.
- UI: `app/setting/year/page.tsx` + `legacy-years.tsx`(연도 목록 + 확인입력 기반 삭제). 서버액션 `deleteYearAction`(getOwnerId 가드 + `year_delete` audit, 확인값 불일치 거부).
- 검증: typecheck 클린 · build exit0 · itest 5 그린.
- 매핑 AC: **AC-1.2~1.4**.

### ⏸ C2~C5 — 미착수 (다음 세션 재개)
- **C2 재개 지점**: `teacherProfile` 마이그레이션(isHomeroom/homeroomGrade/homeroomClassNo/schoolName) → `lib/db/queries/profile.ts` → NEIS+comcigan 학교명 동시 해석 → `profile.integration.test.ts` → `app/setting/profile` 폼.
- 마이그레이션: `node --env-file=.env.local ./node_modules/drizzle-kit/bin.cjs generate` → `... migrate`.
- **재사용 발견**: `classRoles`(records.ts, studentYearId+roleName+roleDesc) 이미 존재 → C4 학급역할은 신규 homeroomRoles 대신 이를 재사용.
- PRD/진척 상태: `.omc/prd.json`(S0·C1 passes:true), `.omc/progress.txt`.

## 리뷰 상태
- [x] Architect 검토 (당시 직접 패스 — 서브에이전트 빈응답) → 4개 수정 반영: subjectExams 시점 정정, comcigan 학교해석 동시화, examBoundaryDate 읽기시점 파생, 담임반 grade/classNo 파생
- [x] Critic 검토 (당시 직접 패스) → ITERATE 3건(AC-3.1 범위·AC-1.4 보존술어·AC-4.6 서버게이팅) 반영
- [x] Critic APPROVE (iteration 1) → **pending approval 확정**

> 리뷰 노트: (당시) OMC 리뷰어 서브에이전트가 빈 응답을 반환하여(메모리 이력 재현), 사용자 지시에 따라 Architect·Critic 모두 직접 리뷰 패스로 수행함.
> ✅ **해결됨(2026-06-10)**: omc 업데이트 + ruby 설치 후 리뷰어 서브에이전트 본문 반환 정상화(스모크 테스트 확인). 이후 검토는 서브에이전트(`architect`·`critic`·`code-reviewer`)로 정상 진행 가능.
