# RALPLAN(consensus·deliberate): QC v2 계획 2-2 — 교실(Classroom) 허브

- 상태: **PENDING APPROVAL · 구현 준비 완료** (consensus 통과 — Architect SOUND-WITH-CHANGES + Critic APPROVED-WITH-RESERVATIONS, 2 CRITICAL + 6 MAJOR + 마이너 전부 병합). 실행 미승인.
- 입력 스펙: `.omc/specs/deep-interview-classroom-hub.md` (deep interview 17R, 모호도 3.7%)
- 범위: 교실 허브 + 6개 컴포넌트(수업계획실·진척도·성적기록·교과관찰·학생분석보고서·세특작성) + 인접보정(행특). **2-1(세팅실 재수정)은 완료·배포됨(6bb9008).**
- 생성: 2026-06-12
- deliberate 근거: brownfield 스키마 마이그레이션(신규 3테이블 + 관찰 분반귀속 강화).

---

## Requirements Summary
기획안 §2 "🏫 교실" 미구현을 해소. `/classroom`을 **게이팅 없는 자유 탭 허브**로 만들고 `/classroom/{plan,progress,grades,observations,report,setech}` 6개 하위 페이지를 배치. 모든 페이지는 **활성 학기 자동(`activeSemester`) + 상단 드롭다운 수동 전환**을 공유. 핵심 결정(스펙 R1~R17):
- **수업 계획실**: 과목단위 계획(차시 1..N), 차시별 수업내용+핵심개념(해시태그 text[]). 차시=시간표 슬롯 기반 실제 날짜(방학·휴업일 제외, 기존 `schoolDayCalendar` 재사용). 일년 과목=학기별 독립.
- **수업 진척도**: UI 전면 재작성(/sessions 미재사용), DB는 `classSessions` 재사용 + 신규 `session_records`. 첫화면 팝업=이번주∪연체 예정. 완료 시 실제수업내용·핵심개념·평가아이디어 기입(계획 토글 불러오기 순서기본+수동재지정).
- **성적 기록**: 원점수만 저장(읽기시점 환산). 수행=항목별 CSV(학번·이름·점수·서술), 지필=과목×회차별 CSV 활성회차만. 예시 CSV 다운로드.
- **교과 관찰**: /observations에서 격상, 분반 필수귀속, 학생↔분반 자동매칭(복수 토글)·분반→학생 필터, 날짜입력(기본 당일+캘린더), 수정·삭제.
- **학생 분석 보고서**: 인적·관찰·성적 종합 + 규칙기반 플래그 4종(AI 미사용).
- **세특 작성**: /setech 이동, 과목·분반별 CSV 왕복(학번+과목 복합키), 원천자료=관찰+수행서술(**점수 제외**)+학생추가입력(studentExtraNotes), 행별 verify 경고·저장 허용.
- **인접보정**: 행특=담임반 학생만 기록 + 날짜·수정·삭제.

---

## RALPLAN-DR

### Principles
1. **brownfield 패턴 보존**: 쿼리 `lib/db/queries/*`(ownerId 인자)+`index.ts` 재노출(`index.ts:5-27`), 순수규칙 `lib/domain`, 서버액션 `getOwnerId`+페이지범위 `revalidatePath`+`writeAudit`(setech `actions.ts:95` 패턴), `force-dynamic` 페이지.
2. **단일 진실원·파생 우선**: 성적=원점수만 저장(환산 읽기시점), 수강중인수업=enrollments 파생, 학기=`activeSemester(8/15)` 파생. 중복 저장 금지.
3. **재사용 우선**: 차시=`schoolDayCalendar`+`timetableSlots`(`sessions.ts` 엔진), 세특 번들=`buildSourceBundle`/`verifyPastedDraft`/`saveDraft` 재사용, 관찰 폼 패턴 재사용.
4. **마이그레이션 안전성**: 수기 SQL(`apply-sql.mjs`=단일 simple-query tx), idempotent(`if not exists`), additive 우선, 파괴적 재구성·기존데이터 손실 금지.
5. **기재요령 준수(load-bearing 제약)**: 세특/관찰 원천자료에 점수·지필성적 일절 미포함. 학생분석 진단은 규칙기반(AI api 금지).
6. **저위험부터·범위 봉쇄**: 세팅실·기존 /sessions·/observations·/setech(레거시 경로)는 리다이렉트 외 불변. 컴포넌트 독립 단계.

### Decision Drivers (top 3)
1. **허브 셸이 foundational** — 6개 페이지가 공유 학기 셀렉터·레이아웃에 의존 → 셸 먼저.
2. **데이터 의존 위상** — 계획실→진척도(계획 의존), 관찰+성적→보고서/세특(집계 의존) → 생산자 먼저, 소비자(보고서·세특) 마지막.
3. **마이그레이션 리스크 격리** — 신규 테이블은 additive(저위험), 관찰 분반귀속 강화만 기존데이터 영향 → 별도·가드.

### Viable Options
**Option A — 허브셸 → 계획실 → 진척도 → 성적 → 관찰 → 보고서 → 세특 (생산자→소비자 순차)** ✅ 채택
- Pros: foundational 셸 먼저, 각 컴포넌트 독립 검증·배포, 보고서·세특이 선행 데이터(관찰/성적/계획)에 의존하므로 마지막에 두면 통합 검증 용이. 기존 단계별 배포 패턴(2-1)과 일관.
- Cons: 단계 수 많음(8). 셸·마이그레이션이 앞단에 집중.

**Option B — 마이그레이션 일괄 + 6개 컴포넌트 병렬**
- Pros: 스키마 한 번에, 병렬 속도.
- Cons: 보고서·세특이 미완성 관찰/성적에 의존 → 통합 불가, 실패 진단 어려움. 단일 세션 순차 실행에 부적합. → Option A에 흡수.

**Option C — classSessions 미재사용·교실 전용 차시 테이블 신설**
- 무효화: 스펙 R7에서 "classSessions 재사용 + 신규 기록테이블"로 확정. 전용 테이블은 /sessions와 차시 이중관리·동기화 부채 발생 → 기각.

---

## Pre-mortem (3 실패 시나리오)
1. **계획↔진척도 차시 매핑 불일치로 토글 불러오기 오작동**: 계획은 과목단위 ordinal(1..N), 진척도는 분반별 실제 날짜 차시. 분반 차시 수 ≠ N이면 k번째 매핑이 어긋나 엉뚱한 계획 내용 로드(R16 위반).
   - 방어: `session_records.planOrdinal`을 명시 저장(자동=해당 분반에서 그 차시의 done 순서 k → 계획 ordinal k, R16 수동 재지정 시 갱신). 매핑은 **읽기시점 계산이 아니라 완료 처리시 확정·저장**. itest: N<분반차시(초과=빈계획), N>분반차시(잔여 계획 미사용) 양 끝 단언. 미스매치 시 "계획 없음" graceful(빈 토글).
2. **관찰 분반귀속 NOT NULL 마이그레이션이 레거시 null-section 행에서 실패/데이터 차단**: 기존 /observations는 `sectionId` nullable(`records.ts:36`, `observations.ts:53` `?? null`)이라 운영 데이터에 null-section 관찰이 존재할 수 있음. 즉시 `set not null`은 마이그레이션 실패 또는 기존행 위반.
   - 방어: **DB 컬럼은 nullable 유지**, 분반귀속 **필수는 신규 교실 관찰 폼·`addSubjectObservation` 인자 검증(앱 레이어)으로 강제**. 마이그레이션은 NOT NULL 미적용(ADR 명시). 레거시 null 행 정리 후 제약 강화는 후속(별도 가드 SQL + 백필 불가행 리포트). itest: 신규 폼이 sectionId 없는 제출 거부, 기존 null 행 조회 무손상.
3. **세특 일괄 CSV에 점수 유입 → 기재요령 위반(법적/제도 리스크)**: `buildSourceBundle`(`actions.ts:37`)이 performances(점수 포함)를 묶음 → bulk export가 그대로 점수를 CSV에 노출.
   - 방어: bulk export는 `buildSourceBundle` 재사용하되 **점수 필드를 명시적으로 제외**(수행은 prose만, 지필 일절 제외)하는 `buildBulkSetechSource`로 래핑 + 단위테스트로 "CSV 출력에 숫자 점수 컬럼 부재" 단언. Non-goal을 AC로 승격(AC-S4).

---

## 실행 계획 (단계별)

### 단계 0 — 마이그레이션 (수기 SQL, `node --env-file=.env.local scripts/apply-sql.mjs lib/db/migrations/<file>`)
> `apply-sql.mjs:14`는 파일 전체를 `sql.unsafe(text)` 단일 호출=postgres.js **simple-query(암묵 단일 tx)**. 본 단계는 enum ADD VALUE 없음(전부 테이블/컬럼 additive)이라 파일 분리 불필요. (audit 액션은 pg enum이 아니라 TS union `AuditEvent`(audit.ts:11-65)라 마이그레이션 무관 — 0-E 코드 변경으로 처리.) 관찰 분반귀속은 NOT NULL 미적용(Pre-mortem #2).
> 🔴 **CRITICAL(Critic): 신규 테이블마다 RLS 필수.** `0002_rls_policies.sql`은 **전 public 테이블**에 `enable row level security` + `owner_rw` 정책을 건다(미적용 테이블은 Supabase anon 키로 PostgREST 전면 노출 — 학생 성적/기록 유출). 아래 3개 파일 각각 끝에 표준 3줄 블록 포함:
> ```sql
> alter table <t> enable row level security;
> drop policy if exists "owner_rw" on <t>;
> create policy "owner_rw" on <t> for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
> ```
- **0-A `lib/db/migrations/0017_lesson_plans.sql`**: 과목단위 수업 계획. (`pk()`=`defaultRandom()`=`gen_random_uuid()`, `_shared.ts` 패턴 일치.)
  ```sql
  create table if not exists lesson_plans (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null,
    subject_id uuid not null references subjects(id) on delete cascade,
    ordinal int not null,
    content text,
    keywords text[],
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(subject_id, ordinal)
  );
  -- + RLS 3줄 블록(lesson_plans)
  ```
  (subjects 행은 이미 학기별 분리 → semester 컬럼 불필요. yearCourseKey로 1↔2학기 링크 가능하나 R14 독립계획이라 미사용.)
- **0-B `lib/db/migrations/0018_session_records.sql`**: 진척도 완료 시 실제 기록(classSessions 1:1). `+ RLS 3줄(session_records)`.
  ```sql
  create table if not exists session_records (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null,
    session_id uuid not null references class_sessions(id) on delete cascade,
    actual_content text,
    keywords text[],
    eval_idea text,
    plan_ordinal int, -- 완료 처리시 확정 저장(자동=분반 내 날짜순위 k, 수동 재지정 override)
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(session_id)
  );
  -- + RLS 3줄 블록(session_records)
  ```
- **0-C `lib/db/migrations/0019_jipil_scores.sql`**: 지필 원점수(과목×회차×학생). 수행평가는 기존 `performance_assessments`(records.ts:62) 재사용. `+ RLS 3줄(jipil_scores)`.
  ```sql
  create table if not exists jipil_scores (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null,
    student_year_id uuid not null references student_years(id) on delete cascade,
    subject_id uuid not null references subjects(id) on delete cascade,
    ordinal int not null, -- 1=중간(1회), 2=기말(2회)
    raw_score numeric,    -- 원점수(100점 만점). 환산은 읽기시점.
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(student_year_id, subject_id, ordinal)
  );
  -- + RLS 3줄 블록(jipil_scores)
  ```
- **0-D (미채택, 후속)**: `performance_assessments`에 `performance_item_id` FK 추가는 **2-2 미포함**(additive지만 범위 확대). 단계 4 weight 검증은 `(subjectId, name)` 조인으로 처리(아래) + rename-fragility를 ADR Follow-up에 명시.
- **0-E (코드, 마이그레이션 아님) — audit union 확장**: `lib/db/queries/audit.ts:11-65` `AuditEvent` union에 신규 리터럴 추가: `lesson_plan_save`, `progress_record`, `grade_upload`, `setech_bulk_export`, `setech_bulk_import`, `observation_update`, `observation_delete`, `behavior_note_update`, `behavior_note_delete`. (기존 재사용: `session_generate`, `observation_create`, `behavior_note_create`, `setech_save`.) 미확장 시 단계 8 typecheck 실패(런타임 아님·typecheck 게이트).
- 적용 전: 대상 테이블 부재 확인. 롤백 SQL 동봉(`drop table if exists ...`). **부분 실패 시(0018 중간 실패 등) 스키마/`index.ts` 편집을 SQL apply와 lockstep 되돌림.** 스키마 파일 동기화: `lib/db/schema/records.ts`에 `lessonPlans`,`sessionRecords`,`jipilScores` drizzle 정의 추가, `lib/db/schema/index.ts` export.
- **검증**: `apply-sql` 성공 + `\d lesson_plans|session_records|jipil_scores` 컬럼·유니크 확인 + **`select relrowsecurity from pg_class where relname in (...)` 3개 모두 true**.

### 단계 1 — 교실 허브 셸 [foundational]
- **레이아웃** `app/classroom/layout.tsx`(신규): 세팅실 `layout.tsx` 참고하되 **게이팅 제거**. 상단 "🏫 교실" 헤더 + 6개 탭 네비. 🔴 **학기 셀렉터는 client 컴포넌트**(`"use client"` + `useSearchParams`/`useRouter`) — Next.js App Router는 `searchParams`를 **layout에 주입하지 않고 page에만** 주입하므로 layout 서버 컴포넌트가 활성 학기를 직접 못 읽음. 셀렉터는 `?semester=1|2`(기존 표준, courses/page.tsx:29,38-39와 동일 파라미터명 — `?sem` 아님)를 토글.
- **페이지별 학기 스레딩(필수)**: `/classroom/*/page.tsx` **각각**이 `searchParams: Promise<{ semester?: string }>`를 받아 `sp.semester==="1"?1:sp.semester==="2"?2:activeSemester(now)`로 산출 → 자기 데이터 쿼리에 전달(courses/page.tsx:38-43 패턴). 셀렉터(layout)만으로는 필터가 적용되지 않음.
- **공유 헬퍼** `lib/domain/school-year.ts`: `semesterRange(year, sem):{start,end}` 추가(1학기 3/1~8/14, 2학기 8/15~익년2말, 학년도-aware로 2학기 end=익년 2월말). 단위테스트.
- **홈 네비** `app/page.tsx`: 🏫 교실 `DashCard`(href=/classroom) 추가(`page.tsx:62` 그리드). 레거시 카드(/sessions·/observations·/setech)는 유지하되 설명에 "(교실로 이동)" 주석. **단, 교실 카드 노출은 단계 7까지 6페이지 동작 확인 후**(antithesis 완화 — 깨진 링크 prod 노출 방지).
- **인덱스 라우트** `app/classroom/page.tsx`: `/classroom/plan`으로 redirect(또는 6탭 랜딩 그리드).
- **AC**: AC-H1(게이팅 없는 6탭), AC-H2(**6개 페이지 각각이 `?semester`를 데이터 쿼리에 반영**, 기본=activeSemester), AC-H3(빈 데이터 시 잠금 대신 안내 메시지), AC-H4(신규 3테이블 RLS `owner_rw` 정책 `relrowsecurity=true` 확인).

### 단계 2 — 수업 계획실
- **도메인** `lib/domain/lesson-plan.ts`(신규): `computePlanLength(schoolDays, slotWeekdays)` — 학기 범위 ∩ 슬롯 요일 수업일 카운트(차시 N 기본값). 순수함수+단위테스트.
- **쿼리** `lib/db/queries/lesson-plan.ts`(신규, index.ts에 export 추가): 
  - `getPlanLength(db,ownerId,subjectId,sem)` — `semesterRange`+`schoolDayCalendar`+해당 과목 분반들의 `timetableSlots` 요일 union으로 N 산출(분반별 차시수 상이 시 **최댓값** 기준, R3/R16).
  - `listLessonPlan(db,ownerId,subjectId)` / `upsertLessonPlanEntry(db,ownerId,subjectId,ordinal,{content,keywords})`(onConflictDoUpdate target `[subjectId,ordinal]`) / `deleteLessonPlanEntry`.
- **액션** `app/classroom/plan/actions.ts`: `saveLessonPlanAction`(getOwnerId+revalidate `/classroom/plan`+audit `lesson_plan_save`).
- **UI** `app/classroom/plan/page.tsx`+`plan-editor.tsx`(client): 활성학기 과목 선택 → 차시 1..N 행, 각 행 수업내용 textarea + 핵심개념 해시태그 입력(칩, text[]). 일년 과목은 학기별 독립 표시.
- **테스트** `lesson-plan.integration.test.ts`: upsert/list/delete, N 산출(슬롯×수업일), 학기별 독립(동 yearCourseKey 1·2학기 별 계획).
- **AC**: AC-P1~P5.

### 단계 3 — 수업 진척도 관리
- **쿼리** `lib/db/queries/progress.ts`(신규): 
  - `generateSemesterSessions(db,ownerId,sectionId,sem)` — `sessions.ts:generatePlannedSessions`(:56-152) 엔진을 **학기 전체 범위(`semesterRange`)** 로 일반화. ⚠ **기존 엔진과의 차이 명시(Critic #6)**: 기존은 `today()`→`examBoundaryDate` 클리핑(:77-78, 경계 미설정 시 throw). 교실 진척도는 **학기 start→end 전체**(시험경계 무관, 경계 throw 제거)로 생성 → 차시 N은 학기 단일 연속(중간/기말 경계로 분절하지 않음). done/not_held 불변 보존(:131-137 로직 유지). unique(section,date). **`schoolDayCalendar` 커버리지 확인**: 2학기 end(익년 2월말)까지 school_day 행 존재 필요 — 없으면 빈 교집합(graceful, throw 금지).
  - `listProgressPopup(db,ownerId,sem)` — status='planned' ∧ (이번주[월~일] ∪ date<오늘) 차시(연체∪금주). 
  - `markSessionDone(db,ownerId,sessionId,{actualContent,keywords,evalIdea,planOrdinal})` — `classSessions.status='done'` + `session_records` upsert(unique session_id). `markSessionStatus`(planned/not_held)는 `setSessionStatus`(sessions.ts:155) 재사용.
  - `getPlanForSession(db,ownerId,sessionId)` — 토글 불러오기용. 🔴 **planOrdinal 자동 매핑 = 분반 내 해당 차시의 날짜순위(date-rank) k**(Architect #4·완료 순서 아님 — 교사가 #5를 #3보다 먼저 완료해도 #5의 ordinal은 날짜순 index). → 과목 `lesson_plans` ordinal k 내용 반환(R16 자동). 수동 재지정 시 `session_records.planOrdinal` override 저장. N<분반차시(초과=빈계획 graceful), N>분반차시(잔여 계획 미사용).
- **액션** `app/classroom/progress/actions.ts`: `setProgressStatusAction`, `saveDoneRecordAction`(audit `progress_record`).
- **UI** `app/classroom/progress/page.tsx`+`progress-board.tsx`(client, **전면 신규**, /sessions 미재사용): 첫 화면 팝업(이번주∪연체), 상태 토글, 완료 시 모달(실제수업내용·핵심개념·평가아이디어 + 계획 토글 불러오기 버튼[순서 기본, 수동 드롭다운 재지정]).
- **테스트** `progress.integration.test.ts`: 학기차시 생성(done 보존), 팝업 범위(금주∪연체, 미래 제외), markDone+session_records, getPlanForSession 매핑(초과/부족 경계).
- **AC**: AC-PR1~PR6.

### 단계 4 — 성적 기록
- **CSV 파서** `lib/csv/grades.ts`(신규, 기존 `lib/csv/student-roster.ts:171` 패턴 — **`ImportResult<T>` shape `{rows,errors,totalRows}` 반환**(bare array 아님), 미매칭/형식오류는 `errors[]` 채널로 → AC-G6 graceful의 근거): 
  - 수행: `parsePerformanceCsv(text)` → `ImportResult<{sid,name,score,prose}>`(항목별 파일).
  - 지필: `parseJipilCsv(text)` → `ImportResult<{sid,name,rawScore}>`(과목×회차별 파일).
  - **예시 CSV 다운로드 방식 확정**: 정적 자산 부재 → **클라이언트 Blob 생성**(헤더+샘플행 문자열 → `Blob`→`URL.createObjectURL` 다운로드, roster import-form 패턴 확장). `public/` 정적파일 아님.
- **쿼리** `lib/db/queries/grades.ts`(신규): 
  - `upsertPerformanceScores(db,ownerId,subjectId,itemName,rows[])` → `performance_assessments`(records.ts:62) upsert(studentYearId+subjectId+name). 학번→studentYearId 매핑(해당 분반 `enrollments` 기준; 미매칭 행 스킵+리포트). **weight 검증 = `performanceItems`(classes.ts:107)를 `(subjectId, name)` 문자열 조인**(FK 없음 — 항목명 변경 시 조인 실패 → weight 검증 skip+경고, ADR Follow-up). 점수 > weight면 비차단 경고.
  - **⚠ cross-section 충돌(Critic 마이너)**: 한 학생이 같은 과목 2개 분반 수강 시 `(studentYearId,subjectId,name)` upsert 충돌 → 분반 무관 과목단위 1행이 정상(수행은 과목 평가). 분반은 코호트 산출(보고서)용으로만 enrollments 파생.
  - `upsertJipilScores(db,ownerId,subjectId,ordinal,rows[])` → `jipil_scores` upsert(활성 회차만; `subjects.jipilMidEnabled/FinalEnabled` 검사, 미시행 회차 업로드 거부).
  - `getGradeView(db,ownerId,subjectId,sem)` — 읽기시점 환산: 지필 원점수 × `jipilMidWeight/FinalWeight`(classes.ts:71-72), 수행 score 합산. (환산값 미저장.)
- **액션** `app/classroom/grades/actions.ts`: `uploadPerformanceCsvAction`, `uploadJipilCsvAction`(audit `grade_upload`).
- **UI** `app/classroom/grades/page.tsx`+`grades-uploader.tsx`: 과목·분반 선택, 수행 항목별 업로드 칸 + 지필 활성회차 업로드 칸, 예시 다운로드, 업로드 결과·환산 미리보기.
- **테스트** `grades.integration.test.ts`: 수행 upsert(항목별·weight 초과 경고), 지필 upsert(활성회차만·미시행 거부), getGradeView 환산(중간만/기말만/둘다/미시행), 학번 매핑 실패 graceful.
- **AC**: AC-G1~G6.

### 단계 5 — 교과 관찰 격상 + 행특 인접보정
- **쿼리** `lib/db/queries/observations.ts`(확장): 
  - `addSubjectObservation`(observations.ts:42): `sectionId` **필수 인자 검증**(앱레이어, null이면 throw) — Pre-mortem #2. **`sessionId`(records.ts:39) 결정**: 교실 관찰은 날짜+분반 스코프이므로 `sessionId`는 **미채우고 null 유지**(차시 연결 미사용 — 기존 소비자 없음 확인). 후속에서 차시-관찰 링크 필요시 도입.
  - 신규 `updateSubjectObservation(db,ownerId,id,{body,keywords,observedOn})`, `deleteSubjectObservation(db,ownerId,id)`, `updateBehaviorNote`, `deleteBehaviorNote`(전부 ownerId 가드).
  - `listStudentsBySection(db,ownerId,sectionId)`(enrollments 조인) — 분반→학생 필터. `listSectionsForStudent(db,ownerId,studentYearId,sem)` — 학생→수강분반 자동매칭(복수 토글).
  - `listHomeroomStudents(db,ownerId,year)` — 행특 담임반 제한용(homeroomMembers 조인).
- **액션** `app/classroom/observations/actions.ts`: add/update/delete 관찰 + 행특(담임반 검증). audit `observation_*`/`behavior_*`. (레거시 `app/observations/actions.ts`는 유지 또는 재노출.)
- **UI** `app/classroom/observations/page.tsx`+client: 학생 선택→수강분반 자동매칭(복수 토글), 분반 선택→학생 명단 필터, 날짜 입력(기본 당일+캘린더), 기록별 수정·삭제 버튼. 행특 카드: **담임반 학생만** 셀렉트(listHomeroomStudents) + 날짜·수정·삭제.
- **🔴 행특 목적지 명시(Architect #4)**: 기존 `/observations`는 **한 페이지에 교과 관찰+행특 두 스트림**(observations/page.tsx:60-126). 라우트를 redirect하면 행특 스트림이 사라지므로, 행특을 먼저 **새 비-redirect 홈**으로 이전: `app/homeroom/behavior/page.tsx`(담임 영역, 담임반 학생 제한+날짜+수정/삭제). 그 **후에** `app/observations/page.tsx` → `/classroom/observations` redirect(교과 관찰분만). 홈 네비에서 행특은 `/homeroom/behavior`로 안내.
- **테스트** `observations.integration.test.ts`(확장): sectionId 필수 거부, update/delete(관찰·행특), listStudentsBySection/listSectionsForStudent, 행특 담임반 외 학생 거부.
- **AC**: AC-O1~O6.

### 단계 6 — 학생 분석 보고서
- **도메인** `lib/domain/student-report.ts`(신규, 순수규칙): 입력=집계 데이터 → 플래그 4종 산출:
  - `jipilTrend`: 중간→기말 환산점수 비교 → up/down/flat(데이터 부족 시 null).
  - `observationShortage`: 관찰 건수 ≤ 임계(기본 1) → 경고.
  - `performanceMissing`: 설정 수행항목 중 미입력/공란 목록.
  - `sectionRank`: 분반 평균 대비 상/중/하(점수 보유 시). **코호트=해당 sectionId의 `enrollments`(classes.ts:124) 학생들**의 환산 성적 평균과 비교(과목 성적을 분반 코호트로 한정). 점수 부재 학생 제외.
  - **자연어 문장 없음·AI 호출 없음**(Principle 5).
- **쿼리** `lib/db/queries/student-report.ts`(신규): `getStudentReport(db,ownerId,studentYearId,sectionId,sem)` — 인적사항(roster)+관찰(observations)+성적(grades)+활동 집계 후 도메인 플래그 적용. **sectionRank는 `enrollments` join으로 분반 코호트 도출**(성적은 과목단위 저장이나 비교 모집단은 분반). ownerId 전수 스코프.
- **UI** `app/classroom/report/page.tsx`: 분반·학생 선택 → 인적/관찰/성적 종합 + 플래그 배지 4종.
- **테스트** `student-report.test.ts`(도메인 단위): 각 플래그(추이 up/down/null, 관찰부족 경계, 미입력 목록, 분반순위), `student-report.integration.test.ts`(집계 조립).
- **AC**: AC-R1~R5.

### 단계 7 — 세특 작성 (이동 + bulk CSV 왕복)
- **번들** `lib/setech/bulk.ts`(신규): `buildBulkSetechSource(bundle)` — 기존 `buildSourceBundle`(queries) 재사용하되 **점수 제외**. ⚠ `buildSourceBundle`은 `performances[].score`를 담음(setech.ts:111, types.ts:11-15) → 래퍼가 **명시적으로 score 필드 제거**(관찰 body+keywords, 수행 **prose만**, 학생추가입력 studentExtraNotes; 지필·점수 일절 미포함). `toBulkCsv(rows)`/`parseBulkResultCsv(text)`(학번+과목 복합키).
- **쿼리** `lib/db/queries/setech.ts`(확장): `listEnrolledStudents(subjectId/sectionId)` 재사용.
  - 🔴 **`saveDraftsBulk`는 `saveDraft` 재사용 불가(Architect/Critic CRITICAL)**: `saveDraft`(setech.ts:168-177)는 차단 경고(`over_limit`/`empty`, verify.ts:69-75 blocking=true)에서 **throw**. → bulk는 **자체 insert**로 구현하고 경고를 심각도 분할:
    - **비차단**(prohibited/first_person/student_name_guess, blocking=false) → **저장 + 플래그**(R17 자율 판단).
    - **차단**(over_limit=1500byte 초과·empty) → **해당 행 거부 + 리포트**(나이스 바이트 하드제약 보존). 나머지 행은 저장.
    - 반환 `{saved, rejected[]}`. `specialNoteDrafts` 직접 insert 시 `byteCount`/`byteLimit=BYTE_LIMITS[type]`(setech.ts:178,188) 동일 산출.
- **액션** `app/classroom/setech/actions.ts`: `exportBulkSourceAction`(과목·분반→원천 CSV, 점수제외 단언), `importBulkResultAction`(재업로드→행별 verify+저장), `saveExtraNoteAction`(학생×과목 studentExtraNotes 추가입력). audit `setech_bulk_export`/`setech_bulk_import`.
- **UI** `app/classroom/setech/page.tsx`+client: 과목·분반 선택 → ① 원천 CSV 다운로드 ② (코워크) ③ 결과 CSV 업로드 → 행별 검증 결과(경고 배지) → 저장. 학생×과목 추가입력란.
- **레거시 리다이렉트** `app/setech/page.tsx` → `/classroom/setech`.
- **테스트** `setech.integration.test.ts`(확장): buildBulkSetechSource **점수 컬럼 부재 단언**(AC-S4), CSV 왕복(학번+과목 매칭), saveDraftsBulk **심각도 분할 단언**(prohibited-only 행=저장+플래그, over_limit 행=거부+rejected 리포트).
- **AC**: AC-S1~S5.

### 단계 8 — 회귀·마무리
- `npm run typecheck`(0 err), `npm run build`(exit0), 비-itest `npm test`, `RUN_DB_ITEST` 통합테스트 전부 그린. 레거시 리다이렉트 동작 확인. 홈 네비 교실 카드 노출.

---

## Acceptance Criteria (testable)
- **허브**: [ ] AC-H1 `/classroom`가 게이팅 없이 6탭 제공·각 하위경로 동작. [ ] AC-H2 학기 셀렉터 기본=`activeSemester`, 수동 1↔2 전환이 데이터 필터 반영. [ ] AC-H3 선행데이터 없음 시 잠금 대신 안내 메시지.
- **계획실**: [ ] AC-P1 과목 선택 시 학기·방학 기준 차시 N 자동 산출. [ ] AC-P2 차시별 수업내용 저장·재조회. [ ] AC-P3 핵심개념 해시태그 다건 저장(text[]). [ ] AC-P4 일년 과목 1·2학기 독립 계획. [ ] AC-P5 차시 추가/삭제.
- **진척도**: [ ] AC-PR1 학기 전체 차시 생성(done/not_held 보존). [ ] AC-PR2 첫화면 팝업=금주∪연체 예정(미래 제외). [ ] AC-PR3 미진행 전환 시 팝업 제거. [ ] AC-PR4 완료 시 실제수업내용·핵심개념·평가아이디어 저장(session_records). [ ] AC-PR5 계획 토글 불러오기(순서 기본). [ ] AC-PR6 수동 재지정.
- **성적**: [ ] AC-G1 수행 항목별 CSV 업로드(점수+서술). [ ] AC-G2 수행 점수 weight 초과 경고. [ ] AC-G3 지필 과목×회차 CSV, 활성회차만. [ ] AC-G4 원점수 저장·읽기시점 환산(중간만/기말만/둘다/미시행). [ ] AC-G5 예시 CSV 다운로드. [ ] AC-G6 학번 매핑 실패 graceful.
- **관찰**: [ ] AC-O1 분반 필수귀속(미지정 거부). [ ] AC-O2 학생→수강분반 자동매칭(복수 토글). [ ] AC-O3 분반→학생 필터. [ ] AC-O4 날짜 입력(기본 당일+캘린더). [ ] AC-O5 관찰 수정·삭제. [ ] AC-O6 행특 담임반 제한 + 날짜·수정·삭제.
- **보고서**: [ ] AC-R1 인적·관찰·성적 종합 표시. [ ] AC-R2 지필추이 화살표. [ ] AC-R3 관찰부족 경고. [ ] AC-R4 수행 미입력 플래그. [ ] AC-R5 분반평균 대비 위치. (AI 미호출)
- **세특**: [ ] AC-S1 과목·분반별 원천 CSV 내보내기. [ ] AC-S2 학생×과목 추가입력 저장. [ ] AC-S3 결과 CSV 재업로드(학번+과목 매칭)·저장. [ ] AC-S4 **원천 CSV에 점수·지필성적 컬럼 부재**(기재요령). [ ] AC-S5 행별 verify 심각도 분할 — **비차단(기재금지·문체·이름) 경고는 저장+플래그, 차단(over_limit·empty)은 행 거부+리포트**.

---

## Risks & Mitigations
| 리스크 | 완화 |
|--------|------|
| 계획↔진척도 차시 수 불일치(매핑 어긋남) | `session_records.planOrdinal` 완료시 확정 저장, 경계(초과/부족) graceful, itest 양끝 |
| 관찰 NOT NULL 마이그레이션이 레거시 null 행 차단 | DB nullable 유지, 필수는 앱레이어(폼+addSubjectObservation 검증), 제약강화 후속 |
| 세특 bulk에 점수 유입(기재요령 위반) | `buildBulkSetechSource` 점수 명시 제외 + 단위테스트 단언(AC-S4) |
| 학번→studentYearId 매핑 실패(CSV 오타) | 미매칭 행 스킵+리포트(graceful), itest |
| /sessions·/observations·/setech 이중 관리 | classSessions 공유(진척도), 레거시 경로 redirect, 행특은 단일 스트림 유지 |
| 차시 N 산출이 분반별 상이 | 최댓값 기준 기본 + 수동 추가/삭제, ADR 명시 |
| itest 로컬 5432(세션)·prod 6543(트랜잭션) 모드차 | 본 쿼리 모드무관, prod 스모크 보완 |
| performance_assessments name 매칭 취약 | weight 조인 `(subjectId,name)` 명시, 항목명 변경시 검증 skip+경고, FK는 후속 |
| 🔴 신규 테이블 RLS 누락→anon 노출(학생 성적 유출) | 0017/0018/0019 각각 `enable RLS`+`owner_rw` 3줄, `relrowsecurity=true` 검증, AC-H4 |
| 🔴 AC-S5 saveDraft 재사용 시 차단행 throw | 자체 insert + 심각도 분할(비차단 저장/차단 거부), byteCount/limit 재현 |
| audit union 미확장→typecheck 실패 | 0-E에서 `AuditEvent` 9개 리터럴 추가(단계 8 게이트) |
| 학기 셀렉터 layout이 searchParams 못읽음 | client `useSearchParams` + page별 `?semester` 스레딩, `?sem`→`?semester` |
| 진척도 엔진 학기 일반화가 시험경계 클리핑과 충돌 | 학기 전체 생성(경계 무관·throw 제거), schoolDayCalendar 익년2월 커버리지 확인 |
| 관찰 sectionId onDelete:set null이 분반귀속 무효화 | 앱레이어 필수 유지 + ADR 명시 + FK 강화 후속(백필 후) |

## Expanded Test Plan (deliberate)
- **Unit**: `semesterRange`(경계), `computePlanLength`(슬롯×수업일), `student-report` 플래그 4종(추이/부족/미입력/순위 경계·null), `buildBulkSetechSource` 점수제외, CSV 파서(수행/지필/결과 복합키).
- **Integration (RUN_DB_ITEST)** — 신규 `*.integration.test.ts`는 기존 harness 준수: `drizzle(sql,{schema, casing:"snake_case"})` + `randomUUID` owner + `afterAll` 정리(observations.integration.test.ts:55-68 패턴). 케이스: 계획(upsert·N·학기독립), 진척도(학기차시 done보존·팝업범위[금주∪연체·미래제외]·markDone·getPlanForSession **날짜순위 매핑**·schoolDayCalendar 미커버 graceful), 성적(수행 weight·지필 활성회차·환산[중간만/기말만/둘다/미시행]·매핑실패), 관찰(sectionId필수·update/delete·분반필터·행특 담임반외 거부), 보고서(**sectionRank 2분반 코호트**·집계조립), 세특(점수부재·복합키왕복·**심각도 분할[비차단저장/차단거부]**).
- **e2e/수동**: 교실 6탭 무게이팅 이동·학기 토글, 계획 작성→진척도 완료시 토글로딩, 성적 CSV 업로드 후 환산 표시, 관찰 자동매칭·필터·수정삭제, 보고서 플래그, 세특 CSV 왕복(점수 없음 육안 확인).
- **Observability**: 마이그레이션 전후 테이블 존재 확인, audit 로그(lesson_plan_save/progress_record/grade_upload/observation_*/setech_bulk_*), prod 함수 로그 오류 0.

## Verification Steps
1. 단계 0 마이그레이션 적용 + 스키마 확인.
2. 각 단계 itest 그린 → 다음 단계(생산자→소비자 순서 준수).
3. 전체 `typecheck`/`build`/비-itest/itest 그린 + 레거시 redirect 확인.
4. (배포 시) prod 스모크: 교실 진입·계획·진척도·성적업로드·관찰·세특 CSV 무오류.

---

## ADR
- **Decision**: 교실을 게이팅 없는 자유 탭 허브(`/classroom/*`, 활성학기+수동전환)로 신설, 6개 컴포넌트를 생산자→소비자 순차(셸→계획→진척도→성적→관찰→보고서→세특)로 구현. 신규 3테이블(lesson_plans·session_records·jipil_scores) additive, 성적 원점수 저장·읽기시점 환산, classSessions 재사용, 세특/관찰 점수 제외(기재요령), 진단 규칙기반(AI 금지).
- **Drivers**: ① 허브 셸 foundational ② 데이터 의존 위상(소비자 보고서·세특 마지막) ③ 마이그레이션 리스크 격리(additive 우선).
- **Alternatives considered**: B(마이그레이션 일괄+병렬) — 소비자가 미완 데이터 의존, 순차 세션 부적합으로 기각. C(교실 전용 차시 테이블) — /sessions 이중관리 부채, R7 classSessions 재사용 확정으로 기각.
- **Why chosen**: 컴포넌트 독립 배포·검증, 선행 데이터 의존 흡수, 기존 2-1 단계별 패턴 일관, 스키마 additive로 저위험.
- **Consequences**: ① 계획(과목단위 ordinal)↔진척도(분반 날짜차시) 매핑은 `session_records.planOrdinal` **날짜순위 자동+수동 재지정** 저장으로 확정, 분반 차시수 상이 시 경계 graceful. ② 관찰 분반귀속은 **앱레이어 강제(DB nullable 유지)** — `subjectObservations.sectionId`가 `onDelete:set null`(records.ts:36)이라 분반 삭제 시 관찰의 분반링크가 null로 회귀(불변식 약화). 레거시 null 정리 후 FK 강화(restrict/cascade) 후속. ③ 진척도 차시 생성은 시험경계 무관 **학기 전체**라 기존 /sessions(경계 클리핑)와 차시 모집단이 다름(classSessions 공유하나 status는 단일 진실, 차시 행은 동일). ④ 차시 N은 분반 최댓값 기준 기본값+수동 조정. ⑤ 행특은 교실 밖 신규 `/homeroom/behavior`로 이전(담임 영역). ⑥ 성적 원점수-only·읽기시점 환산으로 비율 변경이 소급 반영. ⑦ 신규 3테이블 RLS owner_rw 적용(타 테이블과 동일 보안 모델). ⑧ audit 액션은 TS union 확장(마이그레이션 무관).
- **Follow-ups**: 관찰 sectionId FK 강화(레거시 백필 후). performance_assessments performance_item_id FK 및 항목명-rename 대응(현재 `(subjectId,name)` 조인 취약). 차시-관찰 sessionId 링크(필요시). 출제실(평가아이디어 소비자)·통계실(성적 소비자) 연동. 레거시 /sessions·홈 카드 정리.

## Changelog (consensus 반영)
**Architect (SOUND-WITH-CHANGES) 반영:**
1. **[blocker]** AC-S5 모순 해소 — `saveDraft` 재사용 금지, 심각도 분할(비차단 저장+플래그 / 차단 over_limit·empty 거부+리포트), 자체 insert. AC-S5 재작성.
2. planOrdinal 자동 매핑을 **완료순서→분반 내 날짜순위(date-rank)** 로 정정(verify: 비순차 완료 시 오매핑 방지).
3. 행특 목적지 명시 — `/observations`가 단일 페이지 2스트림이라 redirect 전 행특을 신규 `/homeroom/behavior`로 이전.
4. 관찰 `sectionId onDelete:set null`(records.ts:36)이 앱레이어 분반귀속 무효화 — ADR 명시 + FK 강화 후속.
5. `subjectObservations.sessionId`(records.ts:39) 미채움(null 유지) 결정.
6. 수행 weight 조인 `(subjectId,name)` 명시 + rename-fragility, 0-D FK는 2-2 미채택(후속).

**Critic (APPROVED-WITH-RESERVATIONS) 반영:**
7. **🔴[CRITICAL]** 신규 3테이블 RLS `enable+owner_rw` 누락 — `0002_rls_policies.sql` 전테이블 잠금 패턴 확인, 0017/0018/0019에 3줄 블록 + `relrowsecurity=true` 검증 + AC-H4.
8. **[MAJOR]** audit union 미확장 typecheck 실패 — 0-E에서 `AuditEvent`(audit.ts:11-65) 9개 리터럴 추가(기존 session_generate/observation_create/behavior_note_create/setech_save 재사용).
9. **[MAJOR]** 성적 section-scoping 명시 — sectionRank 코호트=`enrollments` 조인, weight 조인 `(subjectId,name)`, 2분반 itest.
10. **[MAJOR]** 학기 셀렉터 정정 — layout는 searchParams 불가 → client `useSearchParams`, `?sem`→**`?semester`**(courses/page.tsx:29,38-39 일치), **page별 스레딩** 필수, AC-H2 강화.
11. **[MAJOR]** 진척도 엔진 학기-vs-시험경계 차시 명확화 — 학기 전체 생성(경계 throw 제거), schoolDayCalendar 익년2월 커버리지 graceful.
12. **[마이너]** 마이그레이션 dir prefix(`lib/db/migrations/`), CSV 파서 `ImportResult<T>` shape(student-roster.ts:171), itest harness `casing:"snake_case"`+afterAll, 예시CSV=클라이언트 Blob, 부분실패 lockstep 롤백, cross-section upsert(과목단위 1행) 명시.

**미반영(의도적)**: performance_item_id FK·구 레거시 카드 정리는 2-2 범위 밖 후속(ADR Follow-up). antithesis 정렬(domain-first)은 부분 채택 — 홈 카드 노출을 단계 7 후로 지연(깨진 링크 방지)하되 2-1 일관성 위해 셸은 단계 1 유지.

→ 2 CRITICAL + 6 MAJOR + 마이너 전부 해소 → **clean APPROVED(구현 준비 완료) 동등**.
