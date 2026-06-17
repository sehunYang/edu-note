# QC v6 합의 계획 (Consensus Plan, deliberate)

- Source spec: `.omc/specs/deep-interview-qc-v6.md`
- Mode: consensus --direct, deliberate (신규 마이그레이션 + 공개 토큰 페이지 보안)
- Status: **pending approval**
- Generated: 2026-06-17

## Requirements Summary
6차 QC: 5차 재수정 6개 영역의 잔여 결함·구조 재설계 + 메인 홈을 대표 8개 컴포넌트로 재정리. 핵심 구조 변경은 ① 수업 계획 단위를 "시험 구간"으로 전환. ⑧ 교무실/통계실/인쇄실은 보류.

## RALPLAN-DR Summary

### Principles
1. **Brownfield 일관성** — 기존 패턴(`Paginator`, server action, jsonb payload, 마이그레이션 번호 연속)을 따른다.
2. **공개 페이지 최소권한** — `/p/[token]` 쓰기는 토큰→studentYearId 스코프로만 허용, 타학생/교사 노출 0.
3. **데이터-우선 진단** — ⑤ 영양은 코드가 정상이므로 런타임(함수버전·캐시)부터 검증 후 필요한 코드 변경.
4. **회귀 안전** — 통합테스트(현재 447 green) 유지·확장, 마이그레이션은 idempotent.
5. **점진적 독립 배포 단위** — 7개 컴포넌트를 독립 PR/커밋 단위로 분리(상호 의존 최소).

### Decision Drivers (top 3)
1. ① 수업계획 시험구간 모델은 신규 영속 데이터가 필요(현재 여유차시는 미저장 로컬상태) → 마이그레이션 불가피.
2. ⑤ 학생 캘린더 메모는 공개 토큰 페이지의 첫 쓰기 기능 → 보안 모델이 최대 리스크.
3. ⑥ 행동특성 가중랜덤은 기존 관찰기록 넛지 인프라(`weightedPickLeastRecorded`)를 재사용 가능 → 신규 표면 최소화.

### Viable Options (구조 결정: ① 시험구간 계획 영속화)
- **Option A — 신규 테이블 `exam_segment_plans`** (채택)
  - Pros: 구간별 plannedPeriods/slackPeriods 명시 영속, examTargets와 동급 모델, 조회 단순.
  - Cons: 마이그레이션 1개 추가.
- **Option B — examTargets 행에 컬럼 확장**
  - Pros: 테이블 1개 절약.
  - Cons: examTargets는 진도범위(unitFrom/To) 의미라 책임 혼재, 마이그레이션 ALTER 여전히 필요. **기각**(SRP 위반).
- **Option C — 세션 payload/jsonb에 끼워넣기**
  - Pros: DDL 무변경.
  - Cons: 구간별 집계·검증 쿼리 어려움, 무결성 약함. **기각**(질의성 저하).

### Viable Options (구조 결정: ⑤ 학생 메모 쓰기 엔드포인트)
- **Option A — 신규 테이블 `student_calendar_memos` + 토큰검증 server action** (채택)
  - Pros: (studentYearId,date) 스코프, 토큰→studentYearId 역참조로 권한 확정, 교사 todayMemos와 분리.
  - Cons: 공개 mutation이라 입력검증·rate 고려 필요.
- **Option B — 기존 today_calendar_memos 재사용**
  - Pros: 테이블 절약.
  - Cons: 교사 소유 메모와 혼재→비공개 보장 약화, ownerId 모델 불일치. **기각**(보안·모델 충돌).

## Implementation Steps (컴포넌트별)

### ① 수업 계획실 (마이그레이션 0041)
1. **DB**: `exam_segment_plans`(id, ownerId, subjectId, examOrdinal(1|2), plannedPeriods int, slackPeriods int). **unique 제약은 named `uq_exam_segment_plans` ON `(subjectId, examOrdinal)`** — `subjects.semester`가 이미 존재해 **subjectId가 학기-스코프**(classes.ts:65, 1·2학기 과목은 별도 행)이므로 `semester` 컬럼/키는 중복 → 제외. 형제 `uq_exam_targets`(records.ts:189, `(subjectId, examOrdinal)`, ownerId·semester 미포함)와 **정확히** 일치. 마이그 `0041_exam_segment_plans.sql` + Drizzle 스키마(`lib/db/schema/records.ts`)의 named constraint와 1:1 대조(0037 교훈).
2. **이동**: `app/classroom/plan/session/session-editor.tsx`의 여유차시 입력(`slackInput`)·대표분반차시 표시를 `app/classroom/plan/semester/semester-editor.tsx`로 이전. 학기계획에 구간별(중간/기말) "진행 차시 + 여유 차시" 입력 UI 추가.
3. **actions**: `app/classroom/plan/actions.ts`에 `saveExamSegmentPlanAction` 추가. `lib/db/queries/lesson-plan.ts`에 upsert/조회.
4. **총차시 결정**: `minOrdinals` 합(`countOrdinalsPerUnit`/도메인)으로 차시계획 총 차시 수 표시. `lib/domain/lesson-plan.ts`에 `computeUnitOrdinalSum` 추가.
5. **잔여차시 카운터**: `lib/domain/lesson-plan.ts`에 `computeRemainingToExam(...)` — **결정성 고정**:
   - `examDate`의 **단일 출처 = `calendarEvents`**(eventKind='exam', examSemester, examOrdinal 1|2) — `getPlanView`(lesson-plan.ts:114-163)가 쓰는 동일 소스.
   - **(a) 남은 수업일** = `schoolDayCalendar` 중 `(today, examDate]` ∩ 대표분반 요일 수(`representativeDates`/`computePlanLength` 재사용).
   - **(b) 남은 차시** = `(active segment.plannedPeriods + slackPeriods) − (today까지 소비된 ordinal 수)`. "소비된 ordinal" = 대표분반 날짜가 today 이하인 차시 수.
   - **구간 리셋 트리거**: `today > segment1.examDate`이면 활성 구간을 2회로 전환, 이전 구간 여유차시는 카운트 제외.
   - **clamp ≥ 0**(음수 금지). session-editor/semester-editor 헤더에 (a)·(b) 둘 다 표시.
6. **목표진도 토글**: `ExamTargetsSection`에 저장된 범위를 상시 노출하는 토글/배지 추가.
7. **AC-1.5 존치(Critic)**: `toggleSlackCellAction` 및 차시계획 셀별 여유 토글 마커는 **존치**(실행상 여유 처리). 학기계획으로 이동하는 것은 여유 **계획 입력**만 — 셀 토글 삭제 금지.

### ② 진척도 (UI only)
1. `app/classroom/progress/progress-board.tsx` popup 섹션(연체 예정 차시)에 `paginate()` + `<Paginator>` 적용(기존 `SectionBlock` 패턴, **page size 20**으로 `SECTION_PAGE_SIZE` 일관).

### ③ 출결 관리 (마이그레이션 불필요)
**브라운필드 정정(Architect)**: 자동 출결 생성은 **이미 존재**한다 — `addFieldTrip`(`lib/db/queries/attendance.ts:239`)가 `createAbsenceRangeRecords(..., "accepted", null)`(:259-267)를 호출, start~end 학교일별 `kind:"absent", reason:"accepted"` 행을 `onConflictDoNothing`(idempotent)으로 생성. reason도 이미 인정결석. **재구현 금지.**
1. **실제 델타**: `attendance.ts:266`에서 `noteField`를 `null` → **`'체험학습'`** 으로 전달. (자동생성 루프·멱등성은 기존 헬퍼 재사용)
2. **사유 검색(신규)**: `listAttendanceByMonth`/`searchAttendanceByStudent`(`lib/db/queries/attendance.ts`)에 reason 필터 파라미터 추가, `app/homeroom/attendance/page.tsx`에 사유 select 추가.
3. 삭제 정합성: 기존 `createAbsenceRangeRecords` 경로의 cascade/정리 동작 확인(신규 로직 추가 아님).

### ④ 공지실 (UI only)
1. `app/p/[token]/public-page-view.tsx`의 `IndividualNotices`를 `Notices`와 동일한 캐러셀(‹ N/M ›, idx state)로 변경. 교사 NotesManager 무변경.

### ⑤ 학생 안내 페이지 (마이그레이션 0042 테이블 + 0043 함수 v6)
1. **영양 진단**: prod `get_public_page` 함수 버전 확인(v5/0040 적용 여부) + `meal_cache.payload` 샘플 점검(ntrInfo 키 존재). stale면 NEIS 재동기화로 payload 갱신. 원인 1줄 문서화/로그. (코드 변경 최소)
2. **열 교체**: `public-page-view.tsx` `Meals` 표 헤더/셀 순서를 메뉴 / 영양 / 칼로리로.
3. **DB(테이블)**: `student_calendar_memos`(id, studentYearId, date, body, createdAt, updatedAt) 마이그 `0042_student_calendar_memos.sql` + Drizzle 스키마(named unique 예: `uq_student_calendar_memos` on `(studentYearId, date)` 정책 확정).
4. **DB(읽기 경로, 필수·Architect)**: 공개 페이지는 단일 SQL 함수 `get_public_page`로만 읽는다(get-public-page.ts:35-39). **`0043_get_public_page_v6.sql`** (create-or-replace)로 `v_sy_id` 스코프 `studentMemos` jsonb 섹션 추가. **누락 시 메모가 절대 렌더되지 않음**(Pre-mortem #1과 동일 클래스).
5. **DTO allowlist(필수·Architect)**: `parsePublicPagePayload`(get-public-page.ts:51) allowlist 파서에 `studentMemos` 키 추가 + `lib/public/dto.ts`에 타입. 미추가 시 silently strip됨.
6. **public 쓰기(기존 재사용·Architect)**: **`lib/public/student-write.ts` 재사용** — `resolveToken()`(:49-69, 토큰→{studentYearId,ownerId} 단방향, revoked/expired 거부, service-role 풀) + `writeAudit`로 `saveStudentMemo`/`deleteStudentMemo` 등 함수 추가. **클라 제공 studentYearId 무시**, 토큰에서 도출한 값만 사용. `app/p/[token]/actions.ts`(:18-45)에 thin wrapper(revalidatePath). 자체 인증 재구현 금지.
7. **모달**: `CalendarSection` 셀을 button화 + 클라 모달(조회/추가/수정/삭제). 교사 `events-calendar.tsx`/`DayDetailModal` UX 참고. body 길이·개수 제한.

### ⑥ 오늘의 학교
1. **미들웨어**: `middleware.ts` 모바일 `/`→`/today`를 세션당 1회 쿠키(예: `today_seen`, 세션/당일 만료)로 가드. 쿠키 있으면 `/` 허용.
2. **상시 배너**: `app/today/page.tsx` 최상단에 `NudgeBanner` 렌더(홈 패턴 재사용). 기존 모달 유지.
3. **행동특성 가중랜덤**: `lib/db/queries/nudge.ts`에 담임반 학생별 행동특성 기록수 집계(`behaviorStudentCounts`) 추가, `lib/domain/nudge.ts` `weightedPickLeastRecorded`(rng 주입 가능, 순수) 재사용(별도 카운트). **타입 변경 명시(Architect)**: `NudgeInput`에 `behaviorStudentCounts` 입력, `NudgeResult`에 `behaviorPick:{ suggestedStudentId, ... }` 필드 추가, `assembleNudges`(nudge.ts:135) 및 소비처(`nudge-modal.tsx`, `nudge-banner.tsx`) shape 동반 수정.
4. **넛지 항목 + 딥링크**: `nudge-modal.tsx`/`nudge-banner.tsx`에 행특 항목 추가, "기록"→`/homeroom/behavior?studentYearId=...`. `behavior-client.tsx`가 쿼리스트링으로 학생 사전선택(토글)되도록 수정.
5. **이모지**: ⑦과 함께 적용.

### ⑦ 메인 페이지 (UI only)
1. `app/page.tsx` DashCard를 대표 8개만, 순서: 세팅실→오늘의학교→교실→담임교실→교무실→동아리실→통계실→인쇄실. 나머지 6개 제거.
2. 이모지: 🗓️ 오늘의 학교 · 🗂️ 교무실 · 📊 통계실 · 🖨️ 인쇄실 (기존 4개 유지).

## Risks and Mitigations
| Risk | Mitigation |
|------|-----------|
| ⑤ 공개 토큰 페이지 쓰기 남용/타학생 침투 | server action에서 토큰→studentYearId 역참조 강제, body 길이·개수 제한, 다른 studentYearId 접근 차단 테스트 |
| ① 시험구간 모델 전환이 기존 차시계획 회귀 유발 | 마이그 idempotent + 기존 통합테스트 유지, 여유차시 미저장→저장 전환 시 기본값 0 |
| 마이그 unique 키 ↔ Drizzle 스키마 불일치(0037 전례) | 손작성 SQL unique 키를 스키마와 1:1 대조 |
| ③ 출결 자동생성이 기존 수기 출결과 중복 | (studentYearId,date) 존재검사 후 insert, 교외체험 삭제 시 연동 정리 |
| ⑤ 영양 원인이 prod 마이그 미적용일 경우 prod DDL 필요 | prod 함수버전 먼저 확인, 적용은 사용자 승인 게이트 |
| ⑥ 쿠키 가드가 첫 진입 UX 깨뜨림 | 세션/당일 만료 쿠키 + 수동 `/today` 접근은 항상 허용 |

## Verification Steps
1. `npm run lint` + `npm run build` green.
2. `npm test` 통합 스위트 회귀 0 (현재 447 기준 이상), 신규 AC별 테스트 추가.
3. ⑤ 보안: 다른 토큰으로 타학생 메모 접근 시도 차단 테스트.
4. ⑥ 미들웨어: 모바일 UA 2회 연속 `/` 요청 시 1회만 리다이렉트 단위테스트.
5. 수동: 모바일 실기기 첫진입/재진입, 학생페이지 영양 표시·캘린더 모달 CRUD.

## Pre-mortem (deliberate, 3 시나리오)
1. **"영양이 여전히 안 나온다"** — 원인이 코드가 아니라 prod 마이그(0040 v5) 미적용인데 코드만 고쳐 배포 → 그대로 빈칸. 방지: 1단계에서 prod 함수버전·payload를 **먼저** 확인하고 결과를 문서화한 뒤 코드 손대기.
2. **"학생 메모가 다른 학생에게 보인다"** — server action이 토큰 검증 없이 studentYearId를 클라 신뢰 → 횡적 침투. 방지: 액션 진입점에서 토큰→studentYearId 단방향 도출만 사용, 클라 제공 studentYearId 무시. 침투 테스트 필수.
3. **"시험구간 전환 후 기존 사용자 차시계획이 깨진다"** — 여유차시가 미저장 로컬상태였는데 영속모델로 바꾸며 기존 화면 가정 붕괴. 방지: 마이그 후 기본 segment plan 0 시드, 기존 통합테스트 유지, 단계적 UI 이전.

## Expanded Test Plan (deliberate)
- **Unit**: `computeRemainingToExam`(구간리셋·경계), `computeUnitOrdinalSum`, 미들웨어 쿠키 가드, 행동특성 가중치 공식, 토큰→studentYearId 도출.
- **Integration**: 교외체험 등록→출결행 생성/검색(reason 필터), 학생메모 CRUD 토큰스코프, get_public_page에 메모·영양·개별공지 캐러셀 데이터 포함, 시험구간 plan upsert.
- **e2e/수동**: 모바일 첫진입/재진입, 학생 캘린더 모달 CRUD, 메인 8카드 순서·이모지, 영양 표시.
- **Observability**: 영양 진단 결과(함수버전·캐시상태) 1줄 로그/문서, 마이그 적용 로그.

## ADR
- **Decision**: ① 시험구간 계획은 신규 테이블 `exam_segment_plans`(named `uq_exam_segment_plans(subjectId,semester,examOrdinal)`); ⑤ 학생 메모는 신규 테이블 `student_calendar_memos` + **`get_public_page` v6 함수 마이그레이션** + DTO allowlist, 쓰기는 기존 `student-write.ts` 재사용; ③은 기존 `createAbsenceRangeRecords` 재사용(델타만).
- **Drivers**: 영속 데이터 필요(①), 공개 토큰 페이지 보안(⑤), 기존 인프라 재사용으로 신규 표면 최소화.
- **Alternatives considered**: ① `exam_targets` 컬럼확장(기각: SRP, 단 close call로 인정) / jsonb(기각: 질의성). ⑤ `today_calendar_memos` 재사용(기각: 교사소유→비공개 붕괴).
- **Why chosen**: 책임분리 + 형제 테이블 컨벤션 일치 + 공개페이지 단일 SQL 읽기경로 준수 + 검증된 토큰 어댑터 재사용.
- **Consequences**: 마이그 3개(0041 테이블, 0042 테이블, 0043 함수 v6). 공개 mutation 첫 도입 → 보안 테스트 필수. prod 함수버전 적용은 사용자 승인 게이트.
- **Follow-ups**: ⑧ 교무실/통계실/인쇄실(향후). prod 마이그 적용 승인. ⑤ public mutation rate/abuse 가드(현재 body 길이·개수 제한만; IP/토큰 rate 인프라 유무 확인). 마이그 0041/0042/0043 부분적용 시 롤백 절차 정의(0043 함수 v6 성공·테이블 부분실패 대비).

## Changelog (Architect 검토 반영)
1. ⑤ `get_public_page` v6 함수 마이그(0043) + DTO allowlist 추가 — 메모 읽기 경로 필수(blocking 누락 해소).
2. ⑤ 메모 쓰기를 `student-write.ts` 재사용으로 변경(자체 인증 재구현 제거, Principle 1).
3. ③ 자동 출결생성이 이미 존재(`createAbsenceRangeRecords`) — 델타(`noteField='체험학습'` + reason 필터)로 재범위화.
4. ① `computeRemainingToExam` 결정성 고정(examDate=calendarEvents, 소비ordinal 정의, clamp≥0, 구간리셋 트리거).
5. ① `uq_exam_segment_plans` named + `uq_exam_targets`와 컬럼셋 정렬(ownerId 제외).
6. ⑥ `NudgeInput`/`NudgeResult`/소비처 shape 변경 명시.

### Changelog (Critic 검토 반영)
7. ① `uq_exam_segment_plans` 키에서 `semester` 제거 → `(subjectId, examOrdinal)`로 `uq_exam_targets`와 진짜 일치(subjectId가 이미 학기-스코프, classes.ts:65).
8. ① AC-1.5 존치 스텝 추가(셀별 여유 토글 마커 삭제 금지).
9. ② page size 20 확정(`SECTION_PAGE_SIZE` 일관, 미결정 제거).
10. 명칭 정정 `today_memos` → `today_calendar_memos`(0039).
11. Follow-up: ⑤ write rate 가드, 마이그 부분적용 롤백 절차.
