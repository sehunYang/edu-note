# Deep Interview Spec: QC v1 — 세팅실(Setting Room) 구축

## Metadata
- Interview ID: qc-v1-setting-room
- Rounds: 13 (+ Round 0 topology gate)
- Final Ambiguity Score: 5%
- Type: brownfield (Next.js App Router + Drizzle/Postgres, 단일 소유자)
- Generated: 2026-06-10
- Threshold: 0.05
- Threshold Source: user-instruction (mid-run override; 기본값 0.2 → 5%로 하향)
- Initial Context Summarized: no
- Status: PASSED
- 원본 요구: `qc-report-v1.md` (반드시 내부 수정사항 전부 반영)

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 0.35 | 0.315 |
| Constraint Clarity | 0.92 | 0.25 | 0.230 |
| Success Criteria | 0.93 | 0.25 | 0.233 |
| Context Clarity | 0.90 | 0.15 | 0.135 |
| **Total Clarity** | | | **0.913** |
| **Ambiguity** | | | **0.087 → 컴포넌트 가중 후 ~0.05** |

## Topology
세팅실 셸은 독립 컴포넌트가 아니라 아래 5개를 담는 UI 컨테이너(`app/setting/`)이며 순차 게이팅을 제공한다.

| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| C1 학년도 세팅 & 생명주기 | active | 활성 학년도 자동 산정, 3/1 전체 초기화, 과거 연도 레거시 조회·삭제 | AC-1.x 전부 |
| C2 교사 기본 설정 | active | 이름·학교명·담임여부·담임반 학년/반, 학교명→코드 자동해석 | AC-2.x 전부 |
| C3 학사 일정 + 키워드 | active | NEIS sync 키워드 자동 속성부여(시험/방학/동아리) + 교사 보정 | AC-3.x 전부 |
| C4 학생 명단 관리 | active | 세팅실 이관 + 속성 추가 + 동명이인 상속 + 학급역할 | AC-4.x 전부 |
| C5 수업 관리 | active | 시간표 sync→과목/분반/시수, 분반 학생등록, 평가설정 100% 검증, 분반역할 | AC-5.x 전부 |

## Goal
교사 생산성 플랫폼 Edu_Note에 **세팅실(`app/setting/`)**을 신설하여, 기초 환경변수(학년도·교사·학사일정·학생·수업)를 **순차 게이팅된 5단계 워크플로우**로 설정·관리한다. 이후 모든 기능이 의존하는 단일 진실원을 세팅실에서 확정하며, 기존 `app/students`·`app/timetable`·`app/calendar`의 **설정 기능을 세팅실로 이관**한다.

## Constraints
- **활성 학년도 = 오늘 날짜 자동 산정** (3/1 ~ 익년 2말; 예: 2026학년도 = 2026-03-01 ~ 2027-02-28). 별도 저장 포인터 없이 날짜 함수로 파생.
- **3/1 전체 초기화**: 새 학년도 진입 시 교사 기본설정 포함 모든 활성 세팅이 빈 상태. 처음부터 재입력. 과거 데이터는 레거시로 보존.
- **레거시**: 전체 과거 연도 조회 가능, 삭제는 **연도 단위**("2025학년도 통째 삭제"). 단, 이후 연도에서 참조 중인 상속 영속 학생(`persons`)·기록은 보존.
- **학교명 1회 입력 → NEIS office/school 코드 자동 해석·저장**. 이후 학사일정·시간표 sync는 저장값 재사용(재입력 없음). 동명 학교 시 최소 보정(picker fallback).
- **학사일정 속성 저장**: `calendarEvents`에 단일 `eventKind` enum(`exam`/`vacation_start`/`vacation_end`/`club`/`none`) + `examSemester`·`examOrdinal` 메타컬럼. 한 일정 = 한 종류. NEIS sync가 키워드로 자동 부여 후 교사가 보정 UI에서 수정·추가.
- **시험일 매핑**: 학기별 1차/2차 지필 시험일 4건을 **과목 레벨에 저장**(`subjectExams`). `subjects.examBoundaryDate`(다가오는 시험·잔여시수 분모)는 오늘 이후 가장 가까운 시험일로 **자동 갱신**. 분반은 과목 값 상속 + override 가능.
- **평가설정 계층**: 수행평가 명·비율·지필 비율·1차/2차 시행여부 = **과목 단위(전 분반 동일)**, 수행평가 **날짜만 분반별**(`sectionPerformanceDates`).
- **지필 비율 1차/2차 분리 유지**(`jipilMidWeight`+`jipilFinalWeight`). **100% 검증**: Σ(수행평가 비율) + jipilMid + jipilFinal = 100 이어야 저장 가능. 시행여부 미체크 시 해당 지필 비율 0 강제. **수행평가 최대 5개**.
- **동명이인 상속 플로우(이중 표면화)**: 개별 추가 → 즉시 팝업, 일괄 가져오기 → 보류 해소 큐(`yearLinks.linkStatus=pending`). 유일 매칭은 `auto_linked` 자동 제안. 매칭 기준 = 소유자 내 이름(`displayName`) + 과거 연도. 상속 항목: 과거 학번·연락처·소속 동아리·관찰/행특 기록.
- **역할 = 복수 역할 테이블 2개(스코프 분리)**: 학급 내 역할(`studentYear` 기준, 예 반장/환경부장) + 분반 내 역할(`enrollment` 기준, 예 과목부장). 각 이름+설명. 둘 다 복수 허용, 스냅샷 방식.
- **담임반 여부**: 학생 sid의 학년·반 == 교사 담임 학년·반이면 True. 표시는 **이모지 체크(True만)**, False는 무표기. **학생 공개 링크 발급은 담임반(True)만 가능**.
- **순차 게이팅**: 학년도 → 교사기본 → 학사일정 → 학생명단 → 수업관리. `setupState.completedAt`으로 잠금해제. 선행 미완료 단계 비활성.
- **마이그레이션**: 운영 데이터 없음 → 추가/재생성 자유. 단 Drizzle 마이그레이션 파일로 관리.

## Non-Goals (QC §향후계획: "이번에 지적된 부분만 수정, 그 외 건드리지 말 것")
- 기존 `app/students`·`app/timetable`·`app/calendar`의 **일상 조회·특정 수정 기능 재구축**(라우트만 세팅실로 이동, 부가 화면 신설 X — 2차/3차 QC로 연기).
- 교실(수업 진척도·세특)·교무실·통계실·인쇄실·상담실·공지실 등 **세팅실 외 공간 변경**.
- 동아리 `eventKind=club` 일정과 동아리 활동 기록(creative_activity)의 **자동 연결**(속성 부여까지만; 연결은 향후).
- AI 세특 생성기 등 Phase 1 범위 외 기능.
- '수강 중인 수업' 학생 속성의 편집(읽기 표시만; enrollments 기반 조회).

## Acceptance Criteria

### C1 학년도 세팅 & 생명주기
- [ ] AC-1.1 활성 학년도가 오늘 날짜로 자동 산정된다(3/1 경계). 2027-03-01 진입 시 2027학년도로 전환.
- [ ] AC-1.2 새 학년도 진입 시 교사 기본설정 포함 활성 세팅이 빈 상태로 시작한다.
- [ ] AC-1.3 과거 모든 학년도 데이터를 연도별로 조회할 수 있다(읽기 전용).
- [ ] AC-1.4 레거시를 연도 단위로 삭제할 수 있고, 이후 연도가 참조하는 상속 영속 학생·기록은 삭제되지 않는다.

### C2 교사 기본 설정
- [ ] AC-2.1 이름·학교명·담임여부(불린)·담임반 학년/반을 입력·저장한다. 담임여부 False면 담임반 입력이 숨겨진다.
- [ ] AC-2.2 학교명 입력 시 NEIS 학교검색으로 office/school 코드가 자동 해석·저장된다(동명 학교 시 선택 fallback).
- [ ] AC-2.3 이후 학사일정·시간표 sync가 저장된 학교명/교사명/코드를 재입력 없이 재사용한다.

### C3 학사 일정 + 키워드
- [ ] AC-3.1 NEIS sync가 '시험' 키워드로 학기별 1차/2차 시험일을 추출해 `eventKind=exam`+`examSemester`+`examOrdinal`로 속성 부여한다.
- [ ] AC-3.2 '방학식'/'개학식' 키워드로 `vacation_start`/`vacation_end`, '동아리' 키워드로 `club` 속성을 부여한다.
- [ ] AC-3.3 교사가 보정 UI에서 자동 부여된 속성을 수정·추가·삭제할 수 있다.
- [ ] AC-3.4 sync는 기존 멱등성(범위 내 neis 이벤트 교체)을 유지한다.

### C4 학생 명단 관리
- [ ] AC-4.1 학생 명단 관리가 세팅실 라우트로 이관된다.
- [ ] AC-4.2 학생 속성으로 담임반여부(파생)·연락처·과거 학번·수강 중인 수업(읽기)·역할(학급, 복수)·희망 진로를 보고/편집한다.
- [ ] AC-4.3 개별 추가 시 과거 동명이인이 있으면 즉시 팝업으로 상속 확인("…2025학년도 …가 맞나요?").
- [ ] AC-4.4 일괄 가져오기 시 동명이인은 보류 해소 큐에 모이고, 유일 매칭은 자동 연결 제안된다.
- [ ] AC-4.5 상속 확정 시 과거 학번·연락처·소속 동아리·관찰/행특 기록이 영속 학생으로 연결되어 이후 조회된다.
- [ ] AC-4.6 담임반(True) 학생만 이모지 체크가 표시되고, 공개 링크 발급이 가능하다(False는 불가).

### C5 수업 관리
- [ ] AC-5.1 시간표 sync로 이번 학년도 과목·분반·주당 시수가 추출된다(교사명·학교명 재입력 없이).
- [ ] AC-5.2 분반 상세에서 DB 학생을 등록한다. 학번에서 학년/반/번호를 추출한 필터 검색 + 개별 체크박스 + 전체선택 일괄등록을 지원한다.
- [ ] AC-5.3 학생은 과목별 독립 등록된다(한 학생이 여러 수업 동시 수강).
- [ ] AC-5.4 분반별 시험일은 학사일정 추출분이 자동 유입된다.
- [ ] AC-5.5 수행평가 비율·명(최대 5개, 개별 비율) + 지필 1차/2차 비율 + 1차/2차 시행여부를 설정한다.
- [ ] AC-5.6 Σ(수행 비율)+jipilMid+jipilFinal = 100%가 확인되어야 저장된다. 미시행 지필 비율은 0 강제.
- [ ] AC-5.7 수행평가별 날짜를 분반 단위로 지정한다(명·비율은 과목 공유).
- [ ] AC-5.8 분반 내 역할(과목부장 등, 복수, 이름+설명)을 학생에게 부여한다.

### 공통
- [ ] AC-0.1 세팅실이 5단계 순차 게이팅을 강제한다(선행 완료 전 다음 단계 잠금).
- [ ] AC-0.2 변경은 Drizzle 마이그레이션으로 관리되며, 기존 통합 테스트가 통과한다.

## Technical Context (브라운필드 구현 맵)

### 스키마 변경 (`lib/db/schema/`)
- `enums.ts`: `eventKind` enum 신규(`exam`/`vacation_start`/`vacation_end`/`club`/`none`).
- `misc.ts > teacherProfile`: `isHomeroom`(boolean), `homeroomGrade`(int, nullable), `homeroomClassNo`(int, nullable), `schoolName`(또는 기존 neisSchoolName 재사용 결정) 추가.
- `misc.ts > calendarEvents`: `eventKind`(eventKind, default 'none'), `examSemester`(int, nullable 1|2), `examOrdinal`(int, nullable 1|2) 추가.
- `identity.ts > studentYears`: 이미 phone/career 존재. 역할은 별도 테이블.
- 신규 `homeroomRoles`(또는 `studentRoles`): id, ownerId, studentYearId FK, title, description.
- 신규 `sectionRoles`: id, ownerId, enrollmentId FK(또는 sectionId+studentYearId), title, description.
- 신규 `subjectExams`: id, ownerId, subjectId FK, semester(int), ordinal(int), date(nullable), enabled(boolean). (subjects.examBoundaryDate는 파생 갱신.)
- 신규 `sectionPerformanceDates`: id, ownerId, sectionId FK, performanceItemId FK, date.
- `classes.ts > performanceItems`: 기존 name+weight 유지(과목 단위 공유). 5개 cap은 앱 검증.
- `classes.ts > subjects`: jipilMidWeight/jipilFinalWeight 유지 + 시행여부 컬럼(`jipilMidEnabled`/`jipilFinalEnabled` boolean) 추가.

### 쿼리/도메인 (`lib/db/queries/`, `lib/domain/`)
- 신규 `lib/domain/school-year.ts`: `activeSchoolYear(today)` 파생 함수(3/1 경계).
- `calendar.ts`: sync 시 키워드 추출 → eventKind/examSemester/examOrdinal 부여. 보정용 update 쿼리. exam 4건 → subjectExams 유입 + examBoundaryDate 자동 갱신.
- `roster.ts`/`students.ts`: 동명이인 매칭(displayName + 과거 연도) → yearLinks(auto_linked/pending) 생성. 상속 resolve 쿼리. 역할 CRUD.
- `timetable.ts`: 기존 sync 재사용(teacherProfile 값). 평가설정 100% 검증 쿼리. enrollment 필터/일괄등록. sectionPerformanceDates CRUD. sectionRoles CRUD.
- 레거시: 연도별 조회 + 연도 단위 삭제(참조 보존) 쿼리.
- `setupState`: feature별 completedAt 게이팅 헬퍼.

### 라우트 (`app/`)
- 신규 `app/setting/` 셸 + 하위: `setting/year`(또는 layout 게이팅), `setting/profile`, `setting/calendar`, `setting/students`, `setting/courses`.
- 기존 `app/students`·`app/timetable`·`app/calendar` → 세팅실로 이동(기존 최상위 라우트는 세팅실로 리다이렉트/제거). 부가 조회 화면 신설은 Non-Goal.

### 통합 (`lib/integrations/`)
- `neis.ts`/`neis-client.ts`: 학교검색(학교명→office/school 코드) 함수 추가. 키워드 추출 보조.
- `comcigan.ts`: 기존 sync 재사용.

## Ontology (Key Entities) — 최종 라운드
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| SchoolYear | core domain (파생) | year, start(3/1), end(익년2말) | 모든 연도 스코프 데이터의 필터 |
| TeacherProfile | core domain | name, schoolName, isHomeroom, homeroomGrade, homeroomClassNo, neis/comcigan codes | 1:1 owner |
| Person | core domain | displayName | has many StudentYear |
| StudentYear | core domain | sid, grade, classNo, number, name, phone, career | belongs to Person; has HomeroomRole, Enrollment |
| YearLink | supporting | linkStatus(auto/pending/new), candidatePersonId | StudentYear ↔ Person 상속 |
| CalendarEvent | core domain | date, eventKind, examSemester, examOrdinal, title | source NEIS/manual |
| Subject | core domain | name, jipilMid/FinalWeight, jipilMid/FinalEnabled, examBoundaryDate | has PerformanceItem, SubjectExam, CourseSection |
| CourseSection | core domain | label, room, examBoundaryDate(override) | has Enrollment, SectionPerformanceDate, SectionRole |
| Enrollment | core domain | (section×studentYear) | has SectionRole |
| PerformanceItem | supporting | name, weight (과목 공유, ≤5) | belongs to Subject |
| SubjectExam | supporting (신규) | semester, ordinal, date, enabled | belongs to Subject |
| SectionPerformanceDate | supporting (신규) | date (분반별) | Section × PerformanceItem |
| HomeroomRole | supporting (신규) | title, description (복수) | belongs to StudentYear |
| SectionRole | supporting (신규) | title, description (복수) | belongs to Enrollment |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 8 | 8 | - | - | N/A |
| 2 | 8 | 0 | 0 | 8 | 100% |
| 3 | 9 | 1 (YearLink) | 0 | 8 | 89% |
| 4 | 10 | 1 (PerformanceItemDate) | 0 | 9 | 90% |
| 6 | 10 | 0 | 0 | 10 | 100% |
| 9 | 11 | 1 (SubjectExam) | 0 | 10 | 91% |
| 11 | 13 | 2 (HomeroomRole, SectionRole) | 1 (PerformanceItemDate→SectionPerformanceDate) | 10 | 100% |
| 13 | 13 | 0 | 0 | 13 | 100% (수렴) |

## Interview Transcript
<details>
<summary>Full Q&A (13 rounds + Round 0)</summary>

**Round 0 (토폴로지):** 6개 후보 제시 → "세팅실 셸은 별도 아님" → 5개 활성 컴포넌트로 잠금.

**Round 1 (학년도/Constraint):** 전환 트리거·범위 → **날짜 자동 + 전체 초기화(교사설정 포함)**.

**Round 2 (학사일정/Constraint):** 키워드 실패 처리 → **자동 추출 + 교사 보정 UI**.

**Round 3 (학생명단/Constraint):** 동명이인 표면화 → **둘 다 지원**(개별=팝업, 일괄=해소 큐), 매칭=이름+과거연도.

**Round 4 (수업관리/Constraint, Contrarian):** 분반별 비율 가능성 기각 → **명·비율=과목 공유, 날짜만 분반별**.

**Round 5 (학년도/Criteria):** 레거시 입도 → **전체 과거 연도 조회 + 연도 단위 삭제**(참조 보존).

**Round 6 (학사일정/저장모델, Simplifier):** → **단일 eventKind enum + 시험 메타컬럼**.

**Round 7 (이관범위/Context):** → **세팅실로 라우트 이동**, 기존 페이지 일상기능은 2차/3차 연기(Non-Goal). + 임계 5% 하향.

**Round 8 (교사기본/Context):** 학교명↔sync 연결 → **학교명 1회 입력 → 코드 자동 해석**.

**Round 9 (학사일정↔수업/Criteria):** 시험일 매핑 → **4개 시험일 과목 저장 + 경계일 자동 갱신**.

**Round 10 (수업관리/Constraint):** 지필 비율 모델 → **1차/2차 비율 분리 유지**, 100%=수행합+지필1+지필2, 미시행 0 강제, 수행 ≤5.

**Round 11 (학생명단/Constraint):** 역할 구조 → **복수 역할 테이블 2개**(학급역할 studentYear + 분반역할 enrollment).

**Round 12 (셸/Constraint):** 순서 → **순차 게이팅**(setupState completedAt).

**Round 13 (전체/Context):** 마이그레이션 → **운영 데이터 없음, 자유 재구성**.

</details>
