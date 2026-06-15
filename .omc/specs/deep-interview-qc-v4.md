# Deep Interview Spec: QC v4 — Edu_Note

## Metadata
- Interview ID: qc-v4
- Rounds: 14 (+ Round 0 topology gate)
- Final Ambiguity Score: 4.7%
- Type: brownfield
- Generated: 2026-06-15
- Threshold: 0.05
- Threshold Source: user-override ("모호도 5% 미만")
- Initial Context Summarized: no (qc-report-v4.md read in full)
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.96 | 0.35 | 0.336 |
| Constraint Clarity | 0.95 | 0.25 | 0.238 |
| Success Criteria | 0.95 | 0.25 | 0.238 |
| Context Clarity | 0.94 | 0.15 | 0.141 |
| **Total Clarity** | | | **0.953** |
| **Ambiguity** | | | **0.047** |

## Topology
9개 최상위 컴포넌트, 전부 active (deferral 없음). #8/#9는 횡단(cross-cutting) 요구로 Round 중 추가됨.

| # | Component | Status | Description | Coverage Note |
|---|-----------|--------|-------------|---------------|
| 1 | 수업 계획실 | active | 학기계획(세부단원+핵심개념+최소차시+시험별 목표진도) → 차시계획 2단계 라우트 | AC-1.x |
| 2 | 진척도 | active | 계획 vs 실제(좌/우), 분반별 목표·실제 진도율 통계(초록/빨강) | AC-2.x |
| 3 | 담임교실 허브화 | active | 교실식 상단 탭바 공유 레이아웃으로 전환 | AC-3.x |
| 4 | 출결 관리 | active | 신고서 판정기준 변경 + 결석/체험학습 기간 입력·수업일 자동생성·수정 + 신고서 묶기 | AC-4.x |
| 5 | 공지실 | active | 한마디 순서변경·개별공지(대상 필드)·시간표 동기화 통합 | AC-5.x |
| 6 | 학생 안내 페이지 | active | 상담 캘린더 반영·오늘표시·시간표·급식표·상담 취소(교사 승인) | AC-6.x |
| 7 | 오늘의 학교 | active | 넛지 모달·교과관찰/행동특성 사전선택·미제출 리다이렉트·시간표/급식/학사일정 위젯·공지위젯 | AC-7.x |
| 8 | 리스트 페이지네이션 | active | 번호식 페이지네이션, 지정 리스트 10/20개씩 | AC-8.x |
| 9 | 디바이스 진입 라우팅 | active | 서버 User-Agent 감지 → 모바일 루트(/) 진입 시 /today 리다이렉트 | AC-9.x |

## Goal
3차 QC 후 재검토(4차)에서 도출된 9개 영역을 수정·확장한다. 핵심은 (a) 수업 계획을 "학기계획 → 차시계획" 2단계 구조로 재설계하고 진척도를 차시 기반으로 정량화, (b) 출결의 신고서 판정·기간 입력·수정 기능 보강, (c) 공지/학생 안내 페이지의 개별화 및 정보 풍부화, (d) "오늘의 학교"를 넛지 모달 중심으로 업그레이드, (e) 긴 리스트의 페이지네이션과 모바일 진입 동선 개선이다.

## Constraints
- 브라운필드: 기존 Next.js(App Router) 구조와 DB 스키마를 확장하되 기존 데이터 모델 관례 유지.
- 수업 계획(세부단원/차시)은 **과목(subject) 단위 1세트** (기존과 동일, 여러 분반 공유). 진척도만 분반(section) 단위.
- 진척도 진도율은 **둘 다 차시(ordinal) 수 기준** — 날짜 환산 금지.
- 출결 자동 생성은 **수업일(schoolDayCalendar) 기준만** — 주말·공휴일 제외.
- 페이지네이션은 **번호식(1 2 3 …)** 으로 통일.
- 모바일 감지는 **서버 User-Agent**, 루트(/) 진입에만 적용.
- 넛지는 강제가 아닌 유도 — 지나간 날의 미기록을 계속 띄우지 않음.

## Non-Goals
- 서버측 Claude/Anthropic API 호출 추가 없음 (Phase 1 정책 유지 — [[ai-setech-cowork-export]]).
- 수업 계획 단위를 분반별로 분리하지 않음.
- 진도율을 달력/날짜 경과 기반으로 계산하지 않음.
- 상담 취소를 학생 단독으로 즉시 확정하지 않음(교사 승인 게이트 유지).
- 모바일 리다이렉트를 루트 외 모든 경로로 확장하지 않음.
- prod DB 마이그레이션 자동 적용 없음 — 사용자 승인 게이트 유지 ([[qc-v3-complete]]).

## Acceptance Criteria

### #1 수업 계획실 (2단계 라우트)
- [ ] AC-1.1 수업 계획실이 두 라우트로 분리된다: **학기 계획** 단계와 **차시 계획** 단계. 학기 계획이 완료되어야 차시 계획 진입 가능.
- [ ] AC-1.2 학기 계획에서 세부 단원을 **대단원-중단원-소단원** 계층으로 입력한다 (각 단원명 작성).
- [ ] AC-1.3 소단원마다 **핵심 개념을 해시태그**로 입력하고, **예상 최소 차시 수**를 숫자로 입력한다.
- [ ] AC-1.4 입력한 세부 단원명·핵심개념·최소차시는 이후 **수정 및 삭제** 가능하다.
- [ ] AC-1.5 세팅실에서 체크한 1차/2차 시험 여부를 확인하고, **시험별 목표 진도**를 세부 단원(소단원) **범위 토글(어디~어디)** 로 선택·저장한다.
- [ ] AC-1.6 차시 계획에서는 세부 단원을 토글로 선택하거나 **6자리 숫자(대2+중2+소2)** 로 입력하면 해당 단원명·핵심개념이 자동 채워진다.
- [ ] AC-1.7 차시별 구체적 수업 내용을 기존 방식으로 입력한다. 예상 차시는 **자동 카운트**된다.
- [ ] AC-1.8 학기 계획의 소단원 최소차시(예 2)보다 차시 계획에서 더 많은 차시(예 3)를 넣고 저장하면, **오류 표시 + "학기 계획을 변경하시겠습니까?"** 확인. "네" → 학기 계획 최소차시를 맞춰 갱신, "취소" → 저장 취소.
- [ ] AC-1.9 수업 계획 상단에 **일괄 저장** 기능이 있다.
- [ ] AC-1.10 차시 리스트는 **10개씩 번호 페이지네이션**.

### #2 진척도
- [ ] AC-2.1 각 차시 행에서 **왼쪽 = 계획**(수업계획실의 세부단원·차시·수업내용·핵심개념), **오른쪽 = 실제** 입력.
- [ ] AC-2.2 오른쪽 실제 칸은 기본적으로 계획 내용이 복사되어 있고 **수정 가능**. 달라진 경우 수정 후 저장.
- [ ] AC-2.3 저장 시 진척도 통계가 활성화된다.
- [ ] AC-2.4 상단 통계: **목표 진도율 = (계획상 오늘까지 진행했어야 할 차시 ÷ 시험목표 총 차시)**, **실제 진도율 = (실제 진행 차시 ÷ 시험목표 총 차시)**. 둘 다 차시 수 기준.
- [ ] AC-2.5 실제가 계획보다 **2차시 이상 뒤지면 빨강**, 그 미만이면 초록.
- [ ] AC-2.6 통계는 **분반별로 따로** 카운트·표시.
- [ ] AC-2.7 진척도 리스트는 **20개씩 번호 페이지네이션**.

### #3 담임교실 허브화
- [ ] AC-3.1 담임교실이 세팅실/교실처럼 **상단 버튼(탭바) 공유 레이아웃**을 갖고, 하위 컴포넌트(자율·진로활동, 출결 관리, 행동특성 기록, 상담실, 공지실, 생기부 작성)를 상단 버튼으로 이동.
- [ ] AC-3.2 허브 페이지 자체는 묶는 역할만 — 별도 기능 없음.

### #4 출결 관리
- [ ] AC-4.1 신고서 필요 판정을 변경: **신고서 필요 = (사유 질병 AND 종류 결석) OR (비고에 '생리통' 포함, 종류 무관)**. 그 외(인정·미인정·기타, 질병의 지각/조퇴/결과)는 **불필요**.
- [ ] AC-4.2 교외체험학습 등록에 **시작일·종료일** 입력 (시작일만 입력 시 당일). 인정 결석으로 처리.
- [ ] AC-4.3 교외체험학습은 기간 내 **수업일마다 자동 '인정 결석'** 출결 기록 생성 (주말·공휴일 제외, schoolDayCalendar 필터). 월별·통계에 반영. 신고서는 사후보고서가 대신.
- [ ] AC-4.4 일반 결석도 **시작일~최종일 범위 입력** 가능 (질병 장기결석 등) → 수업일마다 자동 결석 생성.
- [ ] AC-4.5 출결 기록을 **삭제뿐 아니라 수정**도 가능하게.
- [ ] AC-4.6 교외체험학습 사후보고서를 다른 출결 신고서와 **동일하게 묶어** 관리 (하위 4탭 하단 중복 배치 제거).
- [ ] AC-4.7 월별 출결 조회·학생별 검색·미제출 신고서·교외체험학습 목록은 각각 **10개씩 페이지네이션**.

### #5 공지실
- [ ] AC-5.1 교사 한마디의 **순서 변경 UI** 제공 (기존 `updateTeacherNoteOrder`를 UI에 연결).
- [ ] AC-5.2 교사 한마디에 **대상 필드** 추가: **전체** 또는 **특정 학생(다수 선택)**. 다중·수정·삭제·순서변경 모두 동일 동작.
- [ ] AC-5.3 학생 안내 페이지에서 **전체 공지와 개별 공지가 병렬로 한 번에** 표시된다.
- [ ] AC-5.4 담임반 시간표 동기화를 **세팅실 컴시간 시간표 동기화의 하위 기능으로 통합** (이동/병합).
- [ ] AC-5.5 교사 한마디 / 할일·공지 리스트는 **10개씩 페이지네이션**.

### #6 학생 안내 페이지
- [ ] AC-6.1 상담 예약 성공이 **일정 안내 캘린더에 반영**되도록 버그 수정.
- [ ] AC-6.2 "오늘" 표시를 **날짜 기준**(KST 자정 경계)으로 — 자정 넘어가면 캘린더 오늘 표시도 갱신.
- [ ] AC-6.3 시간표에서 오늘 요일에 해당하는 부분을 **캘린더처럼 강조**.
- [ ] AC-6.4 시간표 선택과목은 학생 입력 후에도 **계속 클릭 가능 → 수정** 가능.
- [ ] AC-6.5 오늘 급식도 날짜 바뀌면 즉시 갱신.
- [ ] AC-6.6 급식을 **표 형태**로 전환: 메뉴 / 칼로리(NEIS CAL_INFO) / 영양정보(NEIS NTR_INFO 신규 수집).
- [ ] AC-6.7 학생이 상담 신청을 **취소 요청**할 수 있고, **교사 승인 시** 정원 복구 + 캘린더에서 제거.

### #7 오늘의 학교
- [ ] AC-7.1 진입 시 남은 넛지가 있으면 **모달**로 강조. **진입마다 표시, 닫으면 그 세션 동안 안 뜸**(재진입/새로고침 시 다시).
- [ ] AC-7.2 교과 관찰 넛지는 **오늘 진행하는 분반 수업당 1개** 생성. 관찰 부족 학생 우선 가중 랜덤으로 **1명 확정**. 해당 분반에 관찰 1건 기록되면 그 넛지 해결.
- [ ] AC-7.3 교과 관찰 "기록" 버튼 → 교실/교과 관찰 화면에 **해당 학생·분반이 토글로 사전 선택**된 상태로 진입(내용·키워드만 입력).
- [ ] AC-7.4 지나간 날의 미기록은 다시 띄우지 않음 — 수업 있는 날 당일 한정.
- [ ] AC-7.5 행동특성 기록 넛지는 담임 반 하루 1명을 사전 선택. "기록" 버튼 → 행동특성 화면에 학생 사전 선택. **종일 표시(16시 게이트 제거)**.
- [ ] AC-7.6 미제출 신고서 넛지 "확인하기" → **담임교실/출결 관리 미제출 탭으로 리다이렉트**.
- [ ] AC-7.7 오늘 시간표를 **수업마다 다른 색상**으로 표시하고, 분반 표시 옆에 **수업 시간** 표기.
- [ ] AC-7.8 오늘 급식을 학생 페이지와 동일한 **표(메뉴/칼로리/영양)** 로 전환.
- [ ] AC-7.9 다가오는 학사일정을 **캘린더**로 표시하고, **모든(담임) 학생의 예정 상담**도 함께 표시.
- [ ] AC-7.10 공지실 위젯 이관: 교사 한마디를 **여러 페이지 저장 → 공개 페이지 스와이프**로 여러 장 열람. 할일/공지를 **수정 가능**하게 하고 **내용(본문) 필드** 추가(현재 제목만).

### #8 리스트 페이지네이션 (횡단)
- [ ] AC-8.1 모든 대상 리스트에 **번호식 페이지네이션** 적용.
- [ ] AC-8.2 **10개씩**: 수업 계획실, 교과 관찰, 세특 작성/학생 추가 입력, 자율·진로활동, 출결-월별 조회, 출결-학생별 검색, 상담실-상담 기록, 공지실-한마디/할일·공지, 출결-미제출 신고서, 출결-교외체험학습 목록, 행동특성 기록, 상담 예약 슬롯.
- [ ] AC-8.3 **20개씩**: 진척도, 학사일정, 학생 명단.

### #9 디바이스 진입 라우팅 (횡단)
- [ ] AC-9.1 **서버 User-Agent**로 모바일 판별.
- [ ] AC-9.2 모바일이 **루트(/)** 로 진입하면 **/today(오늘의 학교)** 로 리다이렉트 (SSR 단계, 깜빡임 없음).
- [ ] AC-9.3 데스크톱은 현행 기본 진입(메인) 유지. 루트 외 경로는 리다이렉트하지 않음.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 학기계획이 분반별일 수도 | 수업계획은 과목 단위인데 진척도는 분반 단위 | 학기계획=과목별 1세트 (R1) |
| 진도율을 날짜로 환산 | "시험까지 목표 진도율"의 기준 | 둘 다 차시 수 기준 (R4) |
| "크게 차이"가 모호 | 초록/빨강 임계 정량화 | 계획 대비 2차시 이상 뒤지면 빨강 (R5-6) |
| 인정 결석에 신고서 필요(현행) | 미인정=무단이라 불필요라는 사용자 지적 | 신고서=(질병 AND 결석) OR 생리통만; 인정·기타 불필요 (R7) |
| 체험학습이 출결과 분리 | "출결 상황 반영" 요구 | 수업일 기준 자동 인정결석 생성, 결석도 기간 입력+수정 가능 (R8) |
| 개별공지가 별도 엔티티 | 한마디와의 관계 | 한마디에 대상 필드 추가(전체/특정학생 다수) (R9); 공개페이지 병렬 표시 |
| 넛지가 하루 1명 총량 | "수업 당 한 명"의 단위 | 분반 수업당 1개, 기록 시 해결 (R10) |
| 모달이 한번만/계속 | 표시 빈도·닫기 | 진입마다, 닫으면 세션 동안 미표시 (R11) |
| 행동특성 넛지 16시 게이트 유지 | 종일 노출 여부 | 종일 표시, 게이트 제거 (R12) |
| 상담 취소 즉시 확정 | 정원/승인 | 교사 승인 게이트 (R13) |
| 모바일 감지 방식 | UA vs viewport, 적용 범위 | 서버 UA, 루트(/)만 (R14) |

## Technical Context (브라운필드 탐색 결과)
- **#1**: `app/classroom/plan/{page.tsx,plan-editor.tsx}`, `lib/db/queries/lesson-plan.ts`. 현재 과목 단위·차시(ordinal) 그리드. 세부단원 계층·시험별 목표진도 = **신규 스키마+UI**. 시험 마커는 `calendarEvents(eventKind='exam')`.
- **#2**: `app/classroom/progress/{page.tsx,progress-board.tsx}`, `lib/db/queries/{progress.ts,sessions.ts}`. 세션 status(planned/done/not_held)·`planOrdinal` 존재. 진도율 컬럼/퍼센트 = 신규.
- **#3**: `app/homeroom/page.tsx` (현재 HubCard 링크 그리드, 공유 레이아웃 없음). 비교 대상: `app/setting/layout.tsx`(사이드바), `app/classroom/layout.tsx`(탭바) → **탭바 패턴 채택**.
- **#4**: `app/homeroom/attendance/page.tsx`(4탭), `lib/domain/attendance-rules.ts`(`isReportRequired`), `lib/domain/types.ts`(`AttendanceReason=illness|accepted|unaccepted|etc`, `AttendanceKind=late|early_leave|absent_period|absent`), `lib/db/queries/attendance.ts`(`addFieldTrip` 단일 `tripDate`). 기간/자동생성/수정 = 신규. `schoolDayCalendar`로 수업일 필터.
- **#5**: `app/homeroom/notice/{notes-manager,events-manager,fixed-class-panel}.tsx`, `lib/db/queries/notice.ts`(`updateTeacherNoteOrder` 미연결). `HomeroomTimetableSync`(`app/homeroom/homeroom-timetable-sync.tsx`) → `app/setting/courses/timetable-sync.tsx` 하위로 통합. 대상 컬럼(targetScope/studentId) = 신규.
- **#6**: `app/p/[token]/{page.tsx,public-page-view.tsx}`, `lib/public/{get-public-page.ts,dto.ts,student-write.ts}`, DB 함수 `get_public_page()`. `PublicMeal={date,menu}` → calInfo/ntrInfo 추가 필요. 상담 취소 액션 신규.
- **#7**: `app/today/page.tsx`, `lib/db/queries/nudge.ts`(`collectNudges`), `lib/domain/nudge.ts`(`weightedPickLeastRecorded`, behavior KST≥16 게이트 제거 대상), `lib/db/queries/observations.ts`. 모달·사전선택 딥링크·공지위젯 = 신규.
- **NEIS 급식**: `lib/integrations/neis.ts` `NeisMealEntry`에 `calInfo` 있음(공개 미노출). `NTR_INFO` 파싱은 미구현 → 추가 필요. `lib/db/queries/calendar.ts` `meal_cache` upsert 확장.
- **#9**: Next.js middleware 또는 루트 page에서 서버 UA 분기.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Subject(과목) | core domain | name | has one SemesterPlan; has many Section |
| SemesterPlan(학기계획) | core domain | unitHierarchy, examTargets | belongs to Subject; has many Unit |
| Unit(세부단원) | core domain | 대/중/소단원명, 6자리코드, 핵심개념[], minOrdinals | belongs to SemesterPlan; referenced by LessonPlanEntry |
| ExamTarget(시험별 목표진도) | supporting | examOrdinal(1/2), unitRangeFrom, unitRangeTo | belongs to SemesterPlan |
| LessonPlanEntry(차시계획) | core domain | ordinal, unitRef, content, keywords[] | belongs to Subject; references Unit |
| Section(분반) | core domain | sectionKey | belongs to Subject; has many Session |
| Session(진척도 차시) | core domain | status, planOrdinal, actualContent, keywords[] | belongs to Section; mirrors LessonPlanEntry |
| AttendanceRecord(출결기록) | core domain | kind, reason, noteField, date, period, editable | belongs to Student; report-required derived |
| FieldTrip(교외체험학습) | supporting | startDate, endDate, postReportSubmitted | generates AttendanceRecord[](인정결석/수업일) |
| TeacherNote(교사 한마디) | core domain | content, sortOrder, **targetScope(전체/학생목록)** | shown on Student public page |
| NoticeEvent(할일·공지) | supporting | title, **content(신규)**, at, editable | shown in 공지 widgets |
| CounselSlot(상담 슬롯) | core domain | date, capacity, remaining, reserved, **cancelRequest** | reserve/cancel(교사 승인) |
| Meal(급식) | supporting | date, menu[], calInfo, **ntrInfo(신규)** | NEIS sourced; table render |
| Nudge(넛지) | core domain | type(observation/behavior/report), targetStudent, targetSection, resolved | rendered in modal on /today |
| Student(학생) | core domain | name, grade, classNo | many records/notes/nudges |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 0 (topology) | 7 components | 7 | - | - | N/A |
| 1-3 | ~9 | SemesterPlan, Unit, ExamTarget, Pagination | - | core | 70% |
| 4-8 | ~13 | Session metrics, FieldTrip range, AttendanceRecord.editable | rates→ordinal | core | 85% |
| 9-12 | ~14 | TeacherNote.targetScope, Nudge granularity, Meal.ntrInfo | - | core | 93% |
| 13-14 | ~15 | CounselSlot.cancelRequest, Device routing | - | core | 97% |

## Interview Transcript
<details>
<summary>Full Q&A (14 rounds + Round 0)</summary>

### Round 0 — Topology
**Q:** 7개 최상위 컴포넌트 구획이 맞나요? **A:** 7개 그대로 맞음. (이후 R3에서 #8 페이지네이션, R14에서 #9 라우팅 추가 → 총 9개)

### Round 1
**Q:** 학기계획(세부단원)은 어느 단위? **A:** 과목별 1세트(현재와 동일).

### Round 2
**Q:** 페이지네이션 방식? **A:** 페이지 번호(1 2 3 …).

### Round 3
**Q:** 추가 페이지네이션 대상? **A:** 공지실/미제출/교외체험학습/행동특성·상담슬롯 전부(각 10개).

### Round 4
**Q:** 목표·실제 진도율 계산 기준? **A:** 둘 다 차시 수 기준.

### Round 5
**Q:** 초록/빨강 임계 기준? **A:** 차시 수 절대값 기준.

### Round 6
**Q:** 몇 차시 뒤지면 빨강? **A:** 2차시 이상.

### Round 7
**Q:** 신고서 필요 사유? **A:** (질병 AND 결석) OR 생리통. 인정·기타 불필요(현행 뒤집기).

### Round 8
**Q:** 교외체험학습 출결 반영 방식? **A:** 기간 전체 자동 인정결석(수업일 기준). 결석도 시작~최종일 입력 + 출결 수정 가능.

### Round 9
**Q:** 개별 공지 구조? **A:** 한마디에 대상 필드 추가(전체/특정학생 다수). (+공개페이지 병렬 표시)

### Round 10
**Q:** 교과관찰 넛지 단위? **A:** 분반 수업당 1개, 기록하면 해결.

### Round 11
**Q:** 넛지 모달 표시/닫기? **A:** 진입마다, 닫으면 세션 동안 미표시.

### Round 12
**Q:** 행동특성 넛지 시점? **A:** 종일 표시(16시 게이트 제거).

### Round 13
**Q:** 상담 취소 동작? **A:** 교사 승인 필요. (+예약 캘린더 미반영 버그 수정)

### Round 14
**Q:** 모바일 감지/적용 범위? **A:** 서버 User-Agent, 루트(/)만 /today 리다이렉트.

</details>
