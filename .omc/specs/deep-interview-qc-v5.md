# Deep Interview Spec: QC v5 — 재수정 8개 + 동아리실 신규 독립 컴포넌트

## Metadata
- Interview ID: qc-v5
- Rounds: 9 (Round 0 토폴로지 게이트 포함, 일부 라운드는 사용자 정정으로 재구성)
- Final Ambiguity Score: 3.8%
- Type: brownfield (Edu_Note · Next.js / Drizzle / Postgres)
- Generated: 2026-06-16
- Threshold: 0.05
- Threshold Source: 사용자 지시 (이번 run, resume note)
- Initial Context Summarized: yes (`report/qc-report-v5.md` + 재개 노트 요약 기반)
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.97 | 0.35 | 0.340 |
| Constraint Clarity | 0.96 | 0.25 | 0.240 |
| Success Criteria | 0.95 | 0.25 | 0.238 |
| Context Clarity | 0.97 | 0.15 | 0.145 |
| **Total Clarity** | | | **0.962** |
| **Ambiguity** | | | **0.038** |

## Topology
사용자 선택으로 재수정 8개를 **개별 컴포넌트**로 분리 → 총 9개 active 컴포넌트. Defer 없음.

| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| c1 수업계획실 | active | 단원명 자동채움·총차시·여유차시·차시이관 | AC-1.x 전부 |
| c2 진척도 | active | 차시기반 폐기→단원진도 일치도 재설계 | AC-2.x 전부 |
| c3 담임교실 라우팅 | active | 진입 시 자율진로활동으로 리다이렉트 | AC-3.1 (trivial) |
| c4 출결 | active | 교외체험 별도탭·동작통합·에스컬레이션 버튼 제거 | AC-4.x 전부 |
| c5 공지실 | active | 개별/전체 입력칸 분리·일괄 개별등록 | AC-5.x 전부 |
| c6 학생 안내 페이지 | active | 선택과목 색구분·급식 날짜경계·영양표기 | AC-6.x 전부 |
| c7 오늘의학교 | active | 넛지 지속·배너유지·급식표·과거일정·캘린더 메모 | AC-7.x 전부 |
| c8 상담 넛지 | active | 예약 후 상담일지 미작성 넛지 추가 | AC-8.1 |
| c9 동아리실 | active | 신규 독립 컴포넌트(허브+하위5) | AC-9.x 전부 |

## Goal
QC v5는 두 갈래다. ① 기존 독립 컴포넌트들의 **재수정 8건**을 각각 명세대로 고치고, ② **동아리실을 독립 컴포넌트(허브 + 하위 5: 개설/배정/활동계획/활동입력/생기부)로 격상**해, 교사 본인이 담당하는 **단일 동아리**의 운영 전 과정(부원 배정 → 학사일정 기반 차시 계획 → 차시별 공통/학생별 활동 입력 → 생기부 초안)을 기존 독립 컴포넌트(세팅실/교실/담임교실)의 허브·CRUD·생기부 패턴을 재사용해 구현한다.

## Constraints
- brownfield: 담임교실 `layout.tsx`(허브 레퍼런스), `classroom` first-child redirect, `homeroom/activities` CRUD 템플릿, `homeroom-record` 생기부 패턴을 재사용한다.
- 동아리실은 교사 **단일 동아리** 관리 전제. 부원은 담임반·분반·외부(타반) 학생이 섞일 수 있고, 외부 학생은 학생명단(`listStudents`, 연도 단위 전체·반 독립)에 선등록 후 전체 명단에서 수동 선택해 배정한다(`addClubMember` 확장).
- 동아리 활동입력은 `creativeActivityRecords.commonBody`(차시별 공통) + `creativeActivityStudentOverrides.body`(학생별)로 저장 — **기존 테이블 사용**. 생기부는 둘을 합쳐 `specialNoteDrafts type='club'` 초안 생성(byte 한도 3000, `BYTE_LIMITS["club"]`).
- 마이그레이션: 동아리 활동계획의 **예정활동(planned)** 저장처가 없으므로 차시별 예정활동을 담을 **신규 경량 테이블 1개** 필요(수업계획실의 `lesson_plans`↔session record 분리와 동형). 오늘의학교 캘린더 메모도 **신규 경량 테이블 1개**(date+content, today-only) 필요. 그 외 동아리 핵심 자산(clubs/clubMembers/creativeActivityRecords/specialNoteDrafts type=club)은 전부 존재.
- 출결: `field_trip_reports`/`attendance_records`/`report_tracking`(다형: attendanceRecordId|fieldTripId) **물리 테이블 유지**, 동작만 통합.
- 진척도: `class_sessions`(status) + `lesson_plans`(단원코드) + `exam_targets`(시험 목표진도) + `subjects.jipilMidEnabled/jipilFinalEnabled`(지필 시행여부) 재사용.

## Non-Goals
- 담임반 학생 전체를 여러 동아리에 자동/일괄 배정하는 기능(단일 동아리만 관리).
- `field_trip_reports`를 `attendance_records`로 물리 통합(동작 통합으로 대체).
- 에스컬레이션 수동 재계산 버튼 유지(제거, pg_cron 00:05만 신뢰).
- 지필 미시행 과목의 시험진도율 표기.
- 캘린더 메모를 학생 안내 페이지/타 캘린더에 노출(오직 오늘의학교).
- 메인 라우터 레이아웃 전면 재정비(동아리실+교무실·통계실·인쇄실 완료 후 별도 진행 — 향후 계획).

## Acceptance Criteria

### c1 수업계획실
- [ ] 세부단원 입력 시 동일 대단원 번호 → 대단원명 자동채움, 동일 중단원 번호 → 중단원명 자동채움. 소단원명은 항상 수동.
- [ ] 학기계획에 "현재까지 저장된 총 차시수"를 표시하고 대표분반 차시수와 비교(강제 아님, 다르면 넌지시 안내만).
- [ ] 맨 위 "여유 차시" 입력 필드 신설. (세부단원 차시합 + 여유차시) == 대표분반 차시면 안내 사라짐.
- [ ] 차시계획은 기획 순서대로 자동 채워 저장하되 수정 가능.
- [ ] 차시 옆 "여유차시로 등록" 토글 버튼: 누르면 그 차시부터 끝까지 단원코드/수업내용/핵심개념이 한 칸씩 뒤로 이관(예약 여유차시 슬랙 한도 내). 초과 시 버튼 비활성/경고. 다시 누르면 해제(내용 앞으로 당김).

### c2 진척도
- [ ] 차시 수행 체크 기반 폐기. "차시계획까지 저장된 과목"만 진척도 활성화.
- [ ] 실제 진도 = `status='done'` 차시 중 가장 마지막 단원코드에서 자동 도출(별도 입력 없음).
- [ ] 계획 진도 대비 실제 진도 일치도 표시. 시험별 목표진도(`exam_targets`)와 진도율 비교.
- [ ] `jipilMidEnabled` && `jipilFinalEnabled` 모두 false인(지필 미시행) 과목은 시험진도율 표기 생략, 단원진도만 표시.

### c3 담임교실 라우팅
- [ ] `app/homeroom/page.tsx`를 `redirect("/homeroom/activities")`(자율진로활동, 첫 탭)로 변경.

### c4 출결
- [ ] 교외체험학습 사후보고서를 별도 탭으로 승격(이름 "교외체험학습 등록", 위치 = 오늘 입력 다음). 기존 전탭 하단 중복 영구섹션 제거.
- [ ] "에스컬레이션 재계산" 버튼 제거(pg_cron 00:05 자동 재계산만 유지).
- [ ] 교외체험(인정결석)은 출결검색에 노출(이미 `addClubMember`→인정결석 attendance 생성으로 충족 — 회귀 없음 확인).
- [ ] 미제출 탭이 체험 사후보고서 미제출도 포함하도록 `listUnsubmittedAttendance`를 `report_tracking`(attendanceRecordId ∪ fieldTripId) union으로 확장.

### c5 공지실
- [ ] "교사 한마디"의 개별/전체 공지 입력칸 분리.
- [ ] 개별공지란: 학생을 토글로 선택. 전체공지란: `target_scope='all'`.
- [ ] 다수 학생 토글 선택 + 공통내용 + "추가" → 선택 학생 각자에게 **별도 개별공지 N개 생성**(이후 각자 수정/삭제 가능).

### c6 학생 안내 페이지
- [ ] 시간표 선택과목 글씨 색상을 공통과목과 다르게(선택 vs 공통 구분).
- [ ] 급식 날짜경계 즉시 반영: `get_public_page` 급식 필터의 `current_date`(UTC) → KST 날짜 기준으로 교정(자정~09:00 KST 지연 제거).
- [ ] 영양성분(NTR_INFO) 표기: 코드 경로(neis 파싱→meal_cache→get_public_page v4→렌더)는 정상. 영양 마이그 이전 캐시 행 **재동기화**로 표기 복원. 메뉴 배열 렌더(`public-page-view.tsx:424`) 줄바꿈 결함도 함께 점검.

### c7 오늘의학교
- [ ] 넛지: 해결 전까지 오늘의학교 진입마다 모달 표시(현재 sessionStorage dismiss 제거).
- [ ] "다음에 하기"는 모달만 닫고 상단 넛지 배너는 유지(모달 dismiss가 배너를 숨기지 않게).
- [ ] 급식표: 메뉴 글자 길이에 따라 너비가 깨지지 않도록 동적 조절 또는 표기 방식 수정.
- [ ] 캘린더 전체기간 조회: 쿼리를 today+30일 고정 → 조회 중인 월 범위로 변경(과거 달도 당시 학사일정·상담 노출).
- [ ] 캘린더 메모(신규, 오늘의학교 전용): 특정 날 클릭 → 모달로 그날 학사일정·상담·메모 표시, 하단 "일정 추가하기"로 메모 추가(일자별 다건, 수정/삭제). **오직 오늘의학교 캘린더에서만** 노출.

### c8 상담 넛지
- [ ] 예약 슬롯 시각이 지난 뒤에도 상담일지(`createCounselingLog`)가 없는 예약을 오늘의학교 넛지에 추가(신규 넛지 타입).

### c9 동아리실
- [ ] 기존 평면 `app/club`을 독립 컴포넌트 `/clubroom`로 격상: 허브 셸(`layout.tsx`, 담임교실 패턴) + `page.tsx` = `redirect("/clubroom/create")`(first-child).
- [ ] 하위 라우트 5개: `/clubroom/{create,assign,plan,entry,record}`.
- [ ] 개설(create): 교사 단일 동아리 생성(`createClub` 재사용).
- [ ] 배정(assign): 전체 학생명단(`listStudents`)에서 수동 선택해 부원 배정(`addClubMember`). 외부 학생은 학생명단 선등록으로 후보에 포함.
- [ ] 활동계획(plan): 학사일정 `calendarEvents.eventKind='club'` 날짜 시퀀스 → 차시(ordinal) 자동 생성(`representativeDates` 패턴 재사용), 차시별 날짜 표기 + 예정활동 기입(신규 경량 테이블 저장).
- [ ] 활동입력(entry): 차시별 공통 활동(`creativeActivityRecords.commonBody`, area='club', clubId) + 학생별 메모(`creativeActivityStudentOverrides.body`).
- [ ] 생기부(record): 공통+개별을 합쳐 `specialNoteDrafts type='club'` 초안 생성(`saveHomeroomRecordDraft` 패턴 + byte 한도). `collectClubRecordSources`(area='club', clubId 필터) 신규 쿼리.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 동아리 배정 = 담임반 학생 전체를 여러 동아리에 배치 | 사용자 정정 | 교사 단일 동아리만 관리. 전체 학생명단에서 수동 선택, 외부 학생은 명단 선등록(현 아키텍처로 이미 가능) |
| 동아리 활동계획 = 자유형 메모 | 사용자 정정 | 학사일정 club 이벤트 기반 차시 자동생성 + 날짜표기 + 예정활동 기입 |
| 활동입력 = 단일 단위 | 단위 질문 | 차시별 공통(commonBody) + 학생별(override) 둘 다, 생기부에서 병합 |
| "마이그 불필요"(재개 노트) | 예정활동 저장처 점검 | 활동계획 예정활동 + 캘린더 메모용 신규 경량 테이블 각 1개 필요로 정정 |
| 출결 테이블을 물리 통합해야 함 | Contrarian: 합치지 않아도 목표 달성 | 물리 테이블 유지, 미제출 union·중복제거로 동작만 통합 |
| 에스컬레이션 재계산 버튼 필요 | 의미 설명 | pg_cron과 중복 → 버튼 제거 |
| 진척도 실제 진도 입력 방식 불명 | Simplifier: 가장 단순한 것 | 완료 차시 마지막 단원코드 자동 도출 |
| "지필 안 보는 과목" 판정 불명 | 코드 확인 | `jipilMidEnabled`/`jipilFinalEnabled` 플래그로 판정(기존 존재) |
| 영양 표기 미구현 | 코드 경로 추적 | v4에 완전 구현됨 → 미표기는 stale cache·날짜경계(UTC) 버그(실행단계 수정) |
| 일괄 공지 = 1건 다중타겟 | 의미 질문 | 선택 학생 각자에게 별도 개별공지 N개 생성 |
| 과거일정 = 요약 리스트 | 화면 확인 | 캘린더 전체기간 조회(월 네비게이션) |
| 상담 넛지 = 예약 직후 | 시점 질문 | 예약 슬롯 시각 경과 후 미작성 시 발화 |

## Technical Context
- **허브 레퍼런스:** `app/homeroom/layout.tsx`(TABS 배열, async Server Component, 게이팅, nav), `app/classroom/page.tsx`(first-child `redirect`).
- **하위 CRUD 템플릿:** `app/homeroom/activities/{page.tsx,actions.ts}`("use server"→getOwnerId→멤버십검증→쿼리→writeAudit→revalidatePath), 페이지네이션 `lib/db/pagination.ts` + `lib/ui/paginator.tsx`.
- **생기부 패턴:** `lib/db/queries/homeroom-record.ts`(collectRecordSources/saveHomeroomRecordDraft), byteLength(한글3·\n2·기타1, `lib/domain/byte-count.ts`).
- **동아리 자산(존재):** `clubs`/`clubMembers`(misc.ts), `creativeActivityRecords`+`creativeActivityStudentOverrides`(records.ts:79-104), `specialNoteDrafts type='club'`, `lib/db/queries/clubs.ts`.
- **학사일정:** `calendarEvents.eventKind`(enums.ts:116, 'club' 포함), `lib/domain/calendar-keywords.ts`(classifyOne "동아리"→club), `representativeDates`(lesson-plan.ts:60).
- **출결:** `lib/db/queries/attendance.ts`(addFieldTrip:239, listUnsubmittedAttendance:580), `lib/db/queries/escalation.ts:104`(recomputeEscalation).
- **급식/공개:** `lib/integrations/neis.ts`(parseMealService:122, cleanMealMenu:110), `lib/db/queries/calendar.ts`(meal_cache sync:116), `lib/db/migrations/0036_get_public_page_v4.sql`(meals:167), `app/p/[token]/public-page-view.tsx:421`.
- **진척도:** `lib/db/queries/progress.ts:398`(getSectionProgressStats), `subjects.jipilMidEnabled/jipilFinalEnabled`(classes.ts:74-75), `exam_targets`(records.ts:176).
- **넛지:** `lib/domain/nudge.ts:111`, `app/today/{page.tsx,nudge-modal.tsx}`, `app/nudge-banner.tsx`, `app/today/events-calendar.tsx:30`.
- **상담:** `lib/db/queries/counseling.ts`(openCounselSlot/reserveCounselSlot/createCounselingLog/listHomeroomUpcomingReservations).

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Club | core domain | id, ownerId, name | has many ClubMember; has many ClubActivitySession |
| ClubMember | core domain | clubId, studentYearId, desiredCareer | belongs to Club; refs StudentYear |
| ClubActivitySession (신규) | core domain | clubId, ordinal, date, plannedActivity | belongs to Club; sourced from CalendarEvent(kind=club) |
| CreativeActivityRecord | supporting | area=club, activityDate, commonBody, clubId | has many StudentOverride |
| CreativeActivityStudentOverride | supporting | recordId, studentYearId, body | belongs to Record; refs StudentYear |
| SpecialNoteDraft | supporting | type=club, content, byteCount, status | refs Club/Student (생기부 초안) |
| StudentYear | core domain | sid(grade·classNo·number) | roster(연도 전체); refs by club/homeroom/enrollment |
| LessonPlan | core domain | ordinal, unitCode(major·mid·minor), keywords, slackSessions(신규) | belongs to CourseSection |
| ClassSession | core domain | date, status(planned/done/not_held), unitCode | drives 진척도 |
| ExamTarget | supporting | subjectId, examOrdinal, unitFrom/ToCode | 시험 목표진도 |
| FieldTripReport | supporting | studentYearId, startDate, endDate | refs ReportTracking(fieldTripId) |
| AttendanceRecord | core domain | date, reason(accepted=인정결석), reportRequired | refs ReportTracking(attendanceRecordId) |
| ReportTracking | supporting | attendanceRecordId\|fieldTripId, deadlineDate, tier | 다형: 출결∪체험 |
| TeacherNote | core domain | targetScope(all/individual), body | has many TeacherNoteTarget |
| TodayCalendarMemo (신규) | supporting | ownerId, date, content | today-only 표시 |
| CounselReservation | core domain | slotId, datetime, studentYearId | 넛지: 시각 경과+로그 없음 |
| CounselingLog | supporting | reservationId, target, body | belongs to Reservation |
| MealCache | external | date, payload{menu[], calInfo, ntrInfo} | NEIS 동기화 |

## Ontology Convergence
| Round | 핵심 엔티티 변화 | Stability |
|-------|------------------|-----------|
| R0 | 9 컴포넌트 토폴로지 확정 | N/A |
| R1 | Club/ClubMember/StudentYear 안정, ClubActivitySession 신규 | 신규 도입 |
| R2 | CreativeActivityRecord/StudentOverride/SpecialNoteDraft 매핑 확정 | 상승 |
| R3-R4 | FieldTripReport/AttendanceRecord/ReportTracking(다형) 안정 | 상승 |
| R5-R6 | LessonPlan(slackSessions 신규)/ClassSession/ExamTarget 안정 | 상승 |
| R7-R9 | TeacherNote/TodayCalendarMemo(신규)/CounselReservation/CounselingLog/MealCache 안정 | 수렴 |

신규 엔티티는 ClubActivitySession·TodayCalendarMemo 2개(각 신규 경량 테이블)로 수렴. 나머지는 모두 기존 스키마 재사용.

## Interview Transcript
<details>
<summary>Full Q&A (Round 0 토폴로지 + 9 라운드)</summary>

### Round 0 — 토폴로지 확인
**Q:** QC v5를 5개 top-level 컴포넌트(동아리실 + 수업·진도 / 담임영역 / 학생안내 / 오늘의학교·상담 그룹)로 읽었다. 맞는가?
**A:** "재수정 8개 분리" → 재수정 8개를 개별 컴포넌트로 → 총 9개 active.

### Round 1 — 동아리 배정 (정정 후 재구성)
**Q(초안):** 동아리 배정은 어떤 방식? **A(정정):** 담임반 학생 전체를 여러 동아리에 배치하는 게 아니라 교사 단일 동아리만 관리. 담임반·분반·외부 학생이 섞일 수 있고 외부 학생은 학생명단에 선등록 후 일부만 배정.
→ 코드 조사: 학생명단은 연도 전체·반 독립, clubMembers는 studentYearId만 FK → 외부 학생 선등록·배정 이미 가능.

### Round 1(재) — 동아리 활동계획
**Q:** 활동계획은 무엇을 담나? **A:** 학사일정 파싱으로 동아리 활동 날 체크 → 차시 형성, 차시 옆 날짜 표기, 거기에 예정 활동 기입.
→ 조사: calendarEvents.eventKind='club' 자동분류 존재, 차시 생성 로직은 신규.

### Round 2 — 활동입력↔생기부 단위
**Q:** 활동입력은 누구 단위? 생기부와 연결은? **A:** "둘 다 (공통활동 + 학생별 메모)".
→ creativeActivityRecords.commonBody + creativeActivityStudentOverrides 로 마이그 없이 지원 확인.

### Round 3 — 에스컬레이션 버튼
**Q:** cron과 중복인 재계산 버튼 어떻게? **A:** "제거 (cron만 신뢰)".

### Round 4 (Contrarian) — 출결 테이블 통합
**Q:** 물리 통합 vs 동작 통합? **A:** "합치지 않고 동작 통합 (추천)".

### Round 5 — 여유차시 이관
**Q:** 슬랙 부족 오버플로·되돌리기? **A:** "슬랙 한도내·토글 해제".

### Round 6 (Simplifier) — 진척도 실제진도 포착
**Q:** 현재 단원 진도를 어떻게 아나? **A:** "완료 차시 단원코드에서 자동 도출 (추천)".
→ 지필 판정은 jipilMid/FinalEnabled 플래그 사용(코드 확인).

### Round 7 — 공지 일괄등록 의미
**Q:** 다수 선택+공통내용+추가의 결과물? **A:** "선택 학생 각자에게 별도 개별공지 N개 생성".

### Round 8 — 오늘의학교 과거일정
**Q:** 어떤 화면을 고치나? **A:** "캘린더 전체기간 조회 가능".
→ c6 영양표기는 코드 경로 완전 구현 확인 → stale cache·UTC 날짜경계 버그로 판정(질문 불필요).

### Round 9 — 상담 넛지 시점
**Q:** 넛지 발화 시점? **A:** "예약 시간이 지난 후 미작성시 (추천)".

</details>
