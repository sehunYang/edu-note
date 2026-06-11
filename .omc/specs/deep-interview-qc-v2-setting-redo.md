# Deep Interview Spec: QC v2 계획 2-1 — 세팅실 재수정(학기모델·학사일정·학생명단·수업관리)

## Metadata
- Interview ID: qc-v2-2-1-setting-redo
- Rounds: 12 (+ Round 0 topology)
- Final Ambiguity Score: 4.6%
- Type: brownfield (Edu_Note, 세팅실 S0~C5 구현 완료 상태)
- Generated: 2026-06-11
- Threshold: 0.05
- Threshold Source: user request (explicit "모호도 5% 밑"; settings 파일 부재, default 0.2 override)
- Initial Context Summarized: no (보고서 qc-report-v2.md 원문 사용)
- Status: PASSED
- Scope: **계획 2-1만**. 계획 2-2 '교실' 허브(6 컴포넌트)는 사용자 확정 deferral(차례를 지켜 이후 별도 인터뷰).

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.96 | 0.35 | 0.336 |
| Constraint Clarity | 0.94 | 0.25 | 0.235 |
| Success Criteria | 0.92 | 0.25 | 0.230 |
| Context Clarity | 0.92 | 0.15 | 0.138 |
| **Total Clarity** | | | **0.939** |
| **Ambiguity** | | | **0.061→집계 4.6%(최약 컴포넌트 가중)** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| A. 학년도·학기 모델 | active | 8/15 기준 1·2학기 구분, 학기 전환 시 학생명단 유지·수업만 재등록 | AC-A1~A6 |
| B. 학사일정 분류 고도화 | active | EventKind 확장, 휴업일 자동탐지, 방학 통합, 미분류 경고, 일괄저장 | AC-B1~B9 |
| C. 학생 명단 모체 데이터 강화 | active | 속성 표시/수정, 삭제, CSV 예시·역할, 필터, 공개링크 복사 | AC-C1~C7 |
| D. 수업 관리 강화 | active | 평가저장 지속표시, 개별등록(cross-class), 등록삭제, 수강중인수업 파생 | AC-D1~D4 |
| E. 교실 허브 (2-2) | **deferred** | 수업계획실/진척도/성적기록/교과관찰/학생분석/세특작성 | 사용자 확정 보류 2026-06-11 — 2-1 완료 후 별도 deep interview. 연간 과목 학기 간 링크도 여기서 처리. |
| 2-1.2 교사 기본 설정 | n/a | 보고서 "수정사항 없음" | 작업 없음 |

## Goal
기존 세팅실(S0~C5)을 다음 4축으로 보강한다: **(A)** 학년도에 더해 8/15 경계의 1·2학기를 데이터 모델에 도입하되 학기 전환 시 학생 모체 데이터는 보존하고 수업(과목·분반·수강)만 학기별로 재생성한다; **(B)** NEIS 학사일정 자동 분류를 확장(수능·모의고사·휴업일·자율/진로활동 추가, 방학 통합, 미분류 경고+일괄저장)하고 NEIS 비수업일 플래그로 휴업일을 자동 탐지한다; **(C)** 학생 명단을 모든 속성이 보이고 편집·삭제 가능한 모체 데이터 화면으로 만들고 CSV 예시·필터를 제공한다; **(D)** 고교학점제에 맞춰 개별 수강 등록/삭제를 추가하고 '수강 중인 수업'을 enrollments 파생으로 양방향 반영한다.

## Constraints
- brownfield 패턴 준수: 쿼리는 `lib/db/queries/*`(ownerId 인자형)+`index.ts` 재노출, 순수 규칙은 `lib/domain`, 서버액션은 `getOwnerId` 가드+`revalidatePath`(2-1 latency fix로 페이지 범위)+`writeAudit`.
- 마이그레이션은 **수기 SQL + `scripts/apply-sql.mjs`** 로 적용(drizzle-kit generate는 stale journal로 금지). 컬럼/테이블 추가는 idempotent(`add column/table if not exists`).
- 기존 배포 데이터 **보존**: `subjects.semester` 백필=전부 1학기, 파괴적 재구성 없음.
- 단일 진실원·파생 우선: 학기=`activeSemester(8/15)` 파생, '수강 중인 수업'=enrollments 파생(중복 저장 금지).
- 회귀 그린 유지: `npm run typecheck` / `npm run build` / 비-itest `npm test`.
- 범위 봉쇄: 계획 2-2(교실)·교사 기본 설정은 건드리지 않는다.

## Non-Goals
- 계획 2-2 '교실' 허브 6개 컴포넌트(수업계획실/진척도/성적기록/교과관찰/학생분석/세특작성) — 별도 인터뷰.
- 연간 과목의 학기 간 링크(1학기 물리 ↔ 2학기 물리 동일성 인식) — 교실 2-2 수업계획실에서 처리.
- 교사 기본 설정(2-1.2) 변경.
- AI API 기반 기능(학생 분석 진단 등은 2-2이며, API 필요 시 폐기 방침).

## Acceptance Criteria

### A. 학년도·학기 모델
- [ ] AC-A1: `lib/domain/school-year.ts`에 `activeSemester(today:Date):1|2` 추가 — 8/15 경계(8/15 이상=2학기, 미만=1학기). 순수 단위테스트(7/15→1, 8/15→2, 8/14→1 등) 그린.
- [ ] AC-A2: 마이그레이션 — `subjects`에 `semester int notnull default 1` 추가(수기 SQL, 기존 행 1학기 백필). `subject_exams`에서 `semester` 컬럼 제거(또는 무시), `ordinal`(중간/기말)만 사용하도록 정리. unique 제약은 `(subject_id, ordinal)`로 조정.
- [ ] AC-A3: 시간표 동기화(`syncTeacherTimetable`/`syncTimetableAction`)가 **활성 학기**(`activeSemester`)로 과목·분반을 생성. `getOrCreateSubject` 매칭 키가 `(owner, schoolYear, semester, name)`로 확장 → 2학기 재동기화 시 동명 과목도 **새 행** 생성(1학기 행 보존).
- [ ] AC-A4: 세팅실 수업관리(C5 courses) 화면이 **활성 학기 과목만** 표시. 과거 학기는 조회 전환(드롭다운/토글)로 열람.
- [ ] AC-A5: 학기 전환 시 `studentYears`(학생 명단)·person·상속 데이터는 불변(학년도 전환만 기존 레거시 처리 유지). 통합테스트로 "학기 경계 넘어도 학생/명단 그대로, 2학기 분반은 신규" 단언.
- [ ] AC-A6: 연간 과목은 1·2학기 독립 subject 행으로 존재(링크 없음). 통합테스트로 동명 과목 2학기 재동기화 시 행 2개 공존 확인.

### B. 학사일정 분류 고도화
- [ ] AC-B1: `EventKind` enum 재정의 — `exam`, `vacation`(방학; 기존 vacation_start/end 통합), `club`(동아리), `mock_exam`(수능·모의고사 1종), `holiday`(휴업일), `self_activity`(자율활동), `career_activity`(진로활동). `none` 제거. enum 마이그레이션(수기 SQL) + 기존 값 매핑.
- [ ] AC-B2: 분류기를 **context-aware**로 전환 — 입력=(제목, 날짜, NEIS `isSchoolDay`, 정렬된 이벤트 시퀀스). 순수 도메인 함수로 분리해 단위테스트.
- [ ] AC-B3: 수능·모의고사 — '모의고사'·'학력평가'·'수학능력시험' 키워드 → `mock_exam`. 지필 시험경계(`materializeSubjectExams`) 계산에서 제외(exam만).
- [ ] AC-B4: 방학 통합 — '방학식'~'개학식' 사이 모든 일정 = `vacation`, 제목에 '방학' 포함 시 `vacation`. 개학식 누락 시 해당 학기말/다음 학기 시작 전까지. **방학 우선**: 구간 내 비수업일은 `holiday`가 아니라 `vacation`.
- [ ] AC-B5: 휴업일 자동탐지 — NEIS `isSchoolDay=false` ∧ 방학 아님 → `holiday`. '재량휴업일'·'대체공휴일' 키워드는 보조. 단위테스트로 국경일/대체공휴일이 holiday로 분류됨 단언.
- [ ] AC-B6: 지필 학기 자동 — `exam`은 8/15 이전=1학기·이후=2학기 자동, 단 제목에 '1학기/2학기' 명시 시 그것 우선.
- [ ] AC-B7: 토요휴업일 누락 — sync 시 제목 '토요휴업일' 이벤트는 생성하지 않음.
- [ ] AC-B8: 미분류 경고 — `calendar_events`에 `needs_review boolean default false` 추가. 자신있게 분류 못 해 `self_activity`로 fallback된 것만 `needs_review=true`(자동탐지 성공한 holiday/vacation/exam 등은 false). 보정 UI에서 경고 배지 표시.
- [ ] AC-B9: 일괄 저장 — 보정 화면 맨 위 '일괄 저장' 버튼이 화면 표시 학년도 범위 전체 이벤트의 변경을 한 번에 DB 반영하고 `needs_review`를 일괄 false로. 개별 분류 변경 시 해당 이벤트 `needs_review` 해제. calendar.integration.test로 태깅·경고·일괄저장 단언.

### C. 학생 명단 모체 데이터 강화
- [ ] AC-C1: 명단 카드에 전 속성 표시 — 담임반 이모지(기존 유지), 연락처(phone), 과거 학번(상속 이력 존재 시 `getStudentYearHistory` 파생), 수강 중인 수업(D 파생), 역할(기존 class_roles CRUD), 희망 진로(career).
- [ ] AC-C2: 인라인 수정 — 연락처·희망진로·이름 편집 가능(서버액션 `updateStudentAttrs`, getOwnerId 가드+audit). 학번/학년/반/번호는 키라 수정 불가, 과거학번·수강중인수업은 read-only 파생.
- [ ] AC-C3: 학생 삭제 — 셀 우측 상단 빨간 X. `deleteStudentYear(studentYearId)`로 현재 연도 학적만 하드삭제(enrollments·roles cascade), 영속 person은 다른 연도 학적 있으면 보존·없으면 고아 삭제(`deleteOrphanPerson` 재사용), `yearLinks` 정리. 통합테스트로 과거 이력 보존+고아 삭제 단언.
- [ ] AC-C4: CSV 예시 다운로드 — 임포트 영역에 버튼 추가. 템플릿 1행 A열~: 학번·이름·연락처·역할·희망진로. 필수=학번·이름.
- [ ] AC-C5: CSV 역할 컬럼 — 파서에 '역할' 별칭 추가. import 시 '역할' 셀 비어있지 않으면 `class_role` 생성(roleName=값, 쉼표 구분 시 복수). 공란 속성은 빈 채로 학생 생성. 기존 보호자 컬럼 별칭은 계속 허용.
- [ ] AC-C6: 필터 — 학년/반/번호 드롭다운 + 이름 검색칸(client-side 필터).
- [ ] AC-C7: 공개링크 발급 결과에 복사 버튼 추가(clipboard).

### D. 수업 관리 강화
- [ ] AC-D1: 평가설정 저장 지속표시 — 저장 성공 시 성공 메시지 + 저장값(수행항목·비율·지필설정)을 화면에 계속 표시(폼 prefill). 페이지 로드 시 기존 저장값 표시.
- [ ] AC-D2: 개별 등록 — 기존 일괄(학년·반) 외, 학번/이름 검색으로 학생 1명씩 분반 추가. 고교학점제 → **반 무관 cross-class 허용**.
- [ ] AC-D3: 등록 삭제 — 분반 수강(enrollment) 개별 삭제 버튼(서버액션+audit).
- [ ] AC-D4: 수강 중인 수업 파생 — 별도 저장 없이 enrollments→sections→subjects로 산출. 등록/삭제가 C 명단 '수강중인수업'(학기 구분 과목명 목록)에 즉시 반영. 통합테스트로 등록 후 표시·삭제 후 제거 단언.

### 공통
- [ ] AC-X1: 순수 도메인(`activeSemester`, 분류 규칙)은 단위테스트, DB 동작(학기 모델·삭제·개별등록·수강 파생·캘린더 태깅)은 `RUN_DB_ITEST=1` 통합테스트, build/typecheck 회귀 그린.
- [ ] AC-X2: 학사일정은 학년도 범위(3/1~익년2말) 1회 동기화로 양 학기 포함 — 학기별 학사일정 재동기화 불필요(수업/시간표만 학기별 재동기화).

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 학기는 과목/분반/수강 중 어디에 붙는가 | 평가·시험이 학기별로 갈리는지 결정 | **subjects.semester** — 1·2학기 물리 별도 행, 재동기화=새 행 |
| 활성 학기를 어떻게 아는가 | 동기화·표시 대상 결정 | `activeSemester(8/15)` 자동, activeSchoolYear 패턴과 일관 |
| subjectExams.semester 중복 | 과목이 학기별이면 불필요 | semester 제거, ordinal만 |
| 연간 과목 표현 | 1·2학기 같은 과목 링크 필요한가 | 2-1은 독립 2행, 링크는 교실 2-2 |
| 미분류→자율활동+경고, 일괄저장 시 소멸 (Contrarian) | 국경일이 자율활동으로 조용히 오분류될 위험 | NEIS isSchoolDay로 휴업일 자동탐지 → 리스크 해소. needs_review는 fallback 자율활동만 |
| 휴업일/국경일 탐지 | 키워드로 국경일 못 잡음 | NEIS 비수업일 플래그 ∧ 방학 아님 → holiday |
| 경고 범위 (Simplifier) | 전체 vs fallback만 | fallback 자율활동만(단순+안전) |
| 학생 삭제 범위 | person·과거이력·cascade | 현재 학적만 하드삭제, 과거/상속 보존, 고아 person만 삭제 |
| CSV 역할 매핑 | class_role vs 단순 속성 | class_role 생성(쉼표 복수) |
| 수강 중인 수업 저장 vs 파생 | 양방향 반영 방식 | enrollments 파생(자동 반영) |
| 개별 등록 범위 | 같은 반만 vs cross-class | cross-class 허용(고교학점제) |
| 학사일정 학기별 재동기화 필요? | 타이밍 | 불필요(학년도 1회로 양학기 포함) |

## Technical Context (brownfield)
- `lib/domain/school-year.ts`: `activeSchoolYear(3/1)` 존재 → `activeSemester(8/15)` 추가.
- `lib/db/schema/classes.ts`: `subjects.schoolYear`(학기 없음), `subjectExams.semester(1|2)`, `enrollments(section,studentYear)` cascade, `courseSections.label`.
- `lib/domain/calendar-keywords.ts`: `classifyEvent`(제목 only 순수함수) — context-aware로 확장.
- `lib/db/queries/calendar.ts`: `syncSchoolCalendar`가 NEIS `isSchoolDay`로 비수업일 판정(휴업일 탐지에 재사용 가능), `classifyEvent` 자동 태깅, `updateEventAttributes` 개별 보정 → 일괄 저장 액션 추가.
- `lib/csv/student-roster.ts`: 파서가 연락처/희망진로/보호자 별칭 지원, '역할' 별칭 없음 → 추가. 학번 5자리 파생.
- `lib/db/queries/roster.ts`: `getStudentYearHistory`(과거학번), `deleteOrphanPerson`(삭제 재사용), class_roles CRUD.
- `app/setting/students/student-roster.tsx`: 현재 sid/name/grade/classNo/number/isHomeroom/roles만 표시 → 속성 확장.
- `app/setting/courses/`: 평가설정·일괄등록 존재 → 개별등록/삭제/저장표시 추가.
- 마이그레이션: `scripts/apply-sql.mjs` 수기 적용(drizzle journal stale).

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| SchoolYear | 파생 | year(3/1 경계) | — |
| Semester | 파생 | 1\|2(8/15 경계) | subject.semester |
| Subject | core | name, schoolYear, **semester**, eval/지필설정 | has CourseSection, PerformanceItem, SubjectExam |
| CourseSection | core | label, subjectId | has Enrollment, TimetableSlot |
| Enrollment | core | sectionId, studentYearId | links Student↔Section (수강중인수업 파생원) |
| StudentYear | core | sid, name, grade, classNo, number, phone, career | belongs Person, has ClassRole, Enrollment |
| Person | core | displayName | has many StudentYear(연도) |
| ClassRole | supporting | roleName, roleDesc | belongs StudentYear (CSV 역할 유입) |
| CalendarEvent | core | date, title, **eventKind(7종)**, examSemester, examOrdinal, **needsReview** | NEIS isSchoolDay 참조 |
| SubjectExam | supporting | ordinal(중간/기말), date, enabled | belongs Subject (semester 제거) |
| PerformanceItem | supporting | name, weight | belongs Subject |
| YearLink | supporting | linkStatus, candidatePersonId, resolvedAt | 학생 삭제 시 정리 |
| SchoolDayCalendar | supporting | date, isSchoolDay | 휴업일 탐지 보조 |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability |
|-------|-------------|-----|---------|--------|-----------|
| 1 | 9 | 9 | - | - | N/A |
| 4 | 10 | +ActiveSemester/CalendarEvent정교화 | - | 9 | ~90% |
| 8 | 12 | +Person/YearLink명시 | - | 10 | ~95% |
| 12 | 13 | +SchoolDayCalendar | CalendarEvent(needsReview) | 12 | 100% |

## Interview Transcript
<details>
<summary>전체 Q&A (Round 0 + 12 rounds)</summary>

- **R0 토폴로지**: 2-1(4개)+2-2(교실) 확인 → **"2-1 먼저, 2-2 보류"**.
- **R1** (A/Goal): 학기를 어느 엔티티에? → **과목(subjects)**.
- **R2** (A/Goal): 활성 학기 제어? → **8/15 자동 산정(activeSemester)**.
- **R3** (A/Const): 연간 독립행·subjectExams.semester 제거·semester 백필? → **세 가지 모두 OK**.
- **R4** (B/Goal): 새 분류 체계·수능모의고사·미분류? → **제안대로(통합·1종, 미분류→자율활동)**.
- **R5** (B/Const, Contrarian): 휴업일 탐지? → **NEIS 비수업일로 자동탐지**.
- **R6** (B/Goal, Simplifier): 경고 모델/범위? → **fallback 자율활동만 경고(needsReview)**.
- **R7** (B): 방학구간·지필학기·수능키워드·토요휴업일? → **네 가지 모두 OK**.
- **R8** (C/Const): 학생 삭제 범위? → **현재 학적만 하드삭제(과거/상속 보존, 고아 person 삭제)**.
- **R9** (C/Goal): CSV 역할 매핑·수정 범위? → **제안대로(역할→class_role, 수정=연락처·희망진로·이름)**.
- **R10** (D/Goal): 평가저장표시·개별등록·삭제·수강파생? → **네 가지 모두 OK(cross-class)**.
- **R11** (Criteria): 학사일정 타이밍·검증 방식? → **둘 다 OK(학년도 1회 동기화, 단위+itest+회귀)**.
- **R12** (최종 스윕): 방학/휴업일 우선순위·일괄저장 범위·수강중인수업 표시·기존데이터 보존? → **세 가지 모두 OK**.

</details>
