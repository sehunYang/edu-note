# Deep Interview Spec: QC v3 — 교실 재수정 + 담임 교실 허브

## Metadata
- Interview ID: qc-v3-2026-06-13
- Rounds: 6 (Round 0 topology + 5 question rounds, 2 mid-course clarifications)
- Final Ambiguity Score: 4.1%
- Type: brownfield
- Generated: 2026-06-13
- Threshold: 0.05
- Threshold Source: user request (explicit "목표 모호도 5% 미만")
- Initial Context Summarized: no (report read in full)
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.97 | 0.35 | 0.340 |
| Constraint Clarity | 0.95 | 0.25 | 0.238 |
| Success Criteria | 0.95 | 0.25 | 0.238 |
| Context Clarity | 0.96 | 0.15 | 0.144 |
| **Total Clarity** | | | **0.959** |
| **Ambiguity** | | | **0.041** |

## Topology (12 active components, 0 deferred)

| # | Component | Status | Description | Coverage Note |
|---|-----------|--------|-------------|---------------|
| 1 | 수업계획실 | active | 월/주차+시험일시 표기, 차시수 분반중복 버그 수정 | AC-1.x |
| 2 | 진척도 | active | 학기 경계 8/14 고정→여름방학 기준 | AC-2.x |
| 3 | 성적기록 | active | 환산 미리보기 요소 분해+미시행 숨김, CSV 조회 별도 라우트 | AC-3.x |
| 4 | 세특작성 | active | 예시 CSV, 과목별 수강생 필터, 추가입력 CRUD | AC-4.x |
| 5 | 담임 교실 허브 | active | 담임반 자동판별, 학기무관, 6개 하위 컴포넌트 셸 | AC-5.x |
| 6 | 자율·진로활동 관리 | active | 신규: self_activity 불러오기 + 학생별 저장 + 자유탐구 | AC-6.x |
| 7 | 출결 관리 | active | 이전+조회/교시체크+3단계 마감+월별/학생별/미제출 뷰 | AC-7.x |
| 8 | 행동특성 기록 | active | 이전 완료 상태, 담임반 판별 와이어링 수정 | AC-8.x |
| 9 | 상담실 | active | rename+이전+슬롯예약+기록수정+코워크 CSV | AC-9.x |
| 10 | 공지실 | active | 이전+한마디 N장 스와이프+할일 수정/내용 +고정반 설정 패널(신규) | AC-10.x |
| 11 | 생기부 작성 | active | 신규: 자율/진로/행발 3영역 코워크 CSV | AC-11.x |
| 12 | 학생 안내 페이지 | active | 캘린더·시간표(선택과목 자가매핑)·급식·출결표·상담신청·공개링크 | AC-12.x |

(교과관찰·학생보고서 = 수정 없음, 토폴로지 제외)

## Goal

qc-report-v3.md에 적힌 모든 수정사항을, edu-note의 기존 아키텍처(쿼리 계층 `lib/db/queries/*` + ownerId 인자 규약, `app/**` 서버 컴포넌트 + 서버 액션 + audit, 마이그레이션은 손작성 SQL→`scripts/apply-sql.mjs` 직접 적용)를 따라 구현한다. 두 묶음: (A) 기존 교실 4개 컴포넌트 재수정, (B) 담임 교실 허브(`/homeroom`)를 신설하고 기존 출결·상담·공지·행특을 이전 + 자율진로/생기부 신규 + 학생 안내 페이지 전면 개편.

## Constraints
- **담임반 판별**: 세팅실-교사설정의 `isHomeroom`+`homeroomGrade`+`homeroomClassNo` 기반. 기존 `roster.ts:isHomeroomStudent`(grade/classNo 파생, sid 파싱 금지) 재사용.
- **담임 교실 컴포넌트는 학기 무관**: 1·2학기 구분 없이 통으로 사용(생기부·자율진로·행특·상담·공지·출결).
- **마이그레이션 규약**: drizzle generate 금지(저널 stale). 손작성 `00NN_name.sql`(idempotent: add column/table if not exists, enum은 ADD VALUE 단독파일) → `node --env-file=.env.local scripts/apply-sql.mjs <file>`. 공유 prod DB라 additive·무중단만.
- **컴시간 한계 수용**: 파서는 반 단위(grade/classNo)라 개인 선택과목을 모름. 선택과목은 학생 자가매핑으로 보정(아래 12번). 매핑 저장구조만 구축, 변동 능동감지/알림은 이번 범위 제외.
- **AI 호출 없음(Phase 1 정책)**: 상담·생기부·세특의 AI 분석은 모두 "원천자료 CSV 내보내기 → 코워크(외부)에서 작업 → 결과 CSV 업로드" 패턴. 서버 Claude API 호출 안 함.
- **원점수 저장·읽기시점 환산** 유지(성적).
- **검증 게이트**: typecheck 0err + build exit0 + 관련 itest green(`RUN_DB_ITEST=1 node --env-file=.env.local ./node_modules/vitest/vitest.mjs run <file>`). 단위테스트 `node ./node_modules/vitest/vitest.mjs run <file>`.
- **배포**: git push origin main → Vercel Hobby 자동 프로덕션(icn1). 보호 라우트는 미인증 404(인증 게이트) — 익명 스모크 한계, 화면 확인은 사용자 영역.

## Non-Goals
- 교과관찰·학생보고서 수정(변경 없음).
- 선택과목 시간표 변동의 능동 감지·알림(저장구조만 구축, 다음 단계).
- 서버측 AI 분석 호출(코워크 외부 처리 유지).
- subjectExams.semester 컬럼 구조 변경(유지 결정 — 공유 prod DB).
- 출결 신고서/체험 양식 자체의 PDF 생성 등(범위 외).

## Acceptance Criteria

### 1. 수업계획실
- [ ] AC-1.1 차시 N = **대표 분반 1개 기준**. 같은 과목 분반들의 요일 UNION을 폐기하고, 분반 중 주당 슬롯 수가 최대인 대표 분반의 (학기 수업일 ∩ 그 분반 슬롯 요일) 날짜 수로 N 산출. (`getPlanLength` 재작성: 분반 union→대표분반 단일)
- [ ] AC-1.2 3시수 과목이 ~분반 무관하게 시수×수업주에 근접(예: 물리 97→~51). 분반 수가 N에 영향 없음(itest로 다분반 동치 단언).
- [ ] AC-1.3 각 차시 행 옆에 '0월 0주차' 표기 = 대표 분반의 k번째 수업일에서 산출한 월·주차.
- [ ] AC-1.4 학사일정 시험기간(event_kind=exam, 1차/2차=ordinal)에 해당하는 시기의 차시 행에 '1차/2차 시험' 마커 삽입(대표분반 k번째 수업일이 시험기간에 들 때).

### 2. 진척도
- [ ] AC-2.1 1/2학기 경계를 8/14 고정에서 **여름방학 시작일**(학사일정 vacation 클러스터의 여름 시작)로 변경. `semesterRange` 또는 진척도 경로에서 boundary를 데이터 도출.
- [ ] AC-2.2 여름방학이 학사일정에 아직 없으면 기존 8/14 fallback 유지(무중단).
- [ ] AC-2.3 8월 초 수업일이 여름방학 이후면 2학기로 분류(1학기 차시 목록에서 빠짐). 분반별 차시 생성은 그대로 분반 단위 유지(진도 차이 기록 보존).

### 3. 성적기록
- [ ] AC-3.1 환산 미리보기를 합산 단일값에서 **요소별 분해**로: 지필 중간/지필 기말 각각 별도 열(활성 회차만), 수행은 항목별 별도 열, 그리고 합계.
- [ ] AC-3.2 미시행 지필(jipil*Enabled=false)은 해당 지필 환산 열을 숨김.
- [ ] AC-3.3 업로드된 수행/지필 CSV가 있으면 '조회' 버튼 노출 → **별도 라우트**(예: `/classroom/grades/view`)에서 저장된 수행항목별·지필회차별 테이블을 전체 화면으로 표시.

### 4. 세특작성
- [ ] AC-4.1 ② 코워크 결과 CSV 업로드 칸에 **예시 CSV 다운로드** 버튼(코워크 업로드 스키마와 동일한 샘플 행).
- [ ] AC-4.2 학생 추가입력란: 과목 선택 시 **그 과목 수강생만** 드롭다운 필터.
- [ ] AC-4.3 추가입력 저장 **목록 표시 + 인라인 수정/삭제**(CRUD).

### 5. 담임 교실 허브
- [ ] AC-5.1 `/homeroom` 허브 셸 + 6개 하위(자율진로/출결/행특/상담/공지/생기부). 담임 미설정시 게이팅 안내.
- [ ] AC-5.2 담임반 학생 자동판별(`isHomeroomStudent`)을 허브 공통으로 사용. 학기 토글 없음(통합).
- [ ] AC-5.3 기존 top-level 라우트(`/attendance`,`/counsel`,`/notice` 등)는 **제거 또는 `/homeroom/*` 리다이렉트**. 홈 허브 카드 갱신.

### 6. 자율·진로활동 관리 (신규)
- [ ] AC-6.1 학사일정 `event_kind=self_activity` 목록을 불러와 활동별 특기 내역 입력.
- [ ] AC-6.2 저장은 **학생별 행**, 입력 UI는 **복수 체크**로 여러 학생에게 일괄 저장.
- [ ] AC-6.3 학사일정과 무관한 **자유 탐구/활동**도 입력: 공통 기입 / 학생별 개별 기입 선택 + **자율/진로 토글**로 영역 분류.
- [ ] AC-6.4 저장 내역 수정/삭제. 담임반 학생만 대상.

### 7. 출결 관리 (이전 + 확장)
- [ ] AC-7.1 `/homeroom/attendance`로 이전. 담임반 학생만 토글 표시.
- [ ] AC-7.2 교시 목록 = `[조회, 1, 2, …, N]`, N은 **컴시간 파서 담임반 시간표의 당일 교시 수**(가변, 6/7 등). 아침조회 포함.
- [ ] AC-7.3 지각 = 기점 교시 **하나** 체크 → **조회부터 기점 교시까지(포함) 결석 처리**, 다음 교시부터 출석.
- [ ] AC-7.4 조퇴 = 기점 교시 **하나** 체크 → 기점 교시부터(포함) 이후 결석(하교).
- [ ] AC-7.5 결과 = **교시 다중선택**(비연속 허용). 결석 = 전일(교시 무관).
- [ ] AC-7.6 신고서 마감 = 출결일로부터 **수업일 5일**, 교외체험 사후보고서 = **수업일 10일**(현재 5일→10일 수정). 수업일 = schoolDayCalendar 기준 카운트.
- [ ] AC-7.7 미제출 토글 **3단계**: 1=기한까지 잔여 수업일 ≥3, 2=잔여 <3(≥0), 3=기한 초과. 기존 tier(normal/warning/critical) 이 기준으로 재매핑.
- [ ] AC-7.8 뷰 3종 추가: 오늘 입력/확인 + **월별**(날짜순) + **학생별 검색** + **미제출만 모아보기**.

### 8. 행동특성 기록
- [ ] AC-8.1 현재 담임반 판별 미동작 → `isHomeroomStudent` 와이어링으로 담임반 학생 판별·이용 가능하게 수정. (컴포넌트 자체는 `/homeroom/behavior`에 이전 완료 상태 — 판별만 고침.)

### 9. 상담실
- [ ] AC-9.1 기존 '상담' 컴포넌트를 '상담실'로 rename + `/homeroom/counsel` 이전. 담임반 학생만 토글.
- [ ] AC-9.2 상담 기록 **수정** 기능 추가(현재 삭제만 가능).
- [ ] AC-9.3 **예약 시스템**: 교사가 캘린더로 날짜별 상담 허용·허용인원(정원)을 오픈. 기본은 모든 날 신청 불가, 오픈한 날만 신청 가능. 신규 테이블 counseling_slots(date, capacity) + counseling_reservations(slot, studentYearId). 선착순.
- [ ] AC-9.4 학생 신청은 학생 안내 페이지에서(아래 12번). 예약 성사 시 해당 학생 일정 안내에 표시. 예약=신청만, 상담기록은 교사 별도 작성.
- [ ] AC-9.5 AI 상담 분석을 세특 패턴으로 교체: 원천자료 내보내기 → 코워크 → CSV 업로드. 업로드 결과 = **행동발달 및 특기사항 원천자료**.

### 10. 공지실
- [ ] AC-10.1 `/homeroom/notice` 이전. 교사 한마디를 **여러 장 저장**(현재 1개) → 공개 페이지에서 **스와이프**로 넘김. 다중 행 + 순서.
- [ ] AC-10.2 할일/공지 **수정** 가능(현재 불가) + 제목 외 **'내용' 필드** 추가.
- [ ] AC-10.3 **고정반 수업 설정 패널(신규)**: 컴시간으로 담임 학년 전체 수업 목록 파싱 → 교사가 "담임반 학생이 모두 원반에서 듣는 고정반 수업"을 **체크·저장**(수업/과목 단위). 미체크 = 선택과목(이동반). → 12번 시간표·자가매핑의 기준 데이터.

### 11. 생기부 작성 (신규)
- [ ] AC-11.1 세특과 동일 틀: 영역별 원천자료 CSV 내보내기 → 코워크 → 결과 CSV 업로드(초안). `/homeroom/record` 등.
- [ ] AC-11.2 3영역: **자율활동 / 진로활동 / 행동발달 및 특기사항**.
- [ ] AC-11.3 원천 매핑: 자율 ← 자율·진로활동 관리의 자율활동 입력분, 진로 ← 진로활동 입력분, 행발 ← 행특 기록 + 상담실 업로드 코워크 CSV + 세팅실-학생명단 역할(class_roles).
- [ ] AC-11.4 학기 구분 없음, 연말 1회 작업. 세특 컴포넌트와 독립.

### 12. 학생 안내 페이지
- [ ] AC-12.1 상단 헤더 '000 학생 안내 페이지'(본인 이름).
- [ ] AC-12.2 '이번 주 할일' → **'일정 안내'**: 한 달 캘린더(월 이동), 학사일정 + 공지실 등록 할일 표시, 오늘 날짜 칸 명암 강조. 상담 신청은 별도 섹션, 신청분은 일정에 반영.
- [ ] AC-12.3 시간표 = 열 월~금 × 행 1~7교시 표. 컴시간 담임반(grade/classNo) 시간표 파싱, **매일 1회 동기화**(교사 시간표와 동일). 교사 등록 수업이 아닌 컴시간 파싱본 사용.
- [ ] AC-12.4 고정반 수업(AC-10.3 설정)은 과목명 표시, **미체크 슬롯 = '선택과목' 표기**. 학생이 '선택과목' 클릭 시 **그 요일·교시에 열리는 학년 선택과목** 후보를 토글로 자가매핑(학생별 영속 저장). 매핑 후 1:1 대응(저장구조만, 표시는 정적).
- [ ] AC-12.5 급식 = 당일 급식 표시(NEIS api는 이미 수신 중, 표시만 추가).
- [ ] AC-12.6 출결 요약 = **2차원 표**: 열 지각/조퇴/결과/결석 × 행 인정/질병/미인정/기타.
- [ ] AC-12.7 성적 섹션 **제거**.
- [ ] AC-12.8 상담 신청 = 캘린더, 상담 가능일 중 잔여 인원 있는 날만 표시(없는 날 막힘), 클릭 신청. 정상 신청 시 해당 학생 일정 안내에도 표시.
- [ ] AC-12.9 세팅실-학생명단 공개링크: 발급된 토큰을 **새로고침 후에도 재조회·상시 표시**(재발급 전까지 유지). 토큰은 이미 yearLinks에 저장됨 — UI 재조회만 수정.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 차시 N은 분반 union이 적절 | 분반 많을수록 부풀려짐(물리=97) | 대표 분반 1개 기준으로 변경(분반 무관) |
| 월/주차는 차시에 직접 매핑 가능 | 분반마다 날짜 다름 | 대표 분반 k번째 수업일 기준 |
| 학기 경계는 8/14 고정 OK | 8월 초가 1학기로 오분류 | 여름방학 시작일 데이터 도출 + 8/14 fallback |
| 지각은 체크 교시부터 출석(이전만 결석) | 경계 inclusive/exclusive 모호 | 조회~기점 교시까지(포함) 결석으로 확정 |
| 교시는 1교시 시작, 1~7 고정 | 아침조회 지각 누락, 학교별 교시 다름 | 조회 추가 + 컴시간 당일 교시 수 가변 |
| 컴시간으로 학생 개인 시간표 가능 | 반 단위라 선택과목 개인차 모름 | 고정반 설정(교사) + 선택과목 학생 자가매핑 |
| 변동 추적까지 이번에 구현 | 범위 과다 | 매핑 저장구조만, 표시 정적(능동감지 다음) |
| 기존 라우트 유지 | 중복 진입점 | 구 라우트 제거/리다이렉트 + /homeroom 이전 |

## Technical Context (탐색 결과)
- **수업계획실 차시 버그**: `lib/db/queries/lesson-plan.ts:getPlanLength` — 과목 분반들의 `timetableSlots.weekday`를 Set으로 UNION → 분반 많으면 요일 커버리지 ↑ → N 부풀려짐. 대표 분반 단일로 교체 대상.
- **학기 경계**: `lib/domain/school-year.ts:semesterRange` — sem1 end가 8/14 하드코딩. 진척도(`progress.ts:generateSemesterSessions`/`listSectionsForSemester`)와 계획실이 사용. 여름방학 boundary는 학사일정 vacation(`calendarEvents`/`calendar-keywords.ts` 클러스터)에서 도출.
- **성적**: `lib/db/queries/grades.ts:getGradeView`가 jipilConverted/performanceTotal/total 합산만 반환 → 회차별·항목별 분해 반환으로 확장. jipilScores(ordinal 1=중간/2=기말), performanceAssessments(name별), subjects.jipil*Enabled.
- **출결**: 기존 `app/attendance` + `lib/db/queries` — reason(illness/accepted/unaccepted/etc)×kind(late/early_leave/absent_period/absent), reportRequired 자동, fieldTrips tier(normal/warning/critical). 교시 컬럼 없음 → 신규. 5일 규칙 존재(체험 5→10 수정).
- **컴시간**: `lib/integrations/comcigan.ts:decodeTimetable` — 자료542(교사별, 선택과목 포함, code=과목idx×1000+(학년×100+반))로 전체 학교 시간표 디코딩. grade/classNo 필터로 담임반·학년 전체 슬롯 추출 가능. 교사 마스킹("양세*") 대응 `teacherNameMatches` 존재. `comcigan-client.ts`(server-only)에 fetch 격리.
- **상담**: `app/counsel` — create/delete만, AI는 목업. edit 없음. 슬롯/예약 테이블 신규.
- **행특**: `app/homeroom/behavior` 이미 존재(2-2 이전 완료), 담임반 판별만 미동작.
- **공개링크**: yearLinks(token) 저장됨(C4 issuePublicPageForHomeroom). UI 재조회 누락이 버그.
- **담임 판별**: `lib/db/queries/roster.ts:isHomeroomStudent`, 세팅실 profile(isHomeroom/homeroomGrade/homeroomClassNo).

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Subject(과목) | core | name, schoolYear, semester, jipilMid/FinalEnabled/Weight, performanceItems | has many CourseSection, has LessonPlan(차시) |
| CourseSection(분반) | core | label, subjectId | has timetableSlots, classSessions; 대표분반=주당슬롯 최대 |
| LessonPlan(차시계획) | core | subjectId, ordinal(1..N), content, keywords | 과목단위(분반 무관), N=대표분반 |
| ClassSession(분반차시) | core | sectionId, date, status | 분반단위 진척, planOrdinal 매핑 |
| StudentYear(학생) | core | sid, name, grade, classNo | 담임반 판별, enrollments, class_roles |
| CalendarEvent(학사일정) | supporting | event_kind(exam/vacation/self_activity/…), examOrdinal | 학기경계·자율활동·시험마커 원천 |
| AttendanceRecord(출결) | core | date, kind, reason, **periods(신규)**, reportRequired, tier | 담임반 학생, 수업일 마감 |
| CounselSlot/Reservation(상담예약) | core(신규) | date, capacity / slotId, studentYearId | 교사 오픈 → 학생 선착순 |
| TeacherNote(한마디) | supporting | body, **order(신규 다중)** | 공개페이지 스와이프 |
| FixedClassSetting(고정반설정) | core(신규) | homeroom, subject/수업, isFixed | 컴시간 학년파싱 → 선택과목 판별 |
| StudentElectiveMapping(선택과목매핑) | core(신규) | studentYearId, weekday, period, mappedSubject | 학생 자가매핑, 1:1 대응 |
| GenericRecord(생기부/세특 초안) | core | area(자율/진로/행발/세특), studentYearId, draft | 코워크 CSV 왕복 |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability |
|-------|-------------|-----|---------|--------|-----------|
| 0 (topology) | 8 | 8 | - | - | N/A |
| 1 (Part A) | 9 | 1(LessonPlan 정밀화) | 1 | 7 | 89% |
| 2-3 (Part B) | 11 | 2(CounselSlot, FixedClassSetting) | 0 | 9 | 82% |
| 4-5 (학생안내) | 12 | 1(StudentElectiveMapping) | 0 | 11 | 92% |
| final | 12 | 0 | 0 | 12 | 100% |

## 권장 작업 순서
1. **마이그레이션 묶음**(additive): 출결 교시, counsel_slots/reservations, teacher_notes 다중+content, fixed_class_settings, student_elective_mappings, 생기부 draft 테이블.
2. **Part A 재수정**(독립적, 기존 라우트): 1 수업계획실 → 2 진척도 → 3 성적 → 4 세특.
3. **허브 셸 + 이전**(5): /homeroom + 라우트 이전/리다이렉트.
4. **이전 컴포넌트 확장**: 7 출결 → 8 행특 → 9 상담 → 10 공지(+고정반 설정).
5. **신규 컴포넌트**: 6 자율·진로 → 11 생기부.
6. **학생 안내 페이지**(12, 맨 마지막 — 공지 한마디·고정반설정·상담슬롯·출결표 등 선행 의존).
7. **회귀 + 배포**: typecheck/build/itest green → git push origin main.

## Interview Transcript
<details>
<summary>Full Q&A (Round 0 + 5 rounds + 2 clarifications)</summary>

### Round 0 — Topology
**Q:** 12개 최상위 컴포넌트 구성이 맞습니까?
**A:** 맞습니다 (12개 그대로).

### Round 1 — Part A 재수정
- 차시 N: **대표 분반 1개 기준**
- 월/주차+시험: **대표분반 k번째 수업일 기준** + 시험기간 차시행 마커
- 진척도 경계: **여름방학 시작일 기준, 미설정시 8/14 fallback**
- 성적 CSV 조회: **별도 라우트 페이지**

### Round 2 — Part B 구조 (일부 clarify)
- 라우트 이전: **신규 /homeroom/* + 구 라우트 제거/리다이렉트**
- 자율·진로: **self_activity 불러오기 + 학생별 행 저장**
- (출결은 clarify로 이동)

### 출결 Clarification 1
**사용자:** 교시 수는 컴시간 파서값 활용, 지각/조퇴는 기점 하나만 체크.
**추가:** 지각=기점 교시까지 결석 처리(조퇴는 그대로), 출결 시작=조회부터(아침조회 지각).

### 출결 Round
- 결과: **교시 다중선택**
- 마감 3단계: **수업일 5/10일 + 3일 경계 3단계**

### Round 3 — 상담/공지/생기부
- 상담 예약: **슬롯(날짜+정원)+선착순**
- 상담 AI/수정: **코워크 CSV 원천화 + 기록 수정**
- 공지실: **한마디 N장 + 할일 수정/내용필드**
- 생기부: **3영역 원천 매핑 그대로**

### Round 4 — 학생안내/세특
- 시간표: **다름 → clarify**(선택과목 자가매핑으로 발전)
- 일정/상담: **두 섹션 분리, 신청은 일정 반영**
- 공개링크: **발급 토큰 재조회·상시 표시**
- 세특: **예시 CSV + 과목필터 + 추가입력 CRUD**

### 시간표 Clarification 2
**사용자:** 공지실에 신규 기능 — 컴시간으로 학년 전체 수업 파싱 → 교사가 고정반 수업 체크 저장 → 미체크=선택과목 표기 → 학생이 개인페이지에서 선택과목을 학년 파싱본에서 자가매핑(1:1 대응, 변동 추적 토대).

### 자가매핑 Round
- 후보 목록: **그 요일·교시에 열리는 학년 선택과목만**
- 변동 추적: **매핑 저장구조만, 표시 정적**

</details>
