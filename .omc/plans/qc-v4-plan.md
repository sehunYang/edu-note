# QC v4 구현 계획 (Consensus Plan — deliberate)

- 입력 스펙: `.omc/specs/deep-interview-qc-v4.md` (모호도 4.7%, 9개 컴포넌트)
- 상태: **pending approval**
- 모드: consensus / deliberate (DB 마이그레이션 동반)
- 마이그레이션 시작 번호: `lib/db/migrations/0030_*` (현재 최신 0029)

---

## RALPLAN-DR Summary

### Principles
1. **기존 데이터 모델 관례 유지** — drizzle 스키마(`lib/db/schema/*.ts`) + 순번 SQL 마이그레이션(`0030+`) + 쿼리별 integration 테스트 패턴을 그대로 따른다.
2. **순수 도메인 로직 분리** — 판정·계산(신고서 규칙, 진도율, 넛지 선택)은 `lib/domain/*`의 순수 함수로 두고 단위 테스트한다(예: `attendance-rules.ts`, `nudge.ts`).
3. **공개 페이지는 단일 SQL 함수 계약** — 학생 안내 페이지는 `get_public_page()` 함수 한 번 호출이 진실원. 변경은 `0031_get_public_page_v4.sql` + DTO 동시 개정.
4. **넛지는 유도이지 강제 아님** — 당일 수업 단위로만 생성, 지나간 미기록을 누적 표시하지 않음.
5. **prod 마이그레이션은 사용자 승인 게이트** — 로컬 검증 후 프로덕션 적용은 별도 승인.

### Decision Drivers (top 3)
1. **데이터 모델 신규성**: 세부단원 계층(대/중/소)·시험별 목표진도·출결 기간/자동생성·공지 대상·급식 영양·상담 취소는 전부 신규 스키마. 마이그레이션 안전성이 최우선.
2. **회귀 위험**: 출결 신고서 판정(`isReportRequired`) 반전, `get_public_page` v4 개정은 기존 동작/테스트에 직접 영향.
3. **작업량 분배**: 9개 컴포넌트(횡단 2개 포함)는 의존성에 따라 단계화해야 병렬 실행 효율이 산다.

### Viable Options

**Option A — 수직 슬라이스(컴포넌트별 완결) 순차/병렬**
- 각 컴포넌트를 스키마→쿼리→UI→테스트까지 한 번에 완결.
- Pros: 컴포넌트 단위 리뷰/검증 명확, 리스크 격리.
- Cons: 횡단(페이지네이션/라우팅)·공유 자원(`get_public_page`, 출결 스키마)에서 충돌 가능.

**Option B — 레이어 우선(전 컴포넌트 스키마 먼저 → 쿼리 → UI)**
- Pros: 마이그레이션을 한 묶음으로 검토.
- Cons: 중간 산출물이 동작하지 않아 검증 지연, 큰 PR.

**선택: Option A + 의존성 단계화** (아래 Phase). 횡단 컴포넌트(#8 페이지네이션, #9 라우팅)는 공유 유틸로 먼저/독립 처리하여 B의 통합 검토 장점을 일부 흡수. Option B는 "중간 비동작 + 거대 PR"로 검증 비용이 커 기각.

---

## 구현 단계 (Phase / 의존성)

### 마이그레이션 레인 (횡단 — Architect 권고 #3)
스키마 마이그레이션 **번호는 작성 시점이 아니라 머지/통합 시점에 "다음 순번"으로 부여**한다(드리즐 `_journal.json`은 파일순=적용순이라 병렬 Phase에서 정적 번호가 깨짐). 아래는 **의존성 DAG**이며 번호는 표기상 예시:
- `lesson_units` / `exam_targets` (Phase 1) — 독립
- `attendance_ranges`(교외체험학습 start/end + 결석 기간) (Phase 3) — 독립
- `teacher_note_target` (Phase 4) — 독립
- `meal_nutrition`(meal_cache ntr_info 컬럼) (Phase 5) — 독립
- `get_public_page_v4` (Phase 5) — **반드시 `teacher_note_target` + `meal_nutrition` 이후 마지막**에 부여(0033-before-0034 역전 방지). 머지 시 `drizzle-kit generate` 직렬화.

### Phase 0 — 공유 기반 (선행, 충돌 최소화)
- **S0.1 페이지네이션 유틸(#8)**: 공용 번호식 페이지네이션 컴포넌트 + 쿼리 `limit/offset` 헬퍼.
  - 파일: `components/` 신규 `paginator.tsx`(공용), 각 쿼리에 `limit/offset` 파라미터 추가.
- **S0.1b 적용 체크리스트 (Critic M2 — 16개 대상 전수)**: 아래 모두에 공용 paginator 적용. ✅=다른 Phase가 커버, ➕=본 체크리스트에서 신규 적용(누락 보강).
  - **10개씩** — 수업계획실 차시(✅S1.6), ➕교과 관찰(`app/classroom/observations`·`observations.ts`), ➕세특 작성/학생 추가 입력(`setech.ts`), ➕자율·진로활동(`activities.ts`), 출결-월별 조회(✅S3.4), 출결-학생별 검색(✅S3.4), ➕상담실-상담 기록(`counseling.ts`), 공지실-한마디/할일·공지(✅S4.4), 출결-미제출(✅S3.4), 출결-교외체험학습 목록(✅S3.4), ➕행동특성 기록(`homeroom-record.ts`/`app/homeroom/behavior`), ➕상담 예약 슬롯(교사측 슬롯 목록, `counsel.ts`).
  - **20개씩** — 진척도(✅S2.3), ➕학사일정(`calendar.ts`·학사일정 목록 뷰), ➕학생 명단(`students.ts`·`app/setting/students`).
  - 미커버 8개(➕)는 각 Phase 진행 시 또는 Phase 0 말미에 일괄 적용. 페이지수(10/20)는 AC-8.2/8.3 그대로.
- **S0.2 디바이스 라우팅(#9)**: 서버 User-Agent 판별 → 루트(`/`) 진입 시 `/today` 리다이렉트.
  - 파일: **기존 `middleware.ts`(이미 존재, `/` 매칭) 편집** — UA 분기를 `updateSession`과 조합하되 기존 auth 매처/allowlist를 약화시키지 않음(Architect #6). 루트 외 미적용(AC-9.3).
  - 테스트: UA 모바일/데스크톱 분기 단위 테스트.

### Phase 1 — 수업 계획실 2단계 (#1) ★ 최대 신규 스키마
- **S1.1 스키마**: `0030_lesson_units.sql` + `lib/db/schema/` — `lesson_units`(과목별, 대/중/소단원명, 6자리코드, 핵심개념 text[], min_ordinals int), `exam_targets`(semesterPlan, examOrdinal 1/2, unitRangeFrom, unitRangeTo). 과목 단위(AC-1.1, 스펙 R1).
- **S1.2 쿼리**: `lib/db/queries/lesson-plan.ts` 확장 — 단원 CRUD, 시험별 목표진도 CRUD, 6자리코드 lookup, 차시-단원 연결. 차시 자동 카운트 + 최소차시 초과 검증. **6자리코드(대2+중2+소2)가 존재하지 않는 단원을 가리키면 자동채움 실패 처리**(인라인 오류 표시, 저장 차단)(AC-1.6, Critic 보강).
- **S1.3 라우트 분리**: `app/classroom/plan/` → 학기계획(`/plan/semester`)·차시계획(`/plan/session`) 2단계. 학기계획 미완 시 차시계획 진입 차단(AC-1.1).
- **S1.4 UI**: 학기계획 에디터(단원 트리+핵심개념 해시태그+최소차시, 수정/삭제), 시험별 목표진도 범위 토글, 차시계획(6자리/토글 자동채움), 상단 일괄저장.
- **S1.5 검증 모달**: 최소차시 초과 저장 시 "학기 계획을 변경하시겠습니까?" 확인 → 네=최소차시 갱신, 취소=저장취소(AC-1.8).
- **S1.6 페이지네이션**: 차시 리스트 10개(AC-1.10). 테스트: `lesson-plan.integration.test.ts` 확장.

### Phase 2 — 진척도 (#2, Phase 1 의존)
- **S2.1 진도율 도메인**: `lib/domain/progress.ts`(신규) 순수함수 — 목표진도율=계획상 오늘까지 차시÷시험목표 총차시, 실제=실제진행÷총차시, 차시 기준(AC-2.4). 빨강=2차시 이상 뒤짐(AC-2.5).
- **S2.2 쿼리/UI**: `lib/db/queries/progress.ts` + `app/classroom/progress/progress-board.tsx` — 좌계획/우실제(복사+수정), 저장 후 통계 활성화, 분반별 통계, 초록/빨강.
- **S2.3 페이지네이션**: 20개(AC-2.7). 테스트: `progress.integration.test.ts` + 진도율 단위 테스트.

### Phase 3 — 출결 관리 (#4) ★ 회귀 위험 (Architect BLOCKER #1/#2)
- **S3.1 판정 규칙 반전**: `lib/domain/attendance-rules.ts` — `isReportRequired`를 `(reason==='illness' && kind==='absent') || note.includes('생리통')`로 변경. `ALWAYS_REQUIRED_KINDS`/`REPORT_REQUIRED_REASONS`에서 absent/accepted 제거(AC-4.1). ⚠️ 이는 **이전에 통과하던** `attendance-rules.test.ts:5-21` 단언을 뒤집음(absent+etc/unaccepted, accepted late/early → `false`). 단위 테스트를 새 규칙으로 재작성.
- **S3.1b 데이터 백필 (BLOCKER, 승인 게이트)**: `report_required`는 **영속 파생 컬럼**(`lib/db/schema/attendance.ts:34`)이고 `report_tracking`+`pg_cron`이 이를 소비하므로, 규칙 변경만으로는 과거 데이터가 틀어진다. 마이그레이션 단계로 **전 `attendance_records.report_required`를 AC-4.1로 재계산**하고 더 이상 불필요한 `report_tracking` 행(absent+unaccepted/etc, accepted late/early)을 정리. 생존 행의 `report_tracking.deadline_date`(`attendance.ts:79`, 파생값)도 재계산(Critic m5). **pre/post 카운트 스냅샷 회귀 테스트** 추가. **롤백**: 재계산은 `attendance-rules`에서 결정적이므로 재실행으로 복원 가능. prod 적용은 P5 승인 게이트.
- **S3.2 기간 스키마/쿼리**: `attendance_ranges` 마이그레이션 — 교외체험학습 `start_date/end_date`(기존 단일 `tripDate`를 **추가/NULL-safe** 방식으로 보존 백필: tripDate→start_date, end_date null=당일). 결석 기간 입력. `lib/db/queries/attendance.ts` — 기간 입력 시 `schoolDayCalendar` 조인으로 수업일만 자동 인정결석/결석 생성(AC-4.2~4.4).
- **S3.2b `trip_date` 의존성 영향 처리 (BLOCKER, Critic M3 정정)**: `trip_date`를 소비하는 out-of-band/쿼리들을 **같은 PR에서** 갱신. 정적 라인 목록 의존 대신 **`grep tripDate lib/db/queries/`로 전수 스윕**하되, 확인된 대상: `0005_pg_cron_escalation.sql:36,48,51`(create or replace로 start/end 기준 재정의), `lib/db/queries/escalation.ts:46,60,121,134,180,197,206,212`(SELECT 투영·escalation base·정렬 전부), `escalation.integration.test.ts:75`. ※ `nudge.ts:49-53`은 `postReportSubmitted` 조인일 뿐 trip_date 미참조 — 제외. **범위 신고서 마감 기준일 = `end_date`** 로 결정(사후보고서는 체험 종료 후 제출).
- **S3.2c 컬럼 전이 불변식 (Critic m4)**: `fieldTripReports.trip_date`는 `.notNull()`(`attendance.ts:59`). rename 금지 — `start_date/end_date` 추가 후, cron/escalation이 end_date로 전환 완료될 때까지 `trip_date`를 `start_date` 미러로 **NOT NULL 유지**(out-of-band 함수가 물리 컬럼 참조하므로 stale 방지). 전환 후 별도 마이그레이션으로 정리.
- **S3.3 수정 기능**: 출결 기록 update 액션 추가(현재 삭제만)(AC-4.5).
- **S3.4 신고서 묶기 + 페이지네이션**: 사후보고서를 다른 신고서와 동일 묶음, 4탭 하단 중복 제거(AC-4.6). 월별/학생별/미제출/체험학습 목록 10개(AC-4.7).
- **S3.5 테스트**: `attendance.integration.test.ts` + `escalation.integration.test.ts` 갱신(판정 반전 회귀 + 백필 스냅샷).

### Phase 4 — 공지실 (#5)
- **S4.1 대상 스키마**: `0032_teacher_note_target.sql` — `teacher_notes`에 `target_scope`(전체/개별) + 대상 학생 매핑(다수). `lib/db/queries/notice.ts` 확장.
- **S4.2 순서변경 UI**: 기존 `updateTeacherNoteOrder`를 UI에 연결(AC-5.1).
- **S4.3 시간표 동기화 통합**: `HomeroomTimetableSync`를 `app/setting/courses/timetable-sync.tsx` 하위로 이동/병합(AC-5.4).
- **S4.4 할일·공지**: `notice_events`에 `content` 필드 추가, 수정 가능화. 페이지네이션 10개(AC-5.5).

### Phase 5 — 학생 안내 페이지 (#6, get_public_page v4)
- **S5.1 SQL 함수 v4**: `get_public_page_v4` (마이그레이션 레인 **마지막** 번호) — 상담 예약 캘린더 반영(AC-6.1), 급식 menu/calInfo/ntrInfo **분리 노출**(v3는 calInfo를 menu 문자열에 합쳐버림 → 표 위해 분리 필요)(AC-6.6), 개별공지(전체+대상학생 병렬, Phase 4 의존).
- **S5.2 DTO (parser triple 동기 개정, Architect #4)**: `lib/public/dto.ts` — `PublicMeal`에 calInfo/ntrInfo 추가하고, **`parseMeal`·`buildPublicPagePayload`·`parsePublicPagePayload`(allowlist 파서) 3곳을 lockstep 개정** + `dto.test.ts` allowlist 테스트 갱신(누락 시 데이터가 조용히 페이지에 미도달). 개별공지 필드, 상담 취소요청 상태도 동일 3곳 반영.
- **S5.3 NEIS 영양 수집**: `lib/integrations/neis.ts` `parseMealService`에 `NTR_INFO` 파싱 + `meal_cache` 컬럼(`0034_meal_nutrition.sql`) + `lib/db/queries/calendar.ts` upsert 확장.
- **S5.4 UI**: `app/p/[token]/public-page-view.tsx` — 오늘=KST 날짜 경계(AC-6.2), 시간표 오늘강조+선택과목 상시 수정(AC-6.3/6.4), 급식 표(AC-6.6).
- **S5.5 상담 취소**: `lib/public/student-write.ts` 취소요청 액션 + 교사측 승인(정원 복구+캘린더 제거)(AC-6.7).

### Phase 6 — 오늘의 학교 (#7, Phase 1/3/4 의존)
- **S6.1 넛지 도메인 (Architect #5 + Critic M1 — shape 변경)**: `lib/domain/nudge.ts` — 교과관찰=오늘 분반 수업당 1개(가중랜덤 1명 확정), 기록 시 해결(AC-7.2/7.4). ⚠️ 현재 `NudgeResult.unrecordedObservation`은 **단일 객체**(`nudge.ts:73-76`)이나 분반당 1개는 **리스트**로 shape 변경 필요: `unrecordedObservations: { sectionKey; suggestedStudentId; candidateCount }[]`. **소비자 전부 갱신**: `app/page.tsx:24-31`(데스크톱 배너) **및 `app/today/page.tsx:69,89-92`**(`/today`, 모바일 랜딩 — Phase 6가 재작성하는 바로 그 페이지) + `app/page.tsx:10-15` `EMPTY_NUDGES` 새 shape. 두 페이지 모두 리스트 순회로 변경. 행동특성 종일(16시 게이트 제거, `nudge.ts:115-118`)(AC-7.5). 단위 테스트.
- **S6.2 모달**: `app/today/` — 진입마다 모달, 닫으면 세션 동안 미표시(클라 sessionStorage)(AC-7.1).
- **S6.3 사전선택 딥링크**: 교과관찰/행동특성 "기록" → 대상 화면에 학생·분반 사전선택 진입(AC-7.3/7.5). 미제출 "확인하기" → 출결 미제출 탭 리다이렉트(AC-7.6).
- **S6.4 위젯**: 시간표 색상+시간(AC-7.7), 급식 표(AC-7.8), 학사일정 캘린더+전체 상담(AC-7.9), 공지위젯(한마디 스와이프 다중페이지/할일·공지 수정+내용)(AC-7.10).
  - **AC-7.9 신규 쿼리(Critic 보강)**: "담임 학생 전체의 예정 상담 집계"는 기존 per-student/per-slot 쿼리에 없음 → `lib/db/queries/counsel.ts`(또는 `counseling.ts`)에 **담임 로스터 전체의 다가오는 예약 상담 집계 쿼리 신규** 추가, 학사일정 캘린더에 병합 표시.
- **S6.5 모달 범위 명확화 (Critic AC-7.1)**: 넛지 **모달은 `/today`에만**. 데스크톱 루트 `app/page.tsx`(`/`)는 기존 `NudgeBanner` 유지(모달 아님). 모바일은 `/`→`/today` 리다이렉트(AC-9.2)되어 모달을 봄.

### Phase 7 — 담임교실 허브화 (#3, 독립)
- **S7.1**: `app/homeroom/layout.tsx` 신규(탭바, `app/classroom/layout.tsx` 패턴 차용). `app/homeroom/page.tsx`는 묶음만(AC-3.1/3.2). 하위 페이지 `← 홈` 제거.

> 순서 주의: Phase 7은 독립이나 Phase 3/4(homeroom 하위 페이지) 완료 후 레이아웃 통합이 충돌 적음.

---

## Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| 출결 판정 반전으로 기존 미제출 집계 회귀 | `attendance-rules`·`escalation` 단위/통합 테스트 우선 갱신, 변경 전후 스냅샷 비교 |
| `get_public_page` v4 개정이 공개페이지 깨짐 | 함수 단일 호출 계약 유지, DTO 파서(`parsePublicPagePayload`) 동시 개정 + 통합 테스트 |
| 교외체험학습 단일 tripDate→기간 마이그레이션 데이터 손실 | 기존 tripDate→start_date 보존 백필, end_date null=당일 |
| 자동 인정결석 생성이 수동 입력과 중복 | upsert unique 제약(`0006_attendance_unique` 패턴) 재사용, schoolDayCalendar 필터 |
| 세부단원 신규 모델이 기존 차시 그리드와 불일치 | 차시-단원 연결을 nullable로 시작, 기존 차시 보존 + 점진 연결 |
| prod 마이그레이션 사고 | 로컬 검증 후 사용자 승인 게이트(스펙 Non-Goal) |

## Pre-mortem (3 실패 시나리오)
1. **출결 판정 반전이 조용히 과거 데이터 재집계** → 미제출 알림이 갑자기 사라짐. 방지: `report_required`가 영속 파생 컬럼이므로 **명시적 승인 게이트 백필(S3.1b)** 로 일괄 재계산 + 고아 `report_tracking` 정리, pre/post 카운트 스냅샷 회귀 테스트로 고정(코드 edit의 부수효과가 아닌 별도 단계).
2. **get_public_page v4 + DTO 비동기 배포** → 학생 페이지 500. 방지: SQL 함수와 DTO를 한 마이그레이션 단위/한 PR로 묶고 통합 테스트 게이트.
3. **넛지 모달이 매 렌더 재팝업/무한** → 사용성 저하. 방지: sessionStorage 1회 dismiss 플래그 + 당일 수업 기준 생성, e2e로 진입/닫기/재진입 검증.

## Expanded Test Plan
- **Unit**: `attendance-rules`(판정 반전 전 케이스), `progress`(진도율/2차시 임계), `nudge`(분반당 1개/가중선택/16시 제거), 6자리코드 파서, UA 판별.
- **Integration**: `lesson-plan`, `progress`, `attendance`(기간 자동생성+수정), `notice`(대상), `counsel`(취소 승인), `calendar`(NTR_INFO upsert). 기존 `RUN_DB_ITEST=1` 스위트에 추가.
- **E2E**: 수업계획 2단계 흐름, 진척도 저장→통계, 넛지 모달 진입/닫기/사전선택 딥링크, 학생페이지 급식표/상담취소, 모바일 루트 리다이렉트.
- **Observability**: 마이그레이션 적용 로그, get_public_page 에러율, 자동 인정결석 생성 건수 카운트.

## Verification Steps
1. `npm run build` 통과.
2. `RUN_DB_ITEST=1` 통합 테스트 스위트(프로젝트 test 명령) 전부 통과.
3. 각 Phase AC 체크리스트 대조(verifier).
4. 로컬에서 9개 컴포넌트 수기 스모크 + 모바일 UA 리다이렉트 확인.
5. prod 마이그레이션은 사용자 승인 후 별도 적용.

## ADR

- **Decision**: QC v4를 9개 컴포넌트로 구현하되, **Option A(수직 슬라이스 + 의존성 단계화)** 를 채택하고 스키마 변경만 **직렬 마이그레이션 레인(번호=머지 시점, 의존성 DAG)** 으로 분리한다(Architect synthesis).
- **Drivers**: (1) 신규 스키마 안전성, (2) 출결 판정 반전·`get_public_page` v4 회귀 위험, (3) 9개 컴포넌트 병렬 실행 효율.
- **Alternatives considered**:
  - Option B(레이어 우선): 마이그레이션 단일 검토 장점이 있으나 중간 비동작 + 거대 PR로 검증 비용 과다 → 기각.
  - 정적 마이그레이션 번호(0030-0034): 병렬 Phase에서 `_journal.json` 충돌 + v4 의존 역전(0033<0034) → 기각, 번호-머지시점 방식으로 대체.
- **Why chosen**: 컴포넌트 격리(리뷰/롤백 용이)는 UI/쿼리/테스트에 유효하고, 교차 위험이 집중된 스키마·공유 SQL 계약(`get_public_page`, 마이그레이션 저널)만 직렬 레인으로 묶어 B의 단일 검토 장점을 흡수.
- **Consequences**: 머지 시점 마이그레이션 번호 조율 규율 필요(`drizzle-kit generate` 직렬화). 출결 백필은 승인 게이트 단계로 명시. 공개페이지 변경은 SQL함수+DTO parser triple 한 PR 묶음.
- **Follow-ups**: prod 마이그레이션 사용자 승인 게이트(P5). Phase 7 레이아웃 통합은 Phase 3/4 homeroom 하위 완료 후. NEIS NTR_INFO 재동기화 필요(기존 meal_cache 백필).

## Changelog (consensus 반영)
- Architect 리뷰 반영(SOUND-WITH-CHANGES, 블로커 3 + 필수 2 + 마이너 1):
  - [BLOCKER#1] Phase 3에 승인 게이트 `report_required` 백필 + 고아 `report_tracking` 정리 + pre/post 스냅샷 회귀(S3.1b) 추가.
  - [BLOCKER#2] `trip_date` 의존성 영향 목록(`0005` cron, `escalation.ts`, `nudge.ts`, itest) + 범위 마감 기준일=`end_date` 결정(S3.2b) 추가.
  - [BLOCKER#3] 정적 마이그레이션 번호 → 번호-머지시점 + 의존성 DAG, `get_public_page_v4` 최후 순번(마이그레이션 레인) 추가.
  - [REQUIRED#4] meal DTO parser triple(`parseMeal`/`build`/`parse` allowlist) + `dto.test.ts` 명시(S5.2).
  - [REQUIRED#5] `NudgeResult.unrecordedObservation` 객체→리스트 shape 변경 + `app/page.tsx` 소비자 갱신(S6.1).
  - [MINOR#6] S0.2 기존 `middleware.ts` 편집(생성 아님) + auth 매처 보존.
- Critic 리뷰 반영(APPROVED-WITH-NITS, 필수 6건):
  - [M1] 넛지 shape 변경 소비자에 `app/today/page.tsx:69,89-92` + `EMPTY_NUDGES` 추가, 새 리스트 shape 명시(S6.1).
  - [M2] 페이지네이션 16개 대상 전수 체크리스트(S0.1b) — 누락 8개(교과관찰/세특/자율진로/상담기록/행동특성/상담슬롯/학사일정/학생명단) 보강.
  - [M3] `trip_date` 의존성 정정 — `nudge.ts` 오인용 제거, `escalation.ts` 전체 라인(46/60/121/134/180/197/206/212) + grep 스윕(S3.2b).
  - [AC-7.9] 담임 전체 상담 집계 쿼리 신규(`counsel.ts`)(S6.4).
  - [AC-1.6] 미존재 6자리코드 오류 처리(S1.2).
  - [nits] trip_date 미러 불변식(S3.2c), deadline_date 재계산+롤백(S3.1b), 모달 `/today` 한정(S6.5).
- **합의 도달**: Architect SOUND-WITH-CHANGES → 반영, Critic APPROVED-WITH-NITS → 6건 반영 완료.
