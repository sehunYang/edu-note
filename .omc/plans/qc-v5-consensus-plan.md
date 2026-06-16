# QC v5 Consensus Implementation Plan (deliberate)

- Mode: DELIBERATE consensus (`/plan --consensus --deliberate --direct`)
- Input spec: `.omc/specs/deep-interview-qc-v5.md` (PASSED, ambiguity 3.8%)
- Branch base: `feat/qc-v4` (latest migration = `0037`, so new migrations start at `0038`)
- Scope: 8 in-place re-fixes (c1-c8) + 1 new independent component (c9 동아리실)
- Status: **pending approval** — consensus reached (Architect APPROVE_WITH_CHANGES → revised → Critic APPROVED, iter 2). No source/migration code is written by this document; execution requires separate explicit approval.

---

## 1. Requirements Summary (9 components)

| # | Component | One-line goal |
|---|-----------|---------------|
| c1 | 수업계획실 (classroom plan) | 단원명 자동채움(대/중), 총 차시수 표시·비교, "여유 차시" 입력 필드, 차시 자동채움, "여유차시로 등록" 토글(끝까지 1칸 시프트, 슬랙 한도 내, 토글 해제) |
| c2 | 진척도 (progress) | 차시 수행 체크 기반 폐기 → 완료 차시(`status='done'`)의 마지막 단원코드 자동 도출, 계획 대비 실제 일치도 + `exam_targets` 진도율, `jipilMid/FinalEnabled` 둘 다 false면 시험진도율 생략 |
| c3 | 담임교실 라우팅 | `app/homeroom/page.tsx` → `redirect("/homeroom/activities")` (trivial) |
| c4 | 출결 (attendance) | 교외체험 사후보고서 별도 탭 승격, 전탭 하단 중복섹션 제거, 에스컬레이션 재계산 버튼 제거, 미제출 탭을 attendance·fieldTrip 두 소스 **JS 머지**(reportTrackingId dedupe, slicePage 1회; SQL UNION 아님)로 확장. 테이블 물리통합 안 함 |
| c5 | 공지실 (notice) | 개별/전체 입력칸 분리, 다수 학생 토글+공통내용+추가 → 선택 학생 각자에게 **별도 개별공지 N개 생성** |
| c6 | 학생 안내 페이지 | 선택과목 색구분, 급식 날짜경계 KST 교정, 영양(NTR_INFO) stale cache 재동기화 + 메뉴 배열 렌더 점검 |
| c7 | 오늘의학교 (today) | 넛지 진입마다 지속(sessionStorage dismiss 제거), "다음에 하기"=모달만 닫고 배너 유지, 급식표 너비 수정, 캘린더 전체기간 조회(월 네비), 캘린더 메모(신규, today-only) |
| c8 | 상담 넛지 | 예약 슬롯 시각 경과 + 상담일지(`createCounselingLog`) 미작성 예약 → 신규 넛지 타입 |
| c9 | 동아리실 (clubroom) | 평면 `app/club` → 독립 컴포넌트 `/clubroom` 허브 + 하위 5: create/assign/plan/entry/record. 담임교실 layout·CRUD·생기부 패턴 재사용 |

**신규 경량 테이블은 정확히 2개:**
1. `club_activity_sessions` (c9 plan): `clubId, ordinal, date, plannedActivity` — 동아리 예정활동 저장처.
2. `today_calendar_memos` (c7): `ownerId, date, content` — 오늘의학교 전용 일자별 메모(다건/수정/삭제).

나머지(c1 여유차시 포함)는 전부 기존 스키마 재사용.

---

## 2. Acceptance Criteria (테스트 가능 형태로 승계)

### c1 수업계획실
- AC-1.1 세부단원 입력 시 동일 `majorNo` 존재 → `majorName` 자동채움; 동일 `(majorNo,midNo)` 존재 → `midName` 자동채움; `minorName`은 항상 수동. (검증: 동일 대단원 2번째 행 입력 시 대단원명 readonly/prefilled.)
- AC-1.2 학기계획에 "현재까지 저장된 총 차시수"(= 해당 과목 `lesson_plans` count)를 표시하고 대표분반 차시수와 비교. 다르면 안내 텍스트만 노출(강제 차단 없음).
- AC-1.3 맨 위 "여유 차시" 입력 필드 존재. `(세부단원 차시합 + 여유차시) == 대표분반 차시`이면 AC-1.2 안내가 사라진다.
- AC-1.4 차시계획은 기획 순서대로 자동 채워져 저장되며, 각 차시는 수정 가능.
- AC-1.5 차시 옆 "여유차시로 등록" 토글: 누르면 그 ordinal부터 끝까지 `unitId/content/keywords`가 한 칸씩 뒤로 이관되고 해당 칸은 빈(여유) 차시가 된다. 예약 여유차시 슬랙 한도 초과 시 버튼 비활성 + 경고. 다시 누르면 해제(내용 앞으로 당김, 원위치 복원). **시프트/해제가 `uq_lesson_plans(subject_id, ordinal)`(비-deferrable unique) 위반 없이 완료된다** — 내림차순 업데이트 또는 +1000 오프셋 2단계로 구현(검증: 5차시 이상 과목에서 중간 차시 토글 시 unique violation 미발생, 토글→해제 후 원본과 byte-identical).

### c2 진척도
- AC-2.1 "차시계획까지 저장된 과목"만(=해당 과목 `lesson_plans` 존재 + `class_sessions` 존재) 진척도 활성. 차시 수행 체크 입력 UI는 제거/폐기.
- AC-2.2 실제 진도 = `class_sessions.status='done'` 중 가장 마지막(날짜·ordinal) 차시에 연결된 단원코드에서 자동 도출(별도 입력 없음).
- AC-2.3 계획 진도 대비 실제 진도 일치도 표시 + `exam_targets` 시험별 목표진도 대비 진도율.
- AC-2.4 `jipilMidEnabled == false && jipilFinalEnabled == false`인 과목은 시험진도율 표기 생략, 단원진도만 표시.

### c3 담임교실 라우팅
- AC-3.1 `app/homeroom/page.tsx`가 `redirect("/homeroom/activities")` 만 수행(빌드 통과, 진입 시 자율·진로활동 탭으로 이동).

### c4 출결
- AC-4.1 "교외체험학습 등록"이 별도 탭으로 노출, 위치 = "오늘 입력" 다음. 기존 전탭 하단 중복 영구섹션 제거.
- AC-4.2 "에스컬레이션 재계산" 버튼 제거(액션 호출부 포함). pg_cron 00:05 자동 재계산만 유지.
- AC-4.3 교외체험(인정결석)이 출결검색에 노출(기존 동작, 회귀 없음 확인 — 통합테스트로 보증).
- AC-4.4 미제출 탭이 체험 사후보고서 미제출도 포함: `listUnsubmittedAttendance`가 attendance 소스와 field_trip 소스를 **각각 fetch → 양쪽 tier 계산 → 양쪽 homeroom 필터 → `reportTrackingId` 키 dedupe → `(date,sid)` 정렬 → 마지막에 slicePage 1회**의 JS 머지로 반환(SQL UNION 미사용). 검증: (a) 다일 체험 1건이 1행으로만 노출(date별 중복 폭발 없음), (b) 같은 사건이 attendance·fieldTrip 양쪽에 있어도 1행, (c) 페이지네이션이 합쳐진 목록 전체 기준으로 동작.

### c5 공지실
- AC-5.1 "교사 한마디" 개별/전체 공지 입력칸 분리 렌더.
- AC-5.2 개별공지란: 학생 토글 선택. 전체공지란: `target_scope='all'` 1건.
- AC-5.3 다수 학생 토글 + 공통내용 + "추가" → 선택 학생 각자에게 별도 개별공지 **N개** 생성(이후 각자 수정/삭제 가능). (검증: 3명 선택 시 3 row 생성, 각 row 독립 id.)

### c6 학생 안내 페이지
- AC-6.1 시간표 선택과목 글씨 색상 ≠ 공통과목 색상.
- AC-6.2 급식 필터 날짜경계: `get_public_page` 급식 서브쿼리의 `current_date`(UTC) → KST(`current_date AT TIME ZONE 'Asia/Seoul'` 류) 기준으로 교정. 자정~09:00 KST 지연 제거.
- AC-6.3 영양(NTR_INFO) 표기: 영양 마이그(0035) 이전 캐시 행 재동기화로 표기 복원. 메뉴 줄바꿈: separator가 `0036:172-174`에서 `string_agg(item, ', ')`(=`\n` 아님)임이 **확정**이므로, get_public_page v5(0040)에서 `string_agg(item, E'\n')`로 **변경하기로 결정** → `public-page-view.tsx:424`의 `whitespace-pre-line`이 항목별 줄바꿈을 렌더한다. 검증: 마이그 후 메뉴 항목이 줄바꿈으로 분리 노출.

### c7 오늘의학교
- AC-7.1 넛지: 해결 전까지 진입마다 모달 표시(sessionStorage dismiss 제거).
- AC-7.2 "다음에 하기"는 모달만 닫고 상단 넛지 배너는 유지.
- AC-7.3 급식표: 메뉴 글자 길이에 따라 너비 안 깨짐(동적 조절 또는 표기 방식 수정).
- AC-7.4 캘린더 전체기간 조회: today+30일 고정 → 조회 중인 월 범위. 과거 달도 당시 학사일정·상담 노출.
- AC-7.5 캘린더 메모(신규, today-only): 날짜 클릭 → 모달로 그날 학사일정·상담·메모 표시, "일정 추가하기"로 메모 추가(일자별 다건, 수정/삭제). **오직 오늘의학교 캘린더에서만** 노출(공개 페이지/타 캘린더 비노출).

### c8 상담 넛지
- AC-8.1 예약 슬롯 시각 경과 + `createCounselingLog` 없음 → 오늘의학교 넛지에 신규 타입으로 추가(딥링크는 상담실).

### c9 동아리실
- AC-9.1 `/clubroom` 허브 셸(`layout.tsx`, 담임교실 패턴) + `page.tsx = redirect("/clubroom/create")`(first-child).
- AC-9.2 하위 5 라우트 존재: `/clubroom/{create,assign,plan,entry,record}`.
- AC-9.3 개설: 교사 단일 동아리 생성(`createClub` 재사용).
- AC-9.4 배정: 전체 학생명단(`listStudents`)에서 수동 선택 배정(`addClubMember`). 외부 학생은 명단 선등록으로 후보 포함.
- AC-9.5 활동계획: `calendarEvents.eventKind='club'` 날짜 시퀀스 → 차시(ordinal, 날짜순 파생) 자동 생성(`representativeDates` 패턴), 차시별 날짜 표기 + 예정활동 기입(→ `club_activity_sessions`, **`(club_id, date)` 키 upsert**). 검증: club 이벤트 1개 추가 후 재생성 시 기존 날짜의 `planned_activity`가 보존된다(ordinal만 재계산).
- AC-9.6 활동입력: 차시별 공통(`creativeActivityRecords.commonBody`, area='club', clubId) + 학생별(`creativeActivityStudentOverrides.body`).
- AC-9.7 생기부: 공통+개별 병합 → `specialNoteDrafts type='club'` 초안(byte 한도 `BYTE_LIMITS["club"]`=3000). 신규 쿼리 `collectClubRecordSources(area='club', clubId)`.

Concreteness: 위 AC 25개 중 ≥23개가 파일/필드/관측가능 결과를 명시(>90%).

---

## 3. Implementation Steps

> 의존순서 기호: ⛓ = 선행 필수, ∥ = 병렬 가능 그룹. file:line 참조는 현 코드 기준(구현 시 드리프트 가능).

### Phase 0 — 마이그레이션 & 스키마 (⛓ 모든 c9/c7 후속의 선행)

**Step 0.1 — `lib/db/migrations/0038_club_activity_sessions.sql` (신규 테이블 1/2)**
- `club_activity_sessions`: `id, owner_id, club_id (fk clubs.id on delete cascade), ordinal int, date date, planned_activity text, timestamps`.
- **unique 키 결정 (M3 — reconcile 키와 정합)**: 활동계획 재생성(D.4)은 달력 club 이벤트 변경 시 **사용자 입력 `planned_activity`를 보존**해야 하므로 reconcile를 `(club_id, date)` 키로 한다(ordinal은 재생성마다 재계산되는 파생값). 따라서 **unique는 `uq_club_activity_sessions (club_id, date)`** 로 둔다(권장). ordinal 유일성도 필요하면 `(club_id, ordinal)`을 **병행** unique로 추가하되, ordinal 재배치 시 비-deferrable 충돌 우려가 있어 **기본은 `(club_id, date)` 단일 unique + ordinal은 비-unique 파생 컬럼**을 채택한다. 이 결정은 마이그 작성 **전** 확정(0.1 게이트). Drizzle 정의와 SQL `uq_*`를 **동일 단계/PR에서 작성·diff**(0037 교훈).
- RLS owner 정책은 기존 패턴(`0002_rls_policies.sql`) 동형으로 추가.
- Drizzle 스키마: `lib/db/schema/misc.ts`(clubs/clubMembers 옆)에 `clubActivitySessions` 테이블 추가, `lib/db/schema/index` export 확인. unique 키는 위 결정과 **1:1 일치**.

**Step 0.2 — `lib/db/migrations/0039_today_calendar_memos.sql` (신규 테이블 2/2)**
- `today_calendar_memos`: `id, owner_id, date date, content text, timestamps`. (다건 허용이므로 `(owner_id,date)` unique 두지 않음.)
- 인덱스: `(owner_id, date)` 보조 인덱스.
- Drizzle 스키마: 적절 스키마 파일(예: `lib/db/schema/misc.ts` 또는 today 도메인 파일)에 추가.

**Step 0.3 — `lib/db/migrations/0040_get_public_page_v5.sql` (c6 급식 KST 날짜경계 + 메뉴 separator, C3+M1 동일 마이그)**
- (KST, AC-6.2) `0036_get_public_page_v4.sql:181` `mc.date = current_date` → KST 기준 `mc.date = (now() AT TIME ZONE 'Asia/Seoul')::date`로 교체. 함수 v5 재정의(`CREATE OR REPLACE FUNCTION get_public_page`). **KST 치환은 급식 서브쿼리(line 177-181)에만 한정** — 동일 함수 내 다른 섹션의 `current_date`(예: counsel slots line 207, events line 112-113·122-123 등)는 건드리지 않는다(S3 회귀 방지).
- (메뉴 separator, M1 — **결정**) `0036_get_public_page_v4.sql:172-174`는 `concat_ws(' · ', mealType, string_agg(item, ', '))`로 항목을 **콤마+가운뎃점**으로 합친다 → `\n` 없음이 **확정 사실**. `public-page-view.tsx:424`의 `whitespace-pre-line`은 현 separator로는 줄바꿈이 절대 발생하지 않는다. **결정: 항목별 줄바꿈을 채택** — get_public_page v5에서 `string_agg(item, E'\n')`로 변경(메뉴 항목 사이만 개행; mealType 접두는 `concat_ws`로 유지하거나 별도 처리). 이 변경은 **KST와 동일 마이그(0040)** 에 포함한다. (대안: separator 유지 + 렌더에서 `whitespace-pre-line` 기대 제거 — 미채택.)
- 의존: c6 AC-6.2/AC-6.3(렌더 측). 영양 stale cache 재동기화(AC-6.3 데이터 복원)는 코드/운영작업이라 별도 — Step 6.2(Step A.4 참조).

**Step 0.4 — 기존 통합테스트 결정론화 (C3 — 시계의존 제거, ⛓ Step 0.3와 동일 PR)**
- 문제: c6 KST 마이그(0040)는 `lib/public/get-public-page-v4.integration.test.ts`(경로 정정 — 이전 plan의 `get-public-page-v4.integration.test.ts` 표기 동일 파일)를 깨뜨린다. 해당 테스트는 급식 행을 `today()`(UTC, line 49)로 삽입하고 v4 함수의 `mc.date = current_date`(UTC)와 매칭(assert line 153-155)한다. 마이그가 필터를 KST로 바꾸면 **UTC 15:00~24:00(= KST 익일 00:00~09:00) 구간 실행 시 삽입일과 필터일이 어긋나 적색**이 된다(시계의존 flake).
- 조치: 신규 경계 테스트 **추가만으로는 부족** — 기존 테스트를 결정론화한다. 둘 중 하나:
  - (택1) 급식 행 삽입 날짜를 **KST 기준 날짜**로 맞춘다(`(now() AT TIME ZONE 'Asia/Seoul')::date` 또는 동등한 KST helper)로 고정 — 함수 필터와 동일 기준.
  - (택2) 테스트에 **주입 가능한 clock**(고정 기준일)을 도입해 삽입·assert가 동일 KST 기준일을 쓰게 한다. 주의: 마이그 필터는 절대식 `AT TIME ZONE 'Asia/Seoul'`이라 세션 `SET TIME ZONE`으로는 바뀌지 않으므로, 세션 TZ 변경이 아니라 삽입일/assert일을 KST로 일치시키는 방식이어야 한다(택1이 가장 단순·확실).
- 명시: "**429 green 게이트가 시계의존이 되지 않도록**" 한다. 이 단계는 0.3과 같은 PR에서 처리(마이그+테스트 동반 변경).

> 마이그 적용 게이트: **로컬·스테이징만 자동 적용**. prod 적용은 사용자 승인 게이트(과거 v3/v4 관행). 마이그 번호 충돌 없는지 적용 전 `Glob lib/db/migrations/*.sql` 재확인.

### Phase A — 독립 in-place 재수정 (마이그 무관 그룹, ∥ 병렬)

**Step A.1 (c3, trivial) — `app/homeroom/page.tsx`**
- 내용 전체를 `app/classroom/page.tsx:1-8` 패턴 복제: `import { redirect }` + `redirect("/homeroom/activities")` + `export const dynamic="force-dynamic"`.

**Step A.2 (c4 출결) — 별도 탭 승격 + 버튼 제거**
- 교외체험 등록 UI: `app/homeroom/attendance/**`(탭 컴포넌트)에서 사후보고서 섹션을 별도 탭("교외체험학습 등록", 위치 = 오늘 입력 다음)으로 이동. 기존 전탭 하단 중복 영구섹션 JSX 제거.
- 에스컬레이션 재계산 버튼: 버튼 JSX + 호출 액션 제거. 백엔드 `lib/db/queries/escalation.ts:104 recomputeEscalation`는 pg_cron이 호출하므로 **함수 보존**(UI 트리거만 제거).
- 미제출 통합 (C1 — **SQL UNION 금지, JS 머지 메커니즘 명시**): `lib/db/queries/attendance.ts:580 listUnsubmittedAttendance`를 다음 절차로 재작성한다. 현 함수는 SQL select 1회 후 **JS에서** `.filter(ids = homeroomStudentIds, line 622)` + tier 계산(line 623-633) + `slicePage(line 635)`를 수행한다. 단일 SQL UNION으로 합치면 이 JS homeroom 필터·slicePage 단계를 우회·중복시키므로 **금지**한다. 대신:
  1. **attendance 소스 별도 fetch** — 기존 `attendanceRecords` ⋈ `reportTracking(attendanceRecordId)` select(line 593-606)를 raw 행으로 가져온다(페이징 전).
  2. **field_trip 소스 별도 fetch** — `field_trip_reports` ⋈ `report_tracking(fieldTripId)` 미제출 행을 **별도 쿼리**로 가져온다(`addFieldTrip` line 239의 마감/티어 입력 형태 참조).
  3. **양쪽 tier 계산** — 두 소스 각각 `remainingSchoolDays`(line 639) + `submissionTier`로 tier 부여(같은 헬퍼 재사용, `sortedSchoolDays` 1회 조회 공유).
  4. **양쪽 homeroom 필터** — `ids = await homeroomStudentIds(...)`(line 587)를 attendance·fieldTrip 두 소스 모두에 `.filter((r) => ids.has(r.studentYearId))` 적용.
  5. **dedupe — `reportTrackingId` 키**: merge 후 **신고서 추적 단위 `reportTrackingId`**로 dedupe(권장). 다일 체험(`startDate..endDate`)은 단일 attendance date와 `(studentYearId, date)` 키로는 collapse되지 않아야 하므로 **`(studentYearId, date)` 단순 키 금지**. `reportTrackingId`가 null인 경로가 있으면 `(studentYearId, 'attendance'|'fieldTrip', attendanceRecordId|fieldTripId)` 사건식별자로 폴백한다. 같은 사건이 양쪽 소스에 동시 등장하면 1건만 남긴다.
  6. **정렬 후 마지막에 slicePage 1회** — merge·dedupe 결과를 `(date, sid)`로 정렬하고 **`return slicePage(merged, opts)`를 최종 단계에서 단 한 번** 호출한다(소스별 slicePage 금지 — 페이지 경계 깨짐).
  반환 형태는 기존 `UnsubmittedAttendanceRow`(line 570)와 동일하게 유지하고, fieldTrip 소스 행도 `toStudentRow`/`STUDENT_ROW_COLUMNS`(line 590) 모양에 맞춘다.

**Step A.3 (c5 공지실) — 개별/전체 분리 + N개 생성**
- `app/homeroom/notice/**`(page + actions): "교사 한마디" 폼을 개별/전체 두 입력칸으로 분리.
- 전체: `target_scope='all'` 1건(기존 `teacher_notes` + `teacher_note_target` 0034 마이그 패턴).
- 개별: 학생 토글 멀티선택 + 공통 body. 액션은 `app/homeroom/activities/actions.ts:42 bulkSaveActivityAction` 패턴(학생 1명당 row 1개 삽입)을 차용해 선택 학생 N명 각자에게 개별공지 N row 생성. 각 row 독립 수정/삭제.

**Step A.4 (c6 학생 안내, UI 부분) — 선택과목 색구분 + 메뉴 렌더 + 영양 재동기화**
- 선택과목 색: `app/p/[token]/public-page-view.tsx` 시간표 렌더에서 공통/선택 구분(student_elective_mappings 0024 기반 플래그)에 따라 className 색 분기(AC-6.1).
- 메뉴 줄바꿈 (M1 — **결정 반영**): separator는 `0036:172-174`에서 `concat_ws(' · ', …, string_agg(item, ', '))`로 `\n` 없음이 **확정**. 따라서 "점검"이 아니라 **결정 실행**: Step 0.3(0040)에서 `string_agg(item, E'\n')`로 변경되며, `public-page-view.tsx:424`의 `whitespace-pre-line`이 비로소 줄바꿈을 렌더한다. 렌더 코드 자체는 그대로 두되 마이그 적용 후 줄바꿈 노출을 검증.
- 영양 재동기화(AC-6.3 데이터): 0035 마이그 이전에 캐시된 `meal_cache` 행은 ntrInfo가 비어 있으므로, `lib/db/queries/calendar.ts:116`(meal_cache sync) 경로로 재동기화(전체 재페치 vs 0035 이전 행만 — open-questions 참조).

### Phase B — 오늘의학교 (c7, c8) — 마이그 0039 후 (⛓ Step 0.2)

**Step B.1 (c7 넛지/배너) — `app/today/**`, `app/nudge-banner.tsx`**
- `app/today/nudge-modal.tsx`: sessionStorage dismiss 로직 제거 → 진입마다 모달 표시(AC-7.1).
- "다음에 하기" 핸들러: 모달 state만 닫고 `app/nudge-banner.tsx` 배너는 유지(모달 dismiss가 배너를 숨기지 않게 분리)(AC-7.2).

**Step B.2 (c7 급식표 너비) — `app/today/**` 급식 표시 컴포넌트**
- 메뉴 셀 너비 동적/줄바꿈(`whitespace-pre-line` + `break-words` + max-width) 또는 표기 방식 수정으로 긴 메뉴에서 레이아웃 깨짐 방지(AC-7.3).

**Step B.3 (c7 캘린더 전체기간) — `app/today/events-calendar.tsx`**
- 현재 `month` state(line 42)는 클라이언트에 있으나 events/counsel는 서버에서 today+30 고정 페치. 월 네비게이션 시 해당 월 범위로 재조회하도록 변경(서버 액션 또는 클라이언트 fetch). today 기준 필터(line 18-26 kstToday) 유지하되 과거 달도 노출(AC-7.4).

**Step B.4 (c7 캘린더 메모, 신규) — `app/today/events-calendar.tsx` + 신규 actions + `today_calendar_memos`**
- 날짜 클릭 → 모달(그날 학사일정·상담·메모) + "일정 추가하기"로 메모 CRUD. 쿼리 계층 신규(`lib/db/queries/`에 today-memo 쿼리: list/create/update/delete by ownerId+date). 서버액션은 homeroom/activities/actions.ts 패턴(getOwnerId → 쿼리 → writeAudit → revalidatePath). **오직 오늘의학교 캘린더에서만** 노출(public-page-view 캘린더에 메모 미전달)(AC-7.5).

**Step B.5 (c8 상담 넛지) — `lib/domain/nudge.ts` + `lib/db/queries/counseling.ts` + today 조립부**
- `counseling.ts`: `listHomeroomUpcomingReservations`(line 396) 패턴으로 "예약 슬롯 시각 경과 + `createCounselingLog`(line 35) 없음" 예약 조회 쿼리 신규.
- `lib/domain/nudge.ts`: `NudgeInput`(line 75)·`NudgeResult`(line 93)·`assembleNudges`(line 111)에 신규 넛지 타입(예: `pendingCounselLogs`) 추가(순수 규칙, clock 주입 가능). today page 조립부에서 새 입력 전달 + 배너/모달 렌더(AC-8.1).

### Phase C — 진척도 & 수업계획실 (c2, c1) — 마이그 무관이지만 도메인 깊음 (∥ 서로 병렬)

**Step C.1 (c2 진척도) — `lib/db/queries/progress.ts` + `lib/domain/lesson-plan.ts` + 진척도 UI**
- `getSectionProgressStats`(line 398): 실제 진도율 산출을 "done 차시 수"가 아니라 **done 차시 중 마지막 단원코드 도출**로 보강. `class_sessions.status='done'` + `lesson_plans.unitId` → `lessonUnits` 6자리코드(line 485-488 `sixDigitCode`)로 마지막 단원 결정(AC-2.2).
- **슬랙 빈셀 제외 (M2 — 이 단계가 소유)**: `lib/domain/lesson-plan.ts`에 순수 predicate `isSlackCell(plan) = (plan.unitId == null && plan.content == null)`를 **1곳 정의**하고 c1 시프트·c2 도출에서 **공용 재사용**. 마지막 done 단원코드 도출 시 `isSlackCell`인 차시는 건너뛰어, 여유차시(빈셀)가 실제 진도로 오인되지 않게 한다. **c1→c2 통합테스트**(중간 차시를 여유차시로 토글 → 그 빈셀이 last-done-unit 도출에서 제외됨)를 이 단계가 소유한다.
- 활성 조건: `lesson_plans` + `class_sessions` 존재 과목만(AC-2.1). 차시 수행 체크 입력 UI 제거.
- 지필 판정: `subjects.jipilMidEnabled/jipilFinalEnabled`(classes.ts:74-75) 둘 다 false면 시험진도율 블록 생략, 단원진도만(AC-2.4). `exam_targets`(records.ts:176) 진도율은 유지.

**Step C.2 (c1 수업계획실) — `app/classroom/plan/**` + 도메인 시프트 헬퍼**
- 단원명 자동채움: 입력 폼에서 동일 `majorNo`/`(majorNo,midNo)` 기존 `lessonUnits`(records.ts:147-173) 조회 → `majorName`/`midName` prefill. `minorName` 수동(AC-1.1).
- 총 차시수 표시·비교: 과목 `lesson_plans` count vs 대표분반 차시수(`representativeDates`, lesson-plan.ts:60). 다르면 안내만(AC-1.2).
- "여유 차시" 입력 필드: 폼 상단 신설. `(세부단원 차시합 + 여유차시) == 대표분반 차시`이면 안내 사라짐(AC-1.3).
- 차시 자동채움: 기획 순서대로 `lesson_plans.ordinal` 자동 채움, 수정 가능(AC-1.4).
- "여유차시로 등록" 토글(AC-1.5, **핵심 난이도, C2 메커니즘 명시**): 순수 시프트 헬퍼(신규, `lib/domain/lesson-plan.ts` 또는 신규 파일)로 ordinal k부터 끝까지 `{unitId,content,keywords}`를 한 칸 뒤로 이관. 슬랙(여유차시 예약 수) 한도 초과 시 비활성/경고. 해제는 역연산(앞으로 당김). **저장 방식: 마이그 없이 기존 `lesson_plans` row의 필드만 재배치**(빈 차시 = unitId/content null인 ordinal).
  - **비-deferrable unique 처리 (필수)**: `uq_lesson_plans(subject_id, ordinal)`는 `0017_lesson_plans.sql:12`의 plain `unique(...)` = **비-deferrable**(per-statement 즉시 체크). 따라서 단일 트랜잭션 안에서 여러 row의 ordinal을 +1 하더라도 statement 단위로 transient 중복이 발생해 위반된다. 다음 **둘 중 하나**를 택해 구현한다:
    - (택1) **내림차순 업데이트**: 시프트 대상 row를 ordinal **가장 큰 것부터** 1건씩 +1 업데이트(`ORDER BY ordinal DESC`). 각 update 시점에 상위 슬롯이 비어 있어 중복 없음. 해제(역연산)는 ordinal **가장 작은 것부터** -1(오름차순)로 동일 원칙.
    - (택2) **임시 대형 오프셋 2단계**: 시프트 대상 전체 ordinal을 먼저 `+1000`(충돌 없는 영역)으로 일괄 이동 → 정착 위치로 `-999`(= 원래 +1) 일괄 이동. 해제도 동일 2단계.
  - ordinal 시프트는 `lib/domain/lesson-plan.ts`에 **순수 함수**(입력 plans[] → 출력 plans[])로 격리하고, 쿼리 계층이 위 (택1)/(택2) 적용 순서로 DB에 반영한다. 결정 근거는 RALPLAN-DR (b) 참조.

### Phase D — 동아리실 c9 (⛓ Step 0.1; 셸 먼저 → 하위 라우트)

**Step D.1 (셸, ⛓ 하위 전부의 선행) — `/clubroom` 허브**
- `app/clubroom/layout.tsx`: `app/homeroom/layout.tsx:1-81` 복제 — TABS 배열 5개(개설/배정/활동계획/활동입력/생기부), async Server Component, getOwnerId, 게이팅(동아리 미개설 시 안내), nav.
- `app/clubroom/page.tsx`: `app/classroom/page.tsx` 패턴 — `redirect("/clubroom/create")`(AC-9.1).

**Step D.2 (create) — `app/clubroom/create/{page.tsx,actions.ts}`**
- `createClub`(clubs.ts:23) 재사용. 교사 단일 동아리(기존 `app/club/page.tsx:18-146` 로직 이식, 허브 탭에 맞게 단일 동아리 전제로 단순화)(AC-9.3). 기존 `app/club` 디렉터리는 이관 후 제거 또는 redirect.

**Step D.3 (assign) — `app/clubroom/assign/{page.tsx,actions.ts}`**
- `listStudents`(year 전체 명단)에서 토글/선택 배정 → `addClubMember`(clubs.ts:103, onConflict 멱등). 외부 학생은 명단 선등록으로 후보 포함. `removeClubMember`(clubs.ts:125)로 제거. 액션은 homeroom/activities/actions.ts 패턴(AC-9.4).

**Step D.4 (plan, ⛓ Step 0.1) — `app/clubroom/plan/{page.tsx,actions.ts}` + `lib/db/queries/`**
- `calendarEvents.eventKind='club'`(enums.ts:116) 날짜 시퀀스 조회 → `representativeDates`(lesson-plan.ts:60) 패턴으로 정렬 → 각 날짜에 ordinal(파생) 부여.
- **reconcile by `(club_id, date)` (M3)**: club 이벤트가 추가/삭제/이동되어 재생성될 때, **`(club_id, date)` 키로 upsert**하여 기존 행의 사용자 입력 `planned_activity`를 보존한다. ordinal은 재생성마다 날짜순으로 재계산(파생)하되 planned_activity는 date 기준으로 유지/이월. 사라진 날짜의 행 삭제 정책(planned_activity 있으면 보존 경고 vs 삭제)은 구현 시 결정. `onConflictDoUpdate` target = `(club_id, date)` — Step 0.1 unique와 일치.
- 신규 쿼리(list/upsert club sessions by (clubId,date)). 차시별 날짜 표기 + 예정활동 기입 폼(AC-9.5).

**Step D.5 (entry) — `app/clubroom/entry/{page.tsx,actions.ts}`**
- 차시별 공통: `creativeActivityRecords`(records.ts:79, area='club', clubId, commonBody). 학생별: `creativeActivityStudentOverrides`(records.ts:90, body). 차시는 D.4의 `club_activity_sessions` 기준. 신규/기존 쿼리로 upsert(AC-9.6).

**Step D.6 (record, ⛓ D.5) — `app/clubroom/record/{page.tsx,actions.ts}` + `lib/db/queries/`**
- 신규 쿼리 `collectClubRecordSources`(area='club', clubId 필터) — `homeroom-record.ts:51 collectRecordSources` 패턴. 공통(commonBody) + 개별(override.body) 병합.
- 초안 저장: `saveHomeroomRecordDraft`(homeroom-record.ts:195) 패턴으로 `specialNoteDrafts type='club'`, byteLimit=`BYTE_LIMITS['club']`(byte-count.ts:21 = 3000), `byteLength`(byte-count.ts). 신규 `saveClubRecordDraft` 또는 area 확장(AC-9.7).

### Parallelization summary
- ∥ 동시 가능: Phase A 4스텝, Phase C 2스텝, (마이그 0038/0039/0040은 서로 독립).
- ⛓ 직렬: 0.1(unique 키 확정) → D.1 → D.2..D.6(D.6은 D.5 후); 0.2 → B.4; **0.3 ↔ 0.4 동일 PR(마이그+테스트 결정론화 동반)** → c6 검증; C.1의 `isSlackCell`(M2) → C.2 시프트가 공용.
- 권장 실행 순서: Phase 0(0.1 키 결정 → 마이그 0038/0039/0040 → 0.4 테스트 결정론화) → Phase A + C 병렬 → Phase B → Phase D.

---

## 4. Risks and Mitigations

| # | Risk | Mitigation |
|---|------|------------|
| R1 | **Prod 마이그 적용** 사고(0038/0039/0040) | prod 적용 = 사용자 승인 게이트(과거 관행). 로컬·스테이징 먼저. 적용 전 마이그 번호/충돌 재확인. RLS 정책 동봉. |
| R2 | **Drizzle 스키마 ↔ 손작성 SQL 불일치**(0037 교훈) | unique 키·컬럼·타입을 SQL과 Drizzle 정의에서 1:1 대조. `uq_club_activity_sessions(club_id, date)` 정확 일치(M3 결정 — ordinal은 파생 비-unique 컬럼). PR 전 `drizzle-kit` diff 또는 수동 대조. |
| R3 | **여유차시 토글 인덱스 시프트 정합성 + 비-deferrable unique 위반**(c1) | `uq_lesson_plans(subject_id,ordinal)`는 `0017_lesson_plans.sql:12` plain unique = 비-deferrable이라 **트랜잭션만으로는 per-statement transient 위반**이 난다. 따라서 (택1) 내림차순(가장 큰 ordinal부터) +1 업데이트 또는 (택2) +1000 임시 오프셋 후 정착 2단계 중 하나로 구현(해제도 동일 원칙). 시프트를 순수 함수로 격리 + 단위테스트(슬랙 한도, 토글/해제 역연산, 경계 ordinal) + **비-deferrable unique 위반 미발생 통합테스트**. 빈 차시는 unitId/content null로 유지(ordinal 보존). |
| R4 | **회귀**(통합테스트 429 green 유지) | 변경 전후 `RUN_DB_ITEST` 통합테스트 실행. 특히 c4(union 변경)·c2(progress 산식 변경)·c6(get_public_page v5)·c9(신규 area=club). architect/critic 리뷰 게이트. |
| R5 | **KST 날짜경계** 회귀(c6) | get_public_page v5에서 KST 변환을 급식 필터에만 적용(다른 섹션 영향 점검). 자정~09:00 경계 테스트 케이스. events-calendar의 `kstToday`(line 18)와 일관성. |
| R6 | **출결 머지 중복/누락**(c4) | attendance·fieldTrip 두 소스를 JS 머지(SQL UNION 아님) 후 **`reportTrackingId` 키**로 dedupe(다일 체험이 `(studentYear,date)`로 collapse되는 것 방지 — 단순 date 키 금지). addFieldTrip 인정결석 attendance 생성 경로와 이중집계 방지(같은 사건 1건). slicePage는 머지 후 1회만. |
| R7 | **일괄공지 N행 폭발**(c5) | 선택 학생 수 상한/확인 UX. 각 row 독립 id로 개별 수정/삭제 보장. audit에 batch id 기록(activities 패턴). |
| R8 | **c9 외부 학생 배정** 누락 | listStudents(연도 전체)에서 선택 — clubMembers는 studentYearId FK만이라 타반/외부도 가능(코드 확인됨). 명단 선등록 안내 문구. |
| R9 | **기존 `app/club` 잔존** 라우트 충돌 | 이관 후 `app/club`을 `/clubroom`으로 redirect 또는 제거. 홈 링크 갱신. |

---

## 5. Verification Steps

1. **Build/Lint**: `npm run build` + `npm run lint` (또는 프로젝트 표준 스크립트). 타입 통과.
2. **통합테스트**: `RUN_DB_ITEST=1` 통합테스트 전체 green(기존 429 baseline 유지·증가). 마이그 적용된 로컬/스테이징 DB 대상.
3. **컴포넌트별 검증**
   - c1: 동일 대단원 2행 입력→대단원명 prefill; 여유차시 토글→끝까지 시프트(비-deferrable unique violation 미발생), 슬랙 초과 시 비활성, 해제→원본 byte-identical 복원.
   - c2: lesson_plans 없는 과목 비활성; done 차시 마지막 단원코드 표기; jipil 둘 다 false 과목 시험진도율 미표기.
   - c3: `/homeroom` 진입 → `/homeroom/activities` 리다이렉트.
   - c4: 교외체험 별도 탭 존재 + 하단 중복 제거; 재계산 버튼 없음; 미제출 탭에 체험 미제출 포함(다일 체험 1행, reportTrackingId dedupe, slicePage 합산).
   - c5: 3명 선택+추가 → 개별공지 3 row, 전체공지 1 row.
   - c6: KST 00:30 시점 당일 급식 노출(지연 없음); 영양 재동기화 후 NTR 표기; 메뉴 항목 줄바꿈(separator E'\n' 후); **기존 get-public-page-v4 통합테스트가 시간대 무관 green**.
   - c7: 진입마다 모달; "다음에 하기" 후 배너 유지; 긴 급식 레이아웃 정상; 과거 달 학사일정 노출; 날짜 메모 추가/수정/삭제(today-only).
   - c8: 시각 경과 + 로그 없는 예약 → 넛지 노출, 딥링크 상담실.
   - c9: `/clubroom`→create 리다이렉트; 5탭 노출; 외부 학생 배정; club 이벤트 차시 자동생성+예정활동; 공통/개별 입력; type='club' 초안 3000byte 한도.
4. **리뷰 게이트**: architect APPROVED + critic 통과(과거 v4 관행). prod 마이그 적용은 사용자 승인 후.

---

## 6. RALPLAN-DR Summary

### Principles
1. **재사용 우선(brownfield)**: 담임교실 layout·activities CRUD·homeroom-record 생기부 패턴을 c9·c5·c7에 그대로 차용한다.
2. **마이그 최소주의**: 신규 테이블은 정확히 2개(예정활동·캘린더 메모). 나머지는 기존 스키마 재사용.
3. **물리 구조 보존, 동작만 통합**: 출결 테이블은 합치지 않고 union/중복제거로 동작 통합.
4. **순수 도메인 로직 격리·테스트가능**: 여유차시 시프트·넛지 조립을 순수 함수로 분리(rng/clock 주입).
5. **Drizzle↔SQL 정합성**: 손작성 마이그와 ORM 스키마를 unique 키까지 1:1 일치(0037 교훈).

### Decision Drivers (top 3)
1. 기존 자산(clubs/clubMembers/creativeActivityRecords/specialNoteDrafts type=club/report_tracking 다형/jipil 플래그)의 재사용 가능 범위.
2. 회귀 위험(통합테스트 429 green·prod 마이그 게이트) 최소화.
3. 사용자 정정으로 확정된 의미(단일 동아리, 일괄=N개 개별공지, 완료차시 마지막 단원코드 자동도출).

### Viable Options on key decisions

**(a) 동아리 차시 모델: 신규 `club_activity_sessions` vs `class_sessions` 재사용**
- Option A1 (채택) — 신규 경량 `club_activity_sessions(clubId,ordinal,date,plannedActivity)`.
  - Pros: 동아리=수업과 도메인 분리(과목/분반 FK 없음), `lesson_plans↔session_record` 분리와 동형, 예정활동 저장처 자연스러움. 스펙이 명시한 신규 테이블 1개에 정확히 부합.
  - Cons: 테이블 1개 추가(허용 한도 내).
- Option A2 (기각) — `class_sessions` 재사용.
  - Pros: 신규 테이블 0개.
  - Cons: `class_sessions`는 sectionId(과목/분반) 전제 — 동아리에 가짜 section 필요(오염), plannedActivity 컬럼 없음 → 어차피 컬럼 추가 마이그 필요. 도메인 혼선. **Invalidation: 오염·추가 마이그가 신규 테이블보다 비용 큼.**

**(b) 여유차시 이관 저장방식**
- Option B1 (채택) — 마이그 없이 기존 `lesson_plans` row 필드 재배치(빈 차시 = unitId/content null, ordinal 보존).
  - Pros: 마이그 0개, `uq_lesson_plans(subjectId,ordinal)` 그대로, 토글 해제=역연산 단순. 슬랙은 "예약된 빈 차시 수"로 표현.
  - Cons: 빈 차시 의미를 UI/쿼리에서 일관 해석 필요(→ M2 `isSlackCell` predicate로 해소); `uq_lesson_plans`가 **비-deferrable**(0017:12)이라 ordinal 시프트를 내림차순 또는 +1000 오프셋 2단계로 해야 함(C2 메커니즘, Step C.2 참조).
- Option B2 (기각) — `lesson_plans`에 `slackSessions`/`isSlack` 컬럼 신규(온톨로지 표의 slackSessions).
  - Pros: 여유차시 명시적 플래그.
  - Cons: 신규 컬럼 마이그 = "신규 테이블 딱 2개" 제약 밖 추가 변경, 시프트 로직 복잡도 비슷. **Invalidation: 제약(신규 2개)과 마이그 최소주의 위반, B1로 동일 AC 충족 가능.** (온톨로지의 slackSessions는 "논리적 슬랙 개념"으로 해석, 물리 컬럼 불필요.)

**(c) 일괄공지 처리: N개 개별행 vs 1행 다중타겟**
- Option C1 (채택) — 선택 학생 각자에게 별도 개별공지 N행 생성.
  - Pros: 사용자 정정으로 확정(이후 각자 수정/삭제). activities bulk 패턴 그대로.
  - Cons: row 수 증가(R7 완화).
- Option C2 (기각) — 1행 다중타겟(teacher_note_target N개, note 1개).
  - Cons: "각자 수정/삭제" 불가(공유 본문). **Invalidation: AC-5.3 요구("각자 수정/삭제 가능")와 직접 충돌.**

---

## 7. Pre-mortem (deliberate, 3 시나리오)

**S1 — 여유차시 토글이 비-deferrable unique를 위반하거나 ordinal 정합성을 깨뜨려 진척도까지 오염.**
가설: c1 시프트를 순진하게 트랜잭션 내 일괄 +1 하면 `uq_lesson_plans(subject_id,ordinal)`(0017:12 plain unique = 비-deferrable)의 per-statement 체크에 걸려 transient violation으로 실패한다. 또는 빈셀(slack)을 c2가 실제 진도로 오인해 잘못된 단원을 가리킨다.
조기경보: 토글 시 unique violation 예외, 시프트 단위테스트 실패, c1→c2 통합테스트 적색.
예방: 내림차순 +1(또는 +1000 오프셋 2단계) 구현 + 비-deferrable unique 위반 미발생 통합테스트; `isSlackCell` predicate(M2)로 c2 도출에서 빈셀 제외; 토글/해제 역연산 property test.

**S2 — 마이그 0038/0039/0040 중 하나가 prod에서 Drizzle 스키마와 어긋나 런타임 오류(0037 재발).**
가설: 손작성 unique/컬럼명이 ORM과 1자 다름 → 쿼리 실패.
조기경보: 로컬 itest에서 insert/onConflict 실패.
예방: SQL↔Drizzle 1:1 대조 체크리스트, 스테이징 선적용, prod는 사용자 승인 게이트.

**S3 — c6 KST 교정이 기존 통합테스트를 시계의존 flake로 만들거나 급식 외 섹션을 밀어버린다.**
가설: (a) get_public_page v5에서 current_date 치환을 급식 밖으로 확대하면 공지/시간표/캘린더가 하루 밀린다. (b) `lib/public/get-public-page-v4.integration.test.ts`가 급식 행을 UTC `today()`(line 49)로 삽입·assert(line 153-155)하므로 KST 필터로 바뀌면 UTC 15:00~24:00 실행 시 적색 → 429 green 게이트가 시계의존이 된다.
조기경보: 공개 페이지 스냅샷에서 비급식 섹션 날짜 변동; CI가 특정 시간대에만 적색(flake).
예방: KST 변환을 급식 서브쿼리(0036:177-181)에만 한정(Step 0.3); **Step 0.4로 기존 테스트의 급식 삽입일을 KST 기준으로 결정론화**(시계의존 제거); 자정~09:00 KST 경계 케이스 추가.

---

## 8. Expanded Test Plan (deliberate)

**Unit (순수 도메인)**
- 여유차시 시프트/해제 역연산, 슬랙 한도 경계(0/정확/초과), 빈 차시 ordinal 보존, `isSlackCell` predicate(M2) 참/거짓 경계.
- 진척도 마지막 done 단원코드 도출(여러 done 분포), jipil 둘 다 false → 시험진도율 생략.
- 넛지 조립: 상담 미작성 신규 타입(시각 경과 경계), clock 주입 결정론.
- 공지 N개 생성 매핑(선택 학생 수 = row 수).
- byteLength/BYTE_LIMITS['club'] 한도(3000) 경계.

**Integration (`RUN_DB_ITEST`)**
- 마이그 0038/0039/0040 적용 후 club_activity_sessions/today_calendar_memos insert·onConflict·RLS. club_activity_sessions는 `(club_id, date)` onConflict 보존 테스트(M3).
- **c1 비-deferrable unique**: 5차시+ 과목에서 중간 차시 여유차시 토글 → `uq_lesson_plans` violation 미발생(내림차순/오프셋 메커니즘), 토글→해제 후 원본 동일.
- **c1→c2 연계(M2)**: 여유차시 빈셀이 last-done-unit 도출에서 `isSlackCell`로 제외됨.
- **c4 머지**: listUnsubmittedAttendance가 attendance·fieldTrip 두 소스 머지 + `reportTrackingId` dedupe. 다일 체험 1건이 1행, 같은 사건 양쪽 등장 시 1행, slicePage 합산 기준.
- c2 getSectionProgressStats done 단원코드 산식.
- c6 get_public_page v5 급식 KST 경계(자정 직후 당일 노출), 비급식 섹션 불변, **메뉴 separator `\n` 렌더**.
- **C3 결정론화**: 기존 `get-public-page-v4.integration.test.ts` 급식 케이스가 KST 고정으로 시간대 무관 green(UTC 15:00~24:00 구간 포함).
- c9 collectClubRecordSources(area='club') + saveClubRecordDraft type='club'.
- 기존 통합테스트 429 baseline green 유지(시계의존 아님).

**E2E (수동 또는 시나리오)**
- c3 redirect, c5 3명→3공지, c7 진입마다 모달/배너 유지/과거 달/메모 CRUD, c9 5탭 풀 플로우(개설→배정(외부학생)→계획(club 이벤트)→입력→생기부 초안).

**Observability**
- writeAudit 이벤트(공지 batch, 동아리 CRUD, 메모 CRUD) 기록 확인.
- 마이그 적용 로그(스테이징/prod) 보관, get_public_page 버전 v5 확인.
- 넛지 노출/해결 카운트(상담 신규 타입 발화 여부) 점검.

---

## 9. ADR

- **Decision**: 신규 경량 테이블 2개(`club_activity_sessions`, `today_calendar_memos`)만 추가하고, 동아리실을 `/clubroom` 독립 허브로 격상하며, 출결은 동작 통합(union), 여유차시는 기존 lesson_plans 필드 재배치, 일괄공지는 N개 개별행으로 구현한다.
- **Drivers**: 기존 자산 재사용 범위 / 회귀·마이그 위험 최소화 / 사용자 정정으로 확정된 의미.
- **Alternatives considered**: class_sessions 재사용(A2), slackSessions 컬럼 신규(B2), 1행 다중타겟 공지(C2), 출결 테이블 물리통합 — 모두 §6/스펙 Non-Goals로 기각.
- **Why chosen**: 제약("신규 2개")·마이그 최소주의·AC 직접 충족(각자 수정/삭제, 단일 동아리)을 동시에 만족하는 유일 조합.
- **Consequences**: 빈 차시(slack) 해석을 `isSlackCell` predicate(M2)로 일관 유지; ordinal 시프트는 비-deferrable unique 때문에 내림차순/오프셋 메커니즘 필수; 공지 row 수 증가; get_public_page 버전 v5로 상승(KST 필터 + 메뉴 separator `\n`); club_activity_sessions unique = `(club_id, date)`로 reconcile.
- **Follow-ups (open questions → `.omc/plans/open-questions.md`)**:
  - ~~메뉴 separator가 `\n`인지~~ → **해결**(M1): `\n` 아님 확정, v5에서 `E'\n'`로 변경 결정.
  - `app/club` 레거시 라우트 제거 vs redirect 정책.
  - 영양 재동기화 범위(전체 meal_cache 재페치 vs 0035 이전 행만).
  - prod 마이그 적용 타이밍(사용자 승인 게이트).
  - club_activity_sessions: `(club_id, date)` 단일 unique vs `(club_id, ordinal)` 병행 — Step 0.1 결정 권장안은 단일 `(club_id, date)`.
  - c4 dedupe: `reportTrackingId`가 null인 경로 존재 여부(폴백 사건식별자 필요성).
  - c1 시프트 메커니즘 (택1 내림차순 vs 택2 +1000 오프셋) 최종 선택.

---

## 10. Changelog — rev2 (Architect+Critic 컨센서스 REJECTED 반영)

차단(C1-C3) 3건을 "목표"가 아닌 **단계 텍스트(imperative) 메커니즘**으로 기계화하고, AC/검증/pre-mortem/test plan에 반영. 권고(M1-M3) 결정화.

| 항목 | 유형 | 반영 위치(단계/섹션) | 변경 요지 |
|------|------|---------------------|-----------|
| **C1** 미제출 통합 | 차단 | Step A.2 / AC-4.4 / R6 / 요약표 c4 / Pre-mortem(간접) / Test(Integration) / 검증 c4 | "union"을 **SQL UNION 금지**로 재작성. attendance·fieldTrip **각각 fetch → 양쪽 tier(remainingSchoolDays/submissionTier) → 양쪽 homeroom 필터 → `reportTrackingId` 키 dedupe(다일체험 collapse 방지) → (date,sid) 정렬 → 마지막 slicePage 1회**. line 580/587/622/623-633/635/639 참조. |
| **C2** 비-deferrable unique | 차단 | Step C.2 / AC-1.5 / R3 / Pre-mortem S1 / Test(Unit·Integration) / 검증 c1 / DR(b) | `uq_lesson_plans(subject_id,ordinal)`=0017:12 plain unique=비-deferrable 명시. 시프트는 **내림차순(가장 큰 ordinal부터) +1** 또는 **+1000 오프셋 2단계**. 해제도 동일. "비-deferrable unique 위반 없이 시프트" 검증 포함. |
| **C3** KST 마이그 ↔ 기존 테스트 | 차단 | **신규 Step 0.4** / Step 0.3 / Pre-mortem S3 / Test(Integration) / 검증 c6 | `lib/public/get-public-page-v4.integration.test.ts`(경로 정정)가 UTC `today()`(line 49) 삽입·assert(153-155)라 KST 필터로 UTC 15:00~24:00 구간 깨짐. **기존 테스트 결정론화**(급식 삽입일 KST 고정) 단계 신설. "429 green 게이트가 시계의존이 되지 않도록" 명시. |
| **M1** 메뉴 separator | 권고→**결정** | Step 0.3 / Step A.4 / AC-6.3 / ADR follow-up | separator는 0036:172-174 `string_agg(item, ', ')`+`concat_ws(' · ')`로 `\n` 아님 **확정**. **결정: v5(0040)에서 `string_agg(item, E'\n')`로 변경**(KST와 동일 마이그). "점검"→"결정". |
| **M2** isSlackCell predicate | 권고 | Step C.1 / Pre-mortem S1 / Test(Unit·Integration) / DR(b) | `lib/domain/lesson-plan.ts`에 `isSlackCell(plan)=(unitId==null && content==null)` **1곳 정의·공용**. c2 last-done-unit 도출에서 빈셀 제외. c1→c2 통합테스트를 Step C.1이 소유. |
| **M3** club 차시 reconcile 키 | 권고 | Step 0.1 / Step D.4 / AC-9.5 / ADR | reconcile을 ordinal이 아닌 **`(club_id, date)`** 키로 → 달력 변경 시 사용자 `planned_activity` 보존. unique 키 결정을 마이그 0038 작성 **전**으로 이동. 권장: `(club_id, date)` 단일 unique, ordinal=파생. |
| 정리 | 유지 | Step 0.1 / R2 / DR(b) | Drizzle clubActivitySessions ↔ SQL uq_* **동일 단계/PR 작성·diff**(0037 교훈) 명시 유지. slackSessions deviation은 B2에 문서화된 채로 유지. |

그 외 단계(c3·c5·c7·c8·c9 셸/CRUD/생기부)는 rev1 그대로 유지.
