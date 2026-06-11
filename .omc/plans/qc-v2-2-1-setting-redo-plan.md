# RALPLAN(consensus·deliberate): QC v2 계획 2-1 — 세팅실 재수정

- 상태: **PENDING APPROVAL · 구현 준비 완료** (consensus + 2차 독립 검토 통과 — Architect SOUND-WITH-CHANGES + Critic 1·2차 APPROVED-WITH-RESERVATIONS, 총 14개 개선 병합. deliberate: DB 마이그레이션·enum 변경 포함). 실행 미승인.
- 입력 스펙: `.omc/specs/deep-interview-qc-v2-setting-redo.md` (deep interview, 모호도 4.6%)
- 범위: 계획 2-1 4축(A 학기모델·B 학사일정분류·C 학생명단·D 수업관리). **2-2 교실 허브 deferred.**
- 생성: 2026-06-11

---

## Requirements Summary
세팅실(S0~C5 구현 완료)을 4축으로 보강:
- **A**: 8/15 경계 1·2학기 도입. 학기=`subjects.semester`. 학기 전환 시 학생명단 보존·수업(과목/분반/수강)만 재생성. `activeSemester(8/15)` 파생.
- **B**: NEIS 학사일정 분류 확장(7종 EventKind). 휴업일=NEIS 비수업일 자동탐지. 방학 통합·미분류 경고(`needsReview`)·일괄저장.
- **C**: 학생 명단 전 속성 표시/인라인 수정/하드삭제, CSV 예시+역할 컬럼, 필터, 링크 복사.
- **D**: 평가저장 지속표시, cross-class 개별등록/삭제, 수강중인수업 enrollments 파생.

---

## RALPLAN-DR

### Principles
1. **단일 진실원·파생 우선**: 학기=`activeSemester(8/15)` 파생, 수강중인수업=enrollments 파생(중복 저장 금지).
2. **brownfield 패턴 보존**: 쿼리 `lib/db/queries/*`(ownerId 인자)+`index.ts` 재노출, 순수규칙 `lib/domain`, 서버액션 `getOwnerId`+페이지범위 `revalidatePath`+`writeAudit`.
3. **마이그레이션 안전성**: 수기 SQL(`apply-sql.mjs`), idempotent, 기존 데이터 보존(백필), 파괴적 재구성 금지.
4. **동작 보존·검증 우선**: 쿼리/분류 변경은 통합·단위테스트로 동치/규칙을 잠근 뒤 UI 교체.
5. **저위험부터·범위 봉쇄**: 2-2 교실·교사기본설정 불변. 컴포넌트 독립 단계 적용.

### Decision Drivers (top 3)
1. **학기 모델이 foundational** — A가 B(지필 학기)·D(분반 재등록)·C(수강중인수업)에 파급 → A 먼저.
2. **마이그레이션 리스크 격리** — enum 재정의·컬럼 제거가 가장 위험 → 별도 단계 + 백필 + 롤백 SQL.
3. **검증 게이트** — 순수 규칙=단위, DB 동작=RUN_DB_ITEST, 회귀=build/typecheck.

### Viable Options
**Option A — 컴포넌트 순차(A→B→D→C), 각 단계 마이그레이션→쿼리/도메인→itest→액션→UI** ✅ 채택
- Pros: foundational A 먼저로 파급 흡수, 각 단계 독립 검증·롤백, 기존 단계별 게이팅 패턴과 일관.
- Cons: A 마이그레이션이 sync/courses 페이지에 동시 영향 → A 단계가 큼.

**Option B — 마이그레이션 일괄 선적용 후 기능별 병렬**
- Pros: 스키마 한 번에.
- Cons: enum 재정의+semester+needsReview 동시 적용 시 실패 지점 진단 어려움, 롤백 단위 큼. → A의 단계적 마이그레이션에 흡수.

**Option C — 학기를 분반/수강에 두는 대안 모델**
- 무효화: deep interview에서 `subjects.semester`로 확정(R1). 재논의 불필요.

---

## Pre-mortem (3 실패 시나리오)
1. **enum 마이그레이션 실패/데이터 손상**: `ADD VALUE`와 그 값을 쓰는 `UPDATE`를 한 파일(단일 암묵 tx)에 두면 "unsafe use of new value of enum" 실패. 또는 타입 재생성 중 매핑 누락 → 분류 유실.
   - 방어: **0-B1(ADD VALUE 5종, 단독 커밋) → 0-B2(UPDATE 매핑 vacation_start/end→vacation, none→self_activity + SET DEFAULT) 파일·실행 분리**(Architect 확인: apply-sql.mjs는 파일=단일 simple-query). 타입 재생성 대신 구 값 잔존(파괴적 회피). 적용 전 `select event_kind,count(*)` 스냅샷 + 롤백 SQL. itest로 매핑 검증.
2. **학기 분기 누락으로 1학기 데이터 오염**: `getOrCreateSubject` 매칭 키에 semester 미반영 → 2학기 재동기화가 1학기 물리 행을 재사용/수정.
   - 방어: 매칭 키 `(owner, schoolYear, semester, name)` 전수 변경 + sync가 `activeSemester` 주입. itest: 1학기 sync 후 2학기 sync → 동명 과목 2행 공존 단언.
3. **학생 하드삭제가 과거 이력/상속 파괴**: 과도 동작으로 과거 person/학적 손실.
   - **정정(Architect)**: `yearLinks.newStudentYearId`는 이미 `onDelete cascade`(identity.ts:65)이고 studentYears 참조 전 테이블이 cascade(enrollments/classRoles/observations/homeroomMembers/publicPages 등) → **FK 위반 없음, 수동 yearLinks 삭제 불필요**(거짓 전제 제거). `candidatePersonId`는 set null(safe).
   - 방어: `deleteStudentYear`는 트랜잭션으로 (1) studentYear 삭제(연관 행 FK cascade 자동) → (2) person 잔여 학적 0이면 `deleteOrphanPerson`(roster.ts:190, 동일 파일 재사용). itest로 과거연도 학적·person 보존 + 고아 삭제 단언.

---

## 실행 계획 (단계별)

### 단계 0 — 마이그레이션 (수기 SQL, `node --env-file=.env.local scripts/apply-sql.mjs <file>`)
> ⚠ **Architect 확인 사실**: `scripts/apply-sql.mjs:14`는 파일 전체를 `sql.unsafe(text)` 단일 호출=postgres.js **simple-query(암묵 단일 트랜잭션)** 로 실행한다(`node_modules/postgres/.../connection.js:189`). 따라서 `ALTER TYPE ADD VALUE`와 그 새 값을 쓰는 `UPDATE`를 **같은 파일에 두면 실패**(새 enum 값은 추가 트랜잭션 커밋 전 사용 불가). → enum 마이그레이션을 **파일/실행 분리**한다.
- **0-A `00NN_subject_semester.sql`**: `alter table subjects add column if not exists semester int not null default 1;` + **연간 과목 연속성 키(Architect 합성)** `alter table subjects add column if not exists year_course_key text;`(sync 시 `normalize(name)+'_'+schoolYear`로 채움 — 교실 2-2가 1↔2학기 동일 과목을 문자열매칭 없이 링크할 join 키). + `subject_exams` 정리: ① unique(`uq_subject_exams` on subject_id,semester,ordinal) drop → ② **중복 dedup(Critic)**: `(subject_id, ordinal)` 충돌 행 제거(`delete from subject_exams a using subject_exams b where a.subject_id=b.subject_id and a.ordinal=b.ordinal and a.semester>b.semester;` — 학기2 행 제거, 학기1 보존) → ③ `drop column if exists semester`(⚠ **비가역**: drop 전 `create table _bak_subject_exams as select * from subject_exams` 스냅샷) → ④ `add constraint uq_subject_exams unique(subject_id, ordinal)`.
  - **⚠ prod 배포 순서(Critic)**: semester 컬럼 drop은 코드가 아직 `subjectExams.semester`를 참조하면 prod 쿼리 오류 → **backward-tolerant 코드(semester 미참조) 선배포 → 그 다음 0-A 적용**. (또는 현 prod에 multi-semester exam 행이 없음을 확인 후 동시 적용. v1은 단일학기라 충돌 행 사실상 없음.)
- **0-B1 `00NN_event_kind_add_values.sql`** (먼저, 단독 실행→완전 커밋): `alter type event_kind add value if not exists 'mock_exam';` / `'holiday'` / `'self_activity'` / `'career_activity'` / `'vacation'`. (값 추가만 — 이 파일은 row 사용 없음)
- **0-B2 `00NN_event_kind_remap.sql`** (0-B1 커밋 확인 후 별도 실행): `update calendar_events set event_kind='vacation' where event_kind in ('vacation_start','vacation_end'); update calendar_events set event_kind='self_activity' where event_kind='none'; alter table calendar_events alter column event_kind set default 'self_activity';` (구 값 vacation_start/end/none은 **미사용으로 잔존 — 타입 재생성은 파괴적이라 회피**, Architect 권고).
- **0-C `00NN_calendar_needs_review.sql`**: `alter table calendar_events add column if not exists needs_review boolean not null default false;`
- 적용 전: 각 대상 테이블 분포 스냅샷(`select event_kind,count(*)` 등) 기록. 롤백 SQL 동봉(컬럼 drop / 매핑 역). schema 파일(`classes.ts`,`misc.ts`,`enums.ts`) 동기화(enums.ts는 7종+구3종 잔존 주석).
- **검증**: `apply-sql` 단계별 성공 + `\d subjects`,`\d calendar_events` 컬럼 확인 + 0-B1↔0-B2 사이 enum 값 커밋 확인 + 기존 행 분포 비교(유실 0).

### 단계 A — 학년도·학기 모델 [foundational]
- **도메인**: `lib/domain/school-year.ts`에 `activeSemester(today:Date):1|2`. **⚠ 학년도-aware 규칙(검토 정정)**: 학년도는 3월~익년2월이므로 1·2월은 **직전 시작 학년도의 2학기**다. 따라서 1학기 = 월∈[3, 8/14], 2학기 = (월==8 ∧ 일≥15) 또는 월∈[9,12] 또는 월∈[1,2]. (단일 8/15 경계로 하면 1·2월이 1학기로 오분류 → 폐기) `semesterRange(year,sem)` 선택적. **단위테스트** `school-year.test.ts` 확장(3/1→1, 7/15→1, 8/14→1, 8/15→2, 12/31→2, 익년1/1→2, 익년2/28→2).
- **쿼리** `lib/db/queries/timetable.ts`: `getOrCreateSubject` 시그니처에 `semester` 추가, 매칭 `and(ownerId, schoolYear, semester, name)`, insert 시 `yearCourseKey=normalize(name)+'_'+schoolYear`. `syncTeacherTimetable(db,ownerId,schoolYear,semester,slots)`로 확장. `listSubjectsWithSections`·`getTeacherTimetable`에 `semester` 필터(활성 학기).
- **⚠ `subjectExams.semester` 제거 파급 전수(Architect 필수)**:
  - `listSubjectExams`(timetable.ts:551-573)·`listSubjectExamsForYear`(:617-643)·`SubjectExamRow` 타입 선언(:617-622)에서 `semester` 제거, `orderBy`는 `ordinal`만.
  - `materializeSubjectExams`(:469-524): 그룹핑을 `calendarEvents.examSemester` 매칭에서 **`WHERE subjects.semester = calendarEvents.examSemester` 조인**으로 변경(과목 학기의 exam 이벤트만 materialize; cartesian 금지 — inner join, 학기 무 exam 과목은 0행=정상). `subjectExams` insert에서 `semester` 컬럼 제거, **`onConflictDoUpdate.target`도 `[subjectExams.subjectId, subjectExams.ordinal]`로(:517)**, unique는 `(subjectId, ordinal)`. (현재 :502-503 중첩루프=cartesian → 학기 조인으로 교체). → **AC-B6(학기 자동 분류)이 materialize 정확성의 load-bearing 의존**.
  - `app/setting/courses/page.tsx:37,49-52`: `listSubjectExamsForYear`→`examsBySubject`→`SubjectView.exams` **데이터 조립 지점**(Critic 누락 지적). `courses-manager.tsx:18,101,104`: UI가 `e.semester` 렌더 → 제거(또는 과목 학기 파생). `SubjectView.exams` 타입 전파 동기화.
  - **tests-first**: `timetable.integration.test.ts:224-237`(현재 `exams).toHaveLength(2)`+semester 가정)을 신 모델 기대값으로 **먼저** 갱신.
- **액션** `app/setting/courses/timetable-actions.ts`: `syncTimetableAction`이 `activeSemester(new Date())` 주입. `app/setting/actions.ts` courses 액션들 학기 인지(필요 시).
- **UI** `app/setting/courses/page.tsx`: `activeSemester` 산출 → 활성 학기 과목만 표시 + 과거 학기 조회 토글(드롭다운: 1학기/2학기, 기본=활성). `courses-manager.tsx` 학기 라벨 표기.
- **테스트** `timetable.integration.test.ts` 확장: 1학기 sync→2학기 sync 동명과목 2행 공존, 활성학기 필터, 학생명단 불변(별 owner 픽스처).
- **AC**: AC-A1~A6.

### 단계 B — 학사일정 분류 고도화
- **도메인** `lib/domain/calendar-keywords.ts`: `classifyEvent`를 **context-aware**로 재작성 — 단일 이벤트 분류 `classifyOne(title)`(키워드: 수능모의고사='모의고사|학력평가|수학능력시험', exam, 동아리, 진로활동='진로활동', 자율활동='자율활동'). **⚠ mock_exam 검사는 isExam보다 우선(Critic)**: 현재 `isExam`(calendar-keywords.ts:43)이 `학력평가`를 exam으로 매칭하므로, mock_exam 분기를 isExam 앞에 두지 않으면 '학력평가'가 exam→materialize 유입돼 AC-B3/B6 위반. 기존 `calendar-keywords.test.ts` exam 케이스(학력평가 등) 기대값 갱신 필요. `classifyOne`과 **시퀀스 패스** `classifySchedule(entries:{title,date,isSchoolDay}[]):Classified[]`. **⚠ 시퀀스 패스 진입 전 `entries`를 date asc 정렬(Architect: NEIS 순서 미보장, 방학 구간 탐지가 순서 의존)**. 규칙: ① 방학 구간 마킹: '방학식'→'개학식' 사이+제목'방학' ② 비수업일∧방학아님→holiday ③ exam 학기=8/15 자동, 제목 명시 우선 ④ 미분류→self_activity+needsReview=true ⑤ 토요휴업일 제외. **단위테스트** `calendar-keywords.test.ts` 확장(각 키워드, 방학 구간 경계, 개학식 누락, 휴업일 우선순위, 미분류 needsReview).
- **enum/schema**: `enums.ts` eventKind 7종 반영(주석 갱신). `misc.ts` calendarEvents `eventKind` default `self_activity`, `needsReview` 추가.
- **⚠ EventKind 타입변경 파급 전수(검토 보강)**:
  - `lib/domain/calendar-keywords.ts:9-14` `EventKind` union → 7종 재정의(vacation_start/end/none 제거).
  - **🔴 `app/setting/actions.ts:221-226` `EVENT_KINDS` 검증 화이트리스트 → 7종**. **런타임 검증(`:239` includes)이라 typecheck 미포착** — 미갱신 시 교사 수동 재분류(holiday/self_activity 등)가 거부돼 AC-B8/B9 침묵 파손. 가장 중요.
  - `app/setting/calendar/calendar-attrs.tsx:12-18` `KIND_LABEL: Record<EventKind,string>` 7종 라벨(드롭다운 구동, exhaustive Record라 typecheck 포착).
- **쿼리** `lib/db/queries/calendar.ts`: `syncSchoolCalendar`가 `classifySchedule`로 일괄 분류(isSchoolDay 전달), 토요휴업일 필터, needsReview 세팅. 신규 `bulkUpdateEventAttrs(db,ownerId,updates[])`(트랜잭션: 다건 update + needsReview=false). `getEventsWithAttrs`에 needsReview 추가. exam이 아닌 mock_exam은 학기/회차 null.
- **액션** `app/setting/actions.ts`: `bulkSaveCalendarAction`(폼 다건 → bulkUpdateEventAttrs, `revalidatePath('/setting/calendar')`, audit `calendar_bulk_save`). 기존 `updateEventAttrsAction`은 개별 needsReview 해제 포함.
- **UI** `app/setting/calendar/*`: 분류 드롭다운에 7종, 보정표 맨 위 '일괄 저장' 버튼, needsReview 경고 배지(⚠). 클라이언트가 변경 누적 → 일괄 저장.
- **테스트** `calendar.integration.test.ts` 확장(합성 schedule: 방학구간·휴업일 자동·수능·미분류 needsReview·일괄저장·재sync 멱등). **+ 수동 재분류 라운드트립**: holiday/self_activity 등 신규 EventKind로 `updateEventAttrsAction` 후 저장·재조회 성공 단언(EVENT_KINDS 화이트리스트 회귀 가드 — 런타임 갭 #1 검출).
- **AC**: AC-B1~B9.

### 단계 D — 수업 관리 강화 (수강 데이터 생성원이라 C보다 먼저)
- **쿼리** `lib/db/queries/timetable.ts`: `enrollOne(db,ownerId,sectionId,studentYearId)`(onConflictDoNothing), `unenroll(db,ownerId,enrollmentId)`. `listSubjectsForStudentYear(db,ownerId,studentYearId,schoolYear)`(enrollments→sections→subjects, 학기 구분 과목명) — 수강중인수업 파생. 평가 조회 `getEvalSettings(db,ownerId,subjectId)`(저장값 prefill용; performanceItems+지필설정).
- **액션** `app/setting/actions.ts`: `enrollStudentAction`(개별), `unenrollAction`(삭제), audit `enrollment_add`/`enrollment_remove`, `revalidatePath('/setting/courses')`.
- **UI** `app/setting/courses/courses-manager.tsx`: 평가설정 저장 성공 메시지 + 저장값 지속표시(폼 prefill, 페이지 로드 시 getEvalSettings). 개별 등록(학번/이름 검색 → 추가, cross-class), 수강생별 삭제 버튼.
- **테스트** `timetable.integration.test.ts`: enrollOne/unenroll, listSubjectsForStudentYear 등록 후 표시·삭제 후 제거, cross-class 등록.
- **AC**: AC-D1~D4.

### 단계 C — 학생 명단 모체 데이터 강화
- **CSV** `lib/csv/student-roster.ts`: HEADER_ALIASES에 `role: ['역할']` 추가, `StudentRosterRow`에 `roles:string[]`(쉼표 분리). `importStudentRoster`(`roster.ts`)가 역할 셀→`class_roles` 생성. **⚠ 재임포트 중복 방지(검토)**: `class_roles`에 unique 제약 없음 → 동일 CSV 재임포트 시 역할 중복 생성. 방어: 역할 생성 전 해당 studentYear의 기존 동일 roleName 존재 확인(create-only) 또는 import 시 해당 학생 역할 교체. (또는 `(ownerId,studentYearId,roleName)` unique 추가 후 onConflictDoNothing)
- **쿼리** `lib/db/queries/roster.ts`: `deleteStudentYear(db,ownerId,studentYearId)`(트랜잭션: studentYear 삭제 → 연관 행 **FK cascade 자동**(yearLinks 포함, identity.ts:65) → person 잔여 학적 0이면 `deleteOrphanPerson`. **수동 yearLinks 삭제 코드 추가 금지** — FK 위반 없음). `updateStudentAttrs(db,ownerId,studentYearId,{name?,phone?,career?})`. (수강중인수업은 D의 `listSubjectsForStudentYear` 재사용; 명단은 배치 조회 후 students.map). 과거학번=기존 `getStudentYearHistory` 파생.
- **액션** `app/setting/actions.ts`: `deleteStudentAction`, `updateStudentAttrsAction`(getOwnerId+audit `student_delete`/`student_update`), `revalidatePath('/setting/students')`. CSV 예시 다운로드는 정적/클라이언트(서버액션 불필요).
- **UI** `app/setting/students/student-roster.tsx`: 카드에 연락처·과거학번·수강중인수업·희망진로 표시, 인라인 수정(연락처/희망진로/이름), 우측상단 빨간 X 삭제(확인), 공개링크 복사 버튼. 임포트 영역 CSV 예시 다운로드 버튼. 상단 필터(학년/반/번호 드롭다운+이름검색, client-side). `page.tsx`: students + 학기 무관(학년도) + 수강중인수업 배치 조회.
- **테스트** `roster.integration.test.ts`: deleteStudentYear(과거연도·person 보존, 고아 삭제, yearLinks 정리), updateStudentAttrs, CSV 역할 파싱(`student-roster.test.ts`).
- **AC**: AC-C1~C7.

### 단계 E — 회귀·마무리
- `npm run typecheck`(0 err), `npm run build`(exit0), 비-itest `npm test`, RUN_DB_ITEST 통합테스트 전부 그린.

---

## Acceptance Criteria
스펙 `.omc/specs/deep-interview-qc-v2-setting-redo.md`의 AC-A1~A6, AC-B1~B9, AC-C1~C7, AC-D1~D4, AC-X1~X2 전부. (테스트 가능 기준은 해당 스펙에 명시)

---

## Risks & Mitigations
| 리스크 | 완화 |
|--------|------|
| enum ADD VALUE+UPDATE 동일 tx 실패(apply-sql=단일 simple-query) | **0-B1(ADD VALUE)↔0-B2(UPDATE/DEFAULT) 파일·실행 분리**, 0-B1 커밋 확인 후 0-B2 |
| 구 enum 값 잔존(vacation_start/end/none) | 미사용 무해 잔존(타입 재생성=파괴적 회피). 코드/스키마 미참조 |
| `subjectExams.semester` 제거 파급 누락 | courses-manager.tsx:18/101/104·listSubjectExams/ForYear/SubjectExamRow·materializeSubjectExams(subjects.semester==examSemester 조인) 전수 + itest:224-237 선갱신 |
| getOrCreateSubject 호출처 누락 | 단일 호출처=syncTeacherTimetable(timetable.ts:100)→timetable-actions.ts:47, 시그니처 변경으로 컴파일 강제 |
| 학생 삭제 과도/이력 손실 | FK 위반 없음(yearLinks cascade) — tx + deleteOrphanPerson, itest로 과거연도·person 보존 단언 |
| classifySchedule 순서 의존(방학 구간) | 진입 전 date asc 정렬 명시 |
| 활성학기 필터 누락으로 과거 과목 노출 | 쿼리 레벨 semester 필터 + 화면 토글, itest |
| itest 로컬 5432(세션)·prod 6543(트랜잭션) 모드 차이 | 본 쿼리 모드무관, prod 스모크로 보완 |
| 연간 과목 1↔2학기 분리(교실 2-2 연속성 부채) | `subjects.year_course_key` 선설치(0-A) — 2-2가 문자열매칭 없이 링크. ADR에 명시 |

## Expanded Test Plan (deliberate)
- **Unit**: `activeSemester`(경계 5+케이스), `classifyOne`/`classifySchedule`(키워드·방학구간·휴업일우선·미분류needsReview·토요휴업일), CSV 역할 파싱.
- **Integration (RUN_DB_ITEST)**: A(동명과목 2학기 2행·활성학기 필터·명단 불변), B(태깅·휴업일자동·일괄저장·재sync 멱등), C(deleteStudentYear 보존/고아/yearLinks·updateStudentAttrs), D(enrollOne/unenroll·수강중인수업 파생·cross-class).
- **e2e/수동**: 세팅실 화면 — 2학기 시간표 동기화 후 과목 신규·학생명단 유지, 학사일정 일괄저장 후 경고 소멸, 학생 삭제/수정/필터, 개별등록/삭제 후 명단 '수강중인수업' 반영, 평가저장 지속표시.
- **Observability**: 마이그레이션 전후 행 분포 스냅샷, sync audit(sync_comcigan/sync_neis/calendar_bulk_save/student_delete 등) 로그 확인, prod 함수 로그 오류 0.

## Verification Steps
1. 단계별 마이그레이션 적용 + 분포 스냅샷 비교.
2. 각 단계 itest 그린 → 다음 단계.
3. 전체 `typecheck`/`build`/비-itest/itest 그린.
4. (배포 시) prod 스모크: 2학기 동기화·일괄저장·학생삭제·개별등록 무오류.

---

## ADR
- **Decision**: QC v2 계획 2-1을 4축(A 학기모델·B 학사일정분류·C 학생명단·D 수업관리)으로 보강. 학기=`subjects.semester`(8/15 `activeSemester` 파생), 학사일정 7종 EventKind+NEIS 비수업일 휴업일 자동탐지+needsReview, 학생명단 전속성/하드삭제/CSV역할/필터, cross-class 개별등록+수강중인수업 파생. 컴포넌트 순차(A→B→D→C) + 단계적 수기 SQL 마이그레이션.
- **Drivers**: ① 학기 모델이 foundational(B·C·D 파급) ② 마이그레이션 리스크 격리(enum/컬럼) ③ 검증 게이트(단위+itest+회귀).
- **Alternatives considered**: B(마이그레이션 일괄선적용 후 병렬) — 실패 진단·롤백 단위 과대로 기각, A의 단계적 마이그레이션에 흡수. C(학기를 분반/수강에 배치) — deep interview R1에서 `subjects.semester`로 확정(settled), 재논의 없음.
- **Why chosen**: foundational A 먼저로 파급 흡수, 단계 독립 검증·롤백, 기존 게이팅 패턴 일관. enum은 ADD VALUE+잔존(파괴적 재생성 회피).
- **Consequences**: ① 구 enum 값(vacation_start/end/none) 미사용 잔존. ② **연간 과목이 1·2학기 독립 2행** → 교실 2-2의 성적/세특 연속성은 cross-row 문제. 완화: `subjects.year_course_key` 선설치(2-2가 문자열매칭 없이 링크). ③ `subject_exams.semester` 제거로 시험경계가 과목 학기에 종속(materialize가 `subjects.semester==examSemester` 조인). ④ semester 컬럼 drop은 비가역(스냅샷 백업).
- **Follow-ups**: 교실 2-2(별도 deep interview) — `year_course_key`로 1↔2학기 과목 링크, 성적기록/세특 연속성 설계. 구 enum 값 정리(선택). prod 배포 시 backward-tolerant 선배포 후 0-A 적용.

## Changelog (consensus 반영)
**Architect (SOUND-WITH-CHANGES) 반영:**
1. enum 마이그레이션 0-B → **0-B1(ADD VALUE)·0-B2(UPDATE/DEFAULT) 분리**(apply-sql=단일 simple-query tx 제약).
2. `subjectExams.semester` 제거 파급 전수(courses-manager·listSubjectExams/ForYear/SubjectExamRow·materializeSubjectExams 조인) + itest 선갱신.
3. `deleteStudentYear` 거짓 전제(yearLinks FK 위반) 제거 — cascade 확인, tx+deleteOrphanPerson만.
4. `classifySchedule` 진입 전 date asc 정렬 명시.
5. (합성 채택) `subjects.year_course_key` 0-A 선설치 + 교실 2-2 연속성 부채 ADR 명시.

**Critic (APPROVED-WITH-RESERVATIONS) 반영:**
6. ripple 목록에 `page.tsx:37,49-52` + `SubjectExamRow:617-622` 추가(전수 보강).
7. `mock_exam` 검사 **isExam 우선** 규칙 명시('학력평가' exam 오분류 방지, AC-B3/B6) + calendar-keywords 테스트 갱신.
8. 0-A에 `(subject_id, ordinal)` 유니크 재추가 전 **dedup** + 비가역 drop **스냅샷** + **prod 배포 순서**(backward-tolerant 선배포) 추가.
9. materialize 조인 `WHERE subjects.semester=examSemester`(cartesian 금지) 명시.

**미반영(의도적)**: year_course_key는 2-1 범위 creep이나 additive·nullable·미사용+ADR 명시로 수용(교실 2-2 부채 선제 해소). 구 enum 값 정리는 후속.

**2차 독립 검토(최종본 fresh-eyes, APPROVED-WITH-RESERVATIONS) 반영:**
10. EventKind 타입변경 파급 전수 추가 — `calendar-keywords.ts:9-14`(union), **`actions.ts:221-226` EVENT_KINDS 런타임 화이트리스트(typecheck 미포착·최중요)**, `calendar-attrs.tsx:12-18`(KIND_LABEL).
11. `materializeSubjectExams` `onConflictDoUpdate.target`도 `(subjectId, ordinal)`로(:517) 명시.
12. **`activeSemester` 규칙 정정** — 학년도-aware(1·2월=직전 학년도 2학기). 단일 8/15 경계의 자체모순 제거, 테스트 기대값 정합.
13. CSV 역할 재임포트 중복 방지(class_roles unique 부재) — create-only/교체/unique+onConflictDoNothing.
14. calendar itest에 수동 재분류 라운드트립 추가(EVENT_KINDS 런타임 회귀 가드).

→ 모든 잔여 reservation 해소 → **clean APPROVED(구현 준비 완료) 동등**.
