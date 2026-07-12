# Deep Interview Spec: 통계실 인사이트화 · 인쇄실 학생별 점검·피드백화

## Metadata
- Interview ID: di-2026-07-12-stats-print
- Rounds: 11 (토폴로지 확인 1 + 질문 10)
- Final Ambiguity Score: 4.7%
- Type: brownfield
- Generated: 2026-07-12 (KST)
- Threshold: 0.05
- Threshold Source: user request ("모호도 5% 미만까지 진행" — settings 미설정, 기본 0.2를 사용자 지시가 재정의)
- Initial Context Summarized: no
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.96 | 0.35 | 0.336 |
| Constraint Clarity | 0.96 | 0.25 | 0.240 |
| Success Criteria | 0.95 | 0.25 | 0.238 |
| Context Clarity | 0.93 | 0.15 | 0.140 |
| **Total Clarity** | | | **0.953** |
| **Ambiguity** | | | **0.047 (4.7%)** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| stats-insights | active | 통계실을 카운트 나열에서 4섹션 인사이트 대시보드로 재구축 | R1(4영역), R3(성적 4지표), R4(경보 층위), R7(화면 구성), R9(임계값) |
| print-student-feedback | active | 인쇄실을 학생별 점검 화면+배부용 인쇄물 공간으로 재구축 | R2(독자=둘 다), R5(인쇄물 내용), R8(5단계 구조) |

## Goal
(1) **통계실**(`/stats`): 현재 단순 카운트 카드 8개를 4섹션 인사이트 대시보드 — ①이상징후 경보(기간 패턴 기반) ②성적 분석(분반 단위, recharts) ③기록 커버리지(학생×유형 매트릭스) ④업무 진척률 — 로 재구축해 교사가 "누구를 먼저 챙기고, 어디가 비었고, 성적이 어디로 가는지"를 행동 가능하게 파악한다.
(2) **인쇄실**(`/print`): 현재 명단 인쇄 페이지를 네비 등록된 정식 공간으로 승격하고, 담임반/분반 선택 → 학생 목록(기존 4플래그 배지) → 학생별 상세 점검(성적·출결·기록 종합) → 배부용 인쇄물(지필+추이·수행·출결만) 흐름으로 재구축한다. 기존 명단 인쇄는 유지.

## Constraints
- **성적 분석 단위**: 내 수업 분반(section) — 시스템에 교사 본인 과목 성적만 존재(담임 반 타과목 성적 없음). (R3 전제 확정)
- **경보 층위 분리**: 홈 '오늘의 할 일 알림'(당장 처리)과 중복 금지 — 통계실 경보는 기간 패턴 분석(추세) 전용. (R4 콘트래리언)
- **경보 임계값(코드 상수, 설정 UI 없음)**: ①출결 증가 = 최근 30일 출결(지각+조퇴+결석+결과) ≥3건 AND 직전 30일보다 증가 ②성적 급락 = 동일 과목 중간→기말 환산점수 15점 이상 하락 ③기록 공백 = 최근 21일 관찰·행특 모두 0건(담임반 학생=행특 포함, 수업 학생=관찰만). (R9)
- **recharts 신규 도입 승인**(R6 — 심플리파이어에서 사용자가 명시 선택): 다크 remap 팔레트 톤 적용, 배부용 인쇄물 차트는 인쇄 CSS(흑백, globals.css @media print)에서 판독 가능해야 하며 불가하면 인쇄물에서는 표로 대체.
- **배부용 인쇄물 내용 경계**: 지필 성적+추이(분반 평균 대비 위치 포함)·수행평가 현황(항목별 점수/만점·미입력)·출결 요약(사유 카테고리만, 교사 메모 제외). 관찰·행특·상담·교사 자유 코멘트 **제외**. (R5)
- **재사용 원칙**: `lib/domain/student-report.ts` 4플래그·`getStudentReport`·`getGradeView`·`getOwnerStats` 재사용/확장하되 기존 테스트 불변. 신규 집계(경보·분포·커버리지·진척)는 순수 함수로 분리해 단위 테스트 작성. (R10)
- **불변**: DB 스키마/마이그레이션 0(기존 데이터로만 집계). 보안 표면(공개 페이지·미들웨어·RLS) 불변. 기존 명단 인쇄 동작 유지. (R10)

## Non-Goals
- 경보 임계값 설정 UI (필요해지면 후속)
- 담임 반 타과목 성적 분석 (데이터 없음)
- 교사 자유 서술 코멘트 입력 기능 (R5에서 미선택)
- 배부용 인쇄물에 관찰/행특/상담 기록 포함
- 홈 '오늘의 할 일 알림' 개편·통합
- DB 스키마 변경·신규 수집 데이터

## 통계실 화면 구성 (R7 확정)
1. **이상징후 경보** (최상단): 3종 기준 해당 학생 리스트(학생명·발동 사유·근거 수치). 해당 없으면 "특이사항 없음" 빈 상태.
2. **성적 분석**: 분반 선택 → (a) 점수 히스토그램 + 평균/표준편차/중앙값 (b) 중간→기말 추이(급등/급락 학생 하이라이트) (c) 같은 과목 분반 간 비교 (d) 수행평가 항목별 입력률/평균. recharts 사용.
3. **기록 커버리지**: 학생×기록유형(관찰·행특·세특초안·창체) 매트릭스, 기록 부족 학생 상위 정렬.
4. **업무 진척**: 분반별 진도율, 세특 초안 완성률(작성/확정), 신고서 처리율.

## 인쇄실 구조 (R8 확정)
1. 네비 등록: 사이드바/더보기에 '인쇄실' 추가 (현재는 통계실 링크로만 진입).
2. 범위 선택: 담임 반 또는 내 수업 분반 → 해당 학생 목록.
3. 학생 목록: 각 행에 기존 4플래그 배지(지필 추이↑↓·관찰 부족·수행 미입력·구간 석차) — `lib/domain/student-report.ts` 재사용.
4. 학생 선택 → 상세 점검 화면(성적·출결·기록 현황 종합 — 교사용, 화면 전용).
5. '배부용 인쇄' → 인쇄 전용 레이아웃(지필+추이·수행·출결만)으로 `window.print()`. 기존 명단 인쇄 유지.

## Acceptance Criteria
- [ ] AC-S1 통계실에 4섹션(경보→성적→커버리지→진척)이 순서대로 렌더되고, 각 섹션은 데이터 없을 때 명시적 빈 상태 문구를 보여준다.
- [ ] AC-S2 경보 3종이 확정 임계값 상수로 동작하며 각각 순수 함수 + 단위 테스트(경계값 케이스 포함)가 있다.
- [ ] AC-S3 성적 분석: 분반 선택 시 히스토그램·평균/표편/중앙값·중간→기말 추이(급등락 하이라이트)·분반 간 비교·수행 항목별 입력률/평균이 recharts로 표시된다.
- [ ] AC-S4 기록 커버리지 매트릭스가 학생×유형(관찰·행특·세특초안·창체)으로 렌더되고 기록 부족 학생이 상위 정렬된다.
- [ ] AC-S5 업무 진척: 분반별 진도율·세특 완성률·신고서 처리율이 표시된다.
- [ ] AC-P1 인쇄실이 네비에 등록되고, 담임반/분반 선택 → 학생 목록에 4플래그 배지가 표시된다(기존 도메인 로직 재사용, 로직 변경 0).
- [ ] AC-P2 학생 선택 시 상세 점검 화면(성적·출결·기록 현황)이 표시된다.
- [ ] AC-P3 '배부용 인쇄' 시 인쇄 전용 레이아웃에 지필+추이·수행·출결만 포함되고 관찰/행특/상담/교사메모는 grep·실측 모두 0건이다.
- [ ] AC-P4 기존 명단 인쇄가 기존과 동일하게 동작한다.
- [ ] AC-C1 recharts 차트가 다크 테마에서 remap 팔레트 톤으로 렌더되고, 인쇄 미리보기(흑백)에서 판독 가능하거나 표로 대체된다.
- [ ] AC-C2 DB 스키마·마이그레이션 diff 0, 보안 표면 diff 0.
- [ ] AC-A 게이트: tsc 0건 + vitest 전체 green(신규 집계 단위테스트 포함) + 데이터 있는 계정 실측 + 빈 데이터 상태 확인 + 인쇄 미리보기 확인 + 390px 가로스크롤 0 + 모바일/데스크톱 스크린샷 사용자 승인.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 인사이트 영역이 일부일 것 | R1: 4영역 제시 | 4개 전부 선택 |
| 인쇄물 독자가 교사일 것 | R2: 독자 질문 | 점검 화면+배부 인쇄물 둘 다 |
| 성적 분석이 담임 관점일 수 있음 | R3: 데이터 증거(내 과목 성적만 존재) 제시 | 분반 단위 확정 |
| 경보가 홈 알림과 중복 | R4(콘트래리언) | 층위 분리 — 홈=당장, 통계실=기간 패턴 |
| 교사 코멘트가 필요할 것 | R5: 선택지 제시 | 미선택 → Non-Goal |
| 차트 라이브러리 없이 가능 | R6(심플리파이어): CSS/SVG 제안 | 사용자가 recharts 도입 명시 선택 |
| "이상징후"는 주관적 | R9: 수치 임계값 제안 | 3종 상수 확정 |

## Technical Context (탐색 결과)
- **통계실**: `app/(shell)/stats/page.tsx`(80줄) — `getOwnerStats()`(`lib/db/queries/stats.ts:33-104`)로 8개 카운트 카드. 성적 통계는 "준비중" 스텁. 차트 라이브러리 없음(package.json 확인).
- **인쇄실**: `app/print/page.tsx`(74줄, 셸 밖 라우트) — `listStudents()`(`lib/db/queries/students.ts:23-42`) 명단 표 + `print-button.tsx` `window.print()`. 네비 미등록(`app/ui/nav-config.ts`에 없음), 통계실 링크(`stats/page.tsx:43-46`)로만 진입. 인쇄 CSS는 `globals.css:123-137`(@media print, 흑백 강제).
- **미사용 핵심 자산**: `lib/domain/student-report.ts` — 4플래그(jipilTrend 중간→기말 등락 / observationShortage 관찰 부족 / performanceMissing 수행 미입력 / sectionRank 구간 석차 상·중·하) 순수 함수+테스트 완비. `lib/db/queries/student-report.ts:79-199` `getStudentReport()` 조립 쿼리 완성. **UI 없음** — 인쇄실 3·4단계의 토대.
- **데이터 표면**: `jipil_scores`(지필, ordinal 중간/기말), `performance_assessments`(수행), `attendance_records`(kind/reason/date/신고서), `subject_observations`, `homeroom_behavior_notes`, `special_note_drafts`(status), `counseling_logs`, `club_members`, `creative_activity_records`. 진도율은 class_sessions(QC v7의 오늘수업 체크와 동일 모델).
- **분반 비교**: `getGradeView()`(lib/db/queries/grades.ts) 재사용 — sectionRank 플래그가 이미 분반 코호트 percentile 사용.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| StatsRoom | view root | 4 sections | renders Alert/GradeAnalysis/Coverage/Progress |
| Alert(이상징후) | core (new) | kind(출결증가/성적급락/기록공백), 근거수치, threshold 상수 | targets Student |
| GradeAnalysis | core (new) | 분포·기초통계·추이·분반비교·수행현황 | per Section, uses JipilScore/Performance |
| CoverageMatrix | core (new) | 학생×기록유형 카운트 | reads Observation/BehaviorNote/SetechDraft/CreativeRecord |
| WorkProgress | supporting (new) | 진도율·세특완성률·신고서처리율 | reads ClassSession/SetechDraft/AttendanceReport |
| PrintRoom | view root | 범위선택·학생목록·상세·배부인쇄 | hosts StudentReport |
| StudentReport | core (existing, UI 신규) | 4 flags + 성적·출결·기록 종합 | per Student, reuses student-report.ts |
| Handout(배부 인쇄물) | core (new) | 지필+추이·수행·출결만 | print-only layout of StudentReport subset |
| Student | core domain | sid, grade, classNo, name | subject of all |
| JipilScore / Performance | core domain | rawScore/환산, 항목 점수 | feeds GradeAnalysis/Handout |
| AttendanceRecord | core domain | kind, reason, date | feeds Alert/Handout |
| Section(분반) | core domain | subject, 수강생 | unit of GradeAnalysis |
| RecordEntry(관찰/행특/세특/창체) | core domain | body, date, status | feeds Coverage/Alert |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 10 | 10 | - | - | N/A |
| 2 | 11 | 1 (Handout) | 0 | 10 | 91% |
| 3 | 12 | 1 (GradeAnalysis 통합) | 0 | 11 | 92% |
| 4~5 | 13 | 1 (인쇄물 확정) | 0 | 12 | 92→100% |
| 6~11 | 13 | 0 | 0 | 13 | 100% (6연속 무변동 — 완전 수렴) |

## Interview Transcript
<details>
<summary>Full Q&A (11 rounds)</summary>

### Round 0 (토폴로지)
**Q:** 2개 컴포넌트(통계실 인사이트화 / 인쇄실 학생별 점검·피드백화) 분해가 맞나?
**A:** 2개 그대로 진행

### Round 1
**Q:** 통계실이 답할 교사의 질문 종류? **A:** 성적 분석·기록 커버리지·이상징후 경보·업무 진척률 4개 전부
**Ambiguity:** 54%

### Round 2
**Q:** 인쇄실 자료의 독자? **A:** 둘 다(교사 점검 화면 + 학생·학부모 배부 인쇄물)
**Ambiguity:** 49%

### Round 3
**Q:** 성적 분석(분반 단위 확정)의 통계 처리? **A:** 분포+기초통계·중간→기말 추이·분반 간 비교·수행 항목 현황 전부
**Ambiguity:** 45%

### Round 4 (콘트래리언)
**Q:** 통계실 경보 vs 홈 '오늘의 할 일 알림' 중복 아닌가? **A:** 심층 분석형 경보 — 층위 분리
**Ambiguity:** 40%

### Round 5
**Q:** 배부용 인쇄물 내용? **A:** 지필 성적+추이·수행 현황·출결 요약 (교사 코멘트 미선택→제외)
**Ambiguity:** 35%

### Round 6 (심플리파이어)
**Q:** 차트 라이브러리 없이 CSS/SVG로 충분한가? **A:** recharts 도입
**Ambiguity:** 31%

### Round 7
**Q:** 통계실 4섹션 구성안? **A:** 제안 그대로
**Ambiguity:** 28%

### Round 8
**Q:** 인쇄실 5단계 구조안(네비 등록 포함)? **A:** 제안 그대로
**Ambiguity:** 22%

### Round 9
**Q:** 경보 임계값(30일≥3건+증가 / -15점 / 21일 0건, 상수)? **A:** 제안 그대로
**Ambiguity:** 17%

### Round 10
**Q:** 회귀 경계·검증 게이트(재사용 원칙, DB 0, recharts 제약, 7종 게이트)? **A:** 제안 그대로
**Ambiguity:** 9%

### Round 11 (최종 확인)
**Q:** 전체 요약 — 남은 모호함? **A:** 없음, 이대로 확정
**Ambiguity:** 4.7% ✅ 최종
</details>
