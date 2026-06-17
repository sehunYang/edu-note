# Deep Interview Spec: QC v6 (6차 QC 재수정 + 메인페이지 리디자인)

## Metadata
- Interview ID: qc-v6-2026-06-17
- Rounds: 8
- Final Ambiguity Score: ~5%
- Type: brownfield
- Generated: 2026-06-17
- Threshold: 0.05 (5%)
- Threshold Source: user request (explicit "목표 모호도 5%")
- Initial Context Summarized: no (report/qc-report-v6.md 직접 사용)
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.96 | 0.35 | 0.336 |
| Constraint Clarity | 0.94 | 0.25 | 0.235 |
| Success Criteria | 0.93 | 0.25 | 0.233 |
| Context Clarity | 0.95 | 0.15 | 0.143 |
| **Total Clarity** | | | **0.946** |
| **Ambiguity** | | | **~5%** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| ① 수업 계획실 | active | 시험 구간 단위 재설계 | AC-1.x 전부 커버 |
| ② 진척도 | active | 연체 예정 차시 페이지네이션 | AC-2.1 |
| ③ 출결 관리 | active | 교외체험학습 출결 자동생성 + 사유 검색 | AC-3.x |
| ④ 공지실 | active | 개별공지 학생페이지 캐러셀 분리 | AC-4.1 |
| ⑤ 학생 안내 페이지 | active | 영양 버그 + 열교체 + 캘린더 모달 메모 | AC-5.x |
| ⑥ 오늘의 학교 | active | 이모지·모바일·상시배너·행동특성 가중랜덤 | AC-6.x |
| ⑦ 메인 페이지 | active | 대표 8개 재배치 + 이모지 | AC-7.x |
| ⑧ 교무실/통계실/인쇄실 | **deferred** | 기능 업그레이드 | 사용자 확정 보류 (2026-06-17). 보고서 "향후 계획" 명시. 이번 범위 제외 |

## Goal
Edu_Note(교사용 Next.js 앱)의 6차 QC로, 5차 QC 재수정 6개 영역의 **남은 결함·구조 재설계**를 완료하고 **메인 홈을 대표 8개 컴포넌트 중심으로 재정리**한다. 핵심 구조 변경은 ① 수업 계획의 단위를 "시험 구간(1회시험 전 / 2회시험 전)"으로 전환하는 것.

## Constraints
- 모든 변경은 기존 brownfield 코드 패턴·DB 스키마를 따른다. 급식 영양은 별도 컬럼 없이 `meal_cache.payload(jsonb)` 유지(0035 결정).
- 학생 안내 페이지(`/p/[token]`)는 로그인 없는 공개 토큰 페이지. 새 개인 메모는 토큰 스코프로만 노출.
- 모바일 리다이렉트는 미들웨어 기반 유지하되 "세션당 1회"로 제한.
- 교무실/통계실/인쇄실(⑧)은 이번 범위에서 제외.

## Non-Goals
- ⑧ 교무실/통계실/인쇄실 기능 업그레이드 (향후 계획)
- 급식 영양 저장 구조를 별도 컬럼으로 변경 (payload 유지)
- 교사 공지실(NotesManager) 개별공지 관리 UI 변경 (④는 학생페이지 렌더만)
- 학생 페이지 개인 메모를 교사/타학생에게 노출 (절대 비공개)

## Acceptance Criteria

### ① 수업 계획실
- [ ] AC-1.1 학기계획이 **시험 구간(중간 전 / 기말 전)** 단위로 "진행할 차시 수 + 여유 차시 수"를 입력·소유한다. (현재 차시계획에 있던 여유차시 입력·대표분반차시 표시를 학기계획으로 이동)
- [ ] AC-1.2 **세부단원 최소차시(`minOrdinals`) 합**이 차시계획의 **총 차시 수를 결정/표시**한다 (그리드 자동생성은 아님, 숫자·구분 표시).
- [ ] AC-1.3 **"시험까지 남은 차시" 카운터**를 표시한다 — (a) 오늘 날짜 기준 다음 시험까지 **남은 수업일 수**, (b) 진도 기준 **남은 차시 수(여유 포함)** — **둘 다** 표시. 1회시험 경과 시 자동으로 2회시험 기준으로 전환, 이전 구간 여유차시는 카운트에서 제외(구간별 리셋).
- [ ] AC-1.4 **시험별 목표 진도** 저장 시 토글로 저장된 범위가 **상시 표시**되어 저장 상태를 시각적으로 인지 가능.
- [ ] AC-1.5 (기본값) 차시계획의 셀별 여유 토글(`toggleSlackCellAction`)은 "실제 실행상 여유 처리" 마커로 존치. (여유 **계획** 입력은 학기계획으로 이동)

### ② 진척도
- [ ] AC-2.1 "연체 예정 차시"(`progress-board.tsx` popup 섹션)를 다른 컴포넌트(`SectionBlock`)처럼 **페이지네이션** 처리(동일 `Paginator` 패턴).

### ③ 출결 관리
- [ ] AC-3.1 교외체험학습 등록 시 해당 기간의 **출결 레코드를 자동 생성**하며 사유=인정결석 계열, **비고(noteField)='체험학습'** 으로 기입 → 월별/학생별 조회·정리에 함께 노출.
- [ ] AC-3.2 월별/학생별 검색에 **사유 기준 필터**를 추가(이름·월뿐 아니라 사유로도 검색 가능).

### ④ 공지실
- [ ] AC-4.1 학생 안내 페이지(`public-page-view.tsx`)의 **개별 공지**를 전체 공지처럼 **캐러셀(‹ N/M ›)로 한 건씩 분리** 렌더(현재 평면 `<ul>` 병합 → 캐러셀). 교사 공지실 관리 UI는 변경 없음.

### ⑤ 학생 안내 페이지
- [ ] AC-5.1 **영양 미표시 근본원인 규명·문서화**: 코드 체인(NEIS 파싱 → payload 저장 → `get_public_page` v4+ 추출 → DTO → 렌더)은 전 구간 정상·테스트 통과 확인됨. 유력 원인은 (a) prod `meal_cache.payload`가 ntrInfo 수집(0035) 이전 **stale 캐시**거나 (b) prod `get_public_page` 함수 버전이 v4(0036) 미만. 실행 시 prod 함수 버전 확인 + 급식 재동기화로 영양 표시 복구.
- [ ] AC-5.2 급식 표 **열 위치 교체**: 칼로리를 **마지막 열**, 영양을 **중앙 열**로 (메뉴 / 영양 / 칼로리).
- [ ] AC-5.3 학생 캘린더 **터치 시 모달**(교사 `DayDetailModal` 동급) 추가. 모달에서 개인 메모/일정 **조회 + 추가 + 수정 + 삭제(전체 CRUD)** 가능.
- [ ] AC-5.4 개인 메모/일정은 **토큰 스코프 서버 저장(신규 테이블, (studentYearId, date) 키)**. 해당 토큰 학생만 조회·CRUD, 교사·타학생에게 **절대 비노출**.

### ⑥ 오늘의 학교
- [ ] AC-6.1 메인 홈의 "오늘의 학교" 카드에 대표 이모지 부여(⑦과 연동: 🗓️).
- [ ] AC-6.2 모바일 `/` → `/today` 리다이렉트를 **세션당 1회 쿠키 플래그**로 제한 (`middleware.ts`). 첫 진입만 `/today`, 이후 메인 접근 허용.
- [ ] AC-6.3 `/today` **페이지 최상단에 "오늘 해야 할 일" 상시 배너** 추가 (홈의 `NudgeBanner` 패턴을 `/today`에도; 기존 모달은 유지).
- [ ] AC-6.4 **행동특성**도 관찰기록처럼 **담임반 학생 1명을 가중 랜덤**으로 콕 집어 기입 유도. 가중 기준 = **행동특성 기록 수**(관찰기록과 별도 카운트, `max-count + 1` 공식으로 기록 적은 학생 우선).
- [ ] AC-6.5 기존 넛지(모달·배너)에 **행동특성 항목 추가**. "기록" 버튼 → `/homeroom/behavior?studentYearId=...` 딥링크로 이동하며 **해당 학생이 사전선택(토글)** 되어 있음.

### ⑦ 메인 페이지
- [ ] AC-7.1 메인 홈에 **대표 8개만** 지정 순서로 배치: 세팅실 → 오늘의 학교 → 교실 → 담임 교실 → 교무실 → 동아리실 → 통계실 → 인쇄실. 그 외 6개 카드(학생명단·시간표/수업·시수관리·학사일정/급식·활동기입·교과관찰기록)는 메인에서 **제거**(각 상위 룸 하위로 접근).
- [ ] AC-7.2 이모지 없는 4개에 부여: **🗓️ 오늘의 학교 · 🗂️ 교무실 · 📊 통계실 · 🖨️ 인쇄실** (기존 ⚙️세팅실 🏫교실 🏠담임교실 🎬동아리실 유지).

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 수업계획은 전체 차시 기준 | 시험 둘 다 보는 과목은 "시험까지 남은 차시"가 핵심 | **시험 구간 단위**로 재설계 |
| "세부단원 차시합 반영" = 그리드 자동생성 | 자동생성/총수결정/동기화 중? | **총 차시 수 결정·표시** |
| 모바일 메인 접근이 코드로 차단됨 (Contrarian) | 코드에 차단 로직 없음 — 실제는? | `middleware.ts`가 **매 `/` 요청마다 리다이렉트**. 세션당 1회 쿠키로 제한 |
| 영양 미표시 = JSON 파싱 버그 | 전 코드 체인 정상·테스트 통과 | **stale 캐시 / 함수 버전 미스매치** (데이터 문제, 파싱 아님) |
| 학생 개인메모 저장 모델 (Simplifier) | 공개 토큰 페이지에서 비공개 보장? | **토큰 스코프 서버 저장**, 토큰=신원이라 자동 비공개 |
| 행동특성 가중 = 관찰+행특 합산? | 별도 vs 합산 | **행동특성 기록 수 별도 카운트** |
| 개별공지 분리 대상 화면 | 학생페이지 vs 교사 관리 | **학생페이지 캐러셀만** |

## Technical Context (brownfield 코드 매핑)
- ① `app/classroom/plan/{semester,session}/*.tsx`, `app/classroom/plan/actions.ts`, `lib/db/queries/lesson-plan.ts`, `lib/domain/{lesson-plan,lesson-unit}.ts` (`pickRepresentativeSection`, `computePlanLength`, `validateMinOrdinals`, `minOrdinals`, `examTargets`).
- ② `app/classroom/progress/progress-board.tsx` (popup 섹션 vs `SectionBlock`+`Paginator`, `SECTION_PAGE_SIZE=20`), `listProgressPopup`.
- ③ `app/homeroom/attendance/{field-trip-client,attendance-tables-client,page}.tsx`, `addFieldTripAction`, `listAttendanceByMonth`, `searchAttendanceByStudent`, `reason`/`noteField`.
- ④ `app/p/[token]/public-page-view.tsx` (`Notices` 캐러셀 vs `IndividualNotices` 평면), `payload.individualNotices`.
- ⑤ `app/p/[token]/public-page-view.tsx`(`Meals`), `lib/public/dto.ts`(`PublicMeal`), `lib/db/queries/calendar.ts:127-134`(payload upsert), `lib/integrations/neis.ts:122-135`(NTR_INFO 매핑), `get_public_page` v4/v5(0036/0040), 교사 `app/today/events-calendar.tsx`(`DayDetailModal`, `listTodayMemosInRange`).
- ⑥ `middleware.ts:17-25`, `lib/device.isMobileUserAgent`, `app/nudge-banner.tsx`, `app/today/nudge-modal.tsx`, `lib/domain/nudge.ts`(`weightedPickLeastRecorded`, `selectionWeights`), `lib/db/queries/nudge.ts`(`collectTodaySectionObservations`), `app/homeroom/behavior/behavior-client.tsx`.
- ⑦ `app/page.tsx`(`DashCard` 14개 그리드 → 8개로).

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| ExamSegment(시험구간) | core domain | ordinal(1/2), examDate, plannedPeriods, slackPeriods | belongs to SubjectSemester; drives 잔여차시 카운트 |
| LessonUnit(세부단원) | core domain | minOrdinals, code, content | sum → 차시계획 총차시 |
| SlackPeriod(여유차시) | supporting | count(per segment), cellToggle | scoped to ExamSegment |
| RepSectionLength(대표분반차시) | supporting | length(주당슬롯 최대분반) | 학기계획으로 이동 |
| FieldTrip(교외체험학습) | core domain | studentYearId, start/end, tier, noteField='체험학습' | → AttendanceRecord 자동생성 |
| AttendanceRecord | core domain | reason, noteField, date | searchable by reason |
| IndividualNote(개별공지) | core domain | targetStudentYearIds, body | 학생페이지 캐러셀 렌더 |
| MealNutrition(급식영양) | supporting | menu, calInfo, ntrInfo | payload(jsonb) 내 저장 |
| StudentCalendarMemo(개인메모) | core domain | studentYearId, date, body | 토큰스코프, 신규 테이블, CRUD |
| BehaviorRecord(행동특성) | core domain | studentYearId, body, count | 가중랜덤 대상(기록 적은 학생 우선) |
| DashCard(대표컴포넌트) | supporting | href, title, emoji, order | 메인 8개 |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 8 | 8 | - | - | N/A |
| 2-3 | 9 | +1 (총차시 개념) | 0 | 8 | ~89% |
| 4-5 | 10 | +1 (BehaviorRecord 가중) | 0 | 9 | ~90% |
| 6-8 | 11 | +1 (StudentCalendarMemo) | 0 | 10 | ~91% (수렴) |

## Interview Transcript
<details>
<summary>Full Q&A (8 rounds)</summary>

### Round 0 (Topology)
**Q:** 8개 최상위 컴포넌트(①~⑦ active + ⑧ defer)가 맞는가?
**A:** 맞음, ⑧ 보류.

### Round 1 — ① Goal
**Q:** 수업계획 새 핵심 단위가 시험 구간(1회 전/2회 전)인가?
**A:** 맞음: 시험 구간 단위.

### Round 2 — ① Constraint
**Q:** 세부단원 차시합 "반영"의 구체 동작?
**A:** 총 차시 수 결정/표시.

### Round 3 — ① Criteria
**Q:** "시험까지 남은 차시" 계산·표시?
**A:** 둘 다 표시(날짜 기준 + 진도 기준), 구간별 리셋.

### Round 4 — ⑥ Context (Contrarian)
**Q:** 모바일 "메인 차단" 실제 현상? (코드에 차단 없음)
**A(보강):** 첫 진입만 /today면 되는데 매번 /로 나갈 때마다 /today로 리다이렉트됨. → 원인: `middleware.ts` 매 요청 리다이렉트. 해결: 세션당 1회 쿠키 플래그.

### Round 5 — ⑥ Goal/Criteria
**Q:** 행동특성 가중 기준 + 넛지/딥링크?
**A:** 행동특성 기록 수 기준 / 기존 넛지에 행특 항목 추가(+딥링크 사전선택).

### Round 6 — ⑤ Constraint (Simplifier)
**Q:** 학생 캘린더 개인메모 저장 모델?
**A:** 토큰스코프 서버 저장(신규 테이블). (추가: 모달 조회+수정 CRUD 필수)

### Round 7 — ③/④
**Q:** ③ 교외체험 비고 자동기입 동작 / ④ 개별공지 분리 화면?
**A:** ③ 출결 레코드 자동생성(비고=체험학습) / ④ 학생페이지 캐러셀(전체공지처럼).

### Round 8 — ⑦ Criteria
**Q:** 메인 대표 컴포넌트 이모지?
**A:** 제안 그대로 (🗓️오늘의학교 🗂️교무실 📊통계실 🖨️인쇄실).

</details>
