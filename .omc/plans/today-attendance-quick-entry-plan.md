# 오늘의 학교 — 담임반 출결 빠른 입력 카드

**Status:** pending approval (consensus / RALPLAN-DR short mode)
**Date:** 2026-07-14
**Scope:** `/today` (오늘의 학교) 대시보드에 담임반 학생 출결을 즉시 기입·저장하는 카드 추가

---

## 요구사항 요약 (Requirements Summary)

사용자 요청(원문): "오늘의 학교에서 바로 오늘의 출결 상황을 간단하게 기입하는 칸이 있으면 좋겠습니다. 당연히 담임반만 가능합니다. 목록으로 간단하게 학생을 고르고 사유 등등 입력하고 저장 누르면 바로 저장되게."

해석:
1. `/today`(오늘의 학교) 화면 안에서 **바로** 오늘 날짜 출결을 기입할 수 있는 칸(카드).
2. **담임반 학생만** 대상(홈룸 미보유 교사는 노출 없음).
3. 목록에서 학생을 고르고 → 사유/성격/비고 입력 → **저장 즉시 반영**.
4. "간단하게" — 별도 화면 이동 없이 대시보드에서 완결.

### 핵심 사실 (코드 근거)
- `/today` 페이지: `app/(shell)/today/page.tsx:37` — 서버 컴포넌트, `force-dynamic`, `Promise.all` 위젯 그리드. `date`/`weekday`는 `kstToday()`(`today-lib`)에서 파생, `year=new Date().getFullYear()`.
- **동일 기능이 이미 존재**: `AttendancePeriodClient`(`app/(shell)/homeroom/attendance/attendance-period-client.tsx:27`) = 학생 select → 종류(kind) → 사유(reason) → 비고(noteField) → 저장. `useTransition`으로 즉시 저장.
- 저장 서버액션: `recordAttendanceAction(formData)`(`app/(shell)/homeroom/attendance/actions.ts:34`) — owner 가드 + `upsertAttendance` + `writeAudit`. 현재 **`revalidatePath("/homeroom/attendance")`만** 호출(‑today 아님).
- 결석 기간 입력: `addAbsenceRangeAction`(`actions.ts:109`) — 동일하게 `/homeroom/attendance`만 revalidate.
- 담임반 학생 목록: `listHomeroomStudents(db, ownerId, year)`(`lib/db/queries/observations.ts:440`) → `{id, sid, name}[]`, `homeroomMembers` 조인으로 **담임반만** 반환(홈룸 없으면 빈 배열).
- 당일 기록 조회: `listAttendanceByDate(db, ownerId, date)`(`lib/db/queries/attendance.ts:389`) → 기록 + `sid`/`name`. 실제로 attendance 룸 페이지는 이 결과를 홈룸 학생 id 집합으로 필터(`page.tsx:97-99`).
- 도메인 값: kind = `late|early_leave|absent_period|absent`(지각/조퇴/결과/결석), reason = `illness|accepted|unaccepted|etc`(질병/인정/미인정/기타). 칩 색상 `lib/domain/attendance-display.ts`.

**결론:** 새 저장 로직·마이그레이션·스키마 변경 불필요. 기존 검증된 컴포넌트/서버액션을 `/today`에 재사용(surface)하고, 즉시 반영을 위해 액션의 revalidate 대상에 `/today`를 추가하는 것이 핵심.

---

## RALPLAN-DR 요약 (short mode)

### Principles
1. **재사용 우선(DRY):** 출결 도메인 로직·검증·audit·신고서 파생은 이미 `recordAttendanceAction`/`upsertAttendance`에 집약돼 있다. 저장 경로를 절대 복제하지 않는다.
2. **담임반 스코프 = 서버에서 강제:** 대상 학생은 오직 담임반 학생. UI(select 옵션)뿐 아니라 **서버액션에서 roster 멤버십을 검증**한다(신뢰 경계). 카드 자체도 홈룸 학생 0명이면 렌더하지 않는다(요청의 "당연히 담임반만"). — Architect/Critic 합의: 기존 `recordAttendanceAction`은 `studentYearId`를 서버에서 검증하지 않아 UI-only 였으므로 본 작업에서 서버 가드를 추가한다.
3. **즉시 반영:** 저장 후 대시보드 카드의 "오늘 기록" 목록이 추가 클릭 없이 갱신된다.
4. **대시보드 무해성:** today 페이지의 기존 `Promise.all`/위젯 레이아웃·성능을 해치지 않는다(쿼리 2개 추가는 병렬).
5. **간결성(사용자 요청):** 카드는 대시보드 한 칸에 맞는 컴팩트 폼 + 짧은 당일 목록. 룸의 전체 기능(월별/학생검색/미제출/교외체험)은 링크로만 연결.

### Decision Drivers (top 3)
1. **정합성 리스크 최소화** — 출결 기록/신고서 파생 의미가 룸과 100% 동일해야 함(잘못된 기록은 신고서 티어·통계 오염).
2. **사용자 체감 단순성** — "간단하게", "바로 저장" 두 번 강조.
3. **구현/유지비용** — 추가 코드·상태·마이그 최소.

### Viable Options

#### Option A — 기존 `AttendancePeriodClient` 컴포넌트를 today 카드에 그대로 재사용 (**권장**)
**접근:** today 페이지에 `TodayAttendanceCard`(서버) 섹션을 추가하고 그 안에 기존 `AttendancePeriodClient`를 렌더. `recordAttendanceAction`·`addAbsenceRangeAction`에 `revalidatePath("/today")` 한 줄씩 추가. 당일 기록은 `listAttendanceByDate` → 홈룸 필터 → 컴팩트 읽기전용 목록으로 표시. 홈룸 학생 0명이면 카드 미렌더.
- **Pros:** 로직 복제 0, 룸과 의미 완전 동일(교시/기간 처리 포함), 코드량 최소, 회귀면 좁음.
- **Cons:** 폼이 late 기본값에서 교시 pivot fieldset을 노출 → "간단"보다 약간 조밀. today 그리드 폭(카드 1칸)에 폼이 다소 빽빽.

#### Option B — 경량 전용 `TodayAttendanceQuickCard` 신규 (학생·kind·reason·비고·저장만)
**접근:** today 전용 초경량 클라이언트 컴포넌트를 새로 작성. 교시/기간 입력 생략, `recordAttendanceAction` 재사용.
- **Pros:** UI가 가장 간결("간단하게"에 최적합), today 폭에 잘 맞음.
- **Cons:** 교시 입력을 생략하면 periods가 **공란이 되는 게 아니라 자동 기본값으로 조용히 오기록**된다 — `absentPeriods()`(`lib/domain/attendance.ts:18`)는 항상 non-empty 배열을 파생하므로, 예컨대 3교시 지각을 `pivotPeriod=0`으로 저장하면 조회(0)만 마킹된 지각으로 남는다(사용자가 의도한 교시가 소실). 즉 "정보 없음"이 아니라 "틀린 기본값"이 저장되어 룸/통계와 의미가 어긋난다. 폼 마크업도 룸과 갈라져 도메인 변경 시 2곳 유지.

**선정:** **Option A**. Driver 1(정합성)이 최우선. Option B의 유일한 우위(폼이 더 짧음)는 *교시 자동 오기록*이라는 의미 손실·이중 유지비용을 정당화하지 못한다. 사실 periods가 항상 파생된다는 점은 Option A(전체 pivot UI 유지)를 **더 강하게** 지지한다.

**Tension 인정(합의):** "간결성"과 "정합성"은 여기서 진짜로 상충한다. Option A는 정합성을 위해 룸의 전체 입력 표면(late 기본값에서 교시 pivot fieldset 노출)을 대시보드 카드로 들여오므로 사용자의 "간단하게" 요구를 완전히는 만족하지 못한다. 본 계획은 이 트레이드오프를 *해소했다고 주장하지 않고*, 정합성을 우선한 의식적 선택으로 채택한다(잘못된 출결은 신고서 티어·통계를 오염). 카드는 컴팩트 배치로 완화한다.

---

## 수용 기준 (Acceptance Criteria — testable)

- **AC-1** `/today` 접속 시(담임반 학생 ≥1) "오늘 출결" 카드가 렌더된다. 카드에는 학생 select, 종류 select, 사유 select, 비고 input, 저장 버튼이 있다. (파일: `app/(shell)/today/page.tsx`, 신규 `today-attendance-card.tsx`)
- **AC-2 (UI 파리티)** 학생 select 옵션 목록은 `listHomeroomStudents(db, ownerId, year)` 결과와 정확히 일치한다(담임반 외 학생은 옵션에 없음). 담임반 학생이 0명이면 카드가 **렌더되지 않는다**. — 이는 표시 계층 보장이며, 서버 강제는 AC-9 참조.
- **AC-3 (즉시 반영, 핵심 요구)** 학생 선택 + 종류/사유/비고 입력 후 저장 시 `recordAttendanceAction`이 호출되어 `attendance_records`에 오늘(`kstToday().date`) 기록이 upsert되고, 저장 직후 카드의 "오늘 기록" 목록에 해당 행(학번·이름·종류·사유·비고)이 **추가 새로고침 없이** 나타난다. 검증은 **선택 아님** — E2E 또는 문서화된 수동 확인으로 반드시 확인(사용자의 "바로 저장되게" 핵심).
- **AC-4** 저장 후 `/homeroom/attendance?view=today`로 이동하면 동일 기록이 그대로 보인다(단일 소스, 이중 기록 없음).
- **AC-5** `recordAttendanceAction`/`addAbsenceRangeAction` 호출 시 `revalidatePath("/today")`와 기존 `revalidatePath("/homeroom/attendance")`가 **둘 다** 실행된다. 검증 방법: 코드 리뷰 + E2E(Next 캐시 특성상 단위 단언 대상 아님). 참고: `/today`는 `force-dynamic`이라 온페이지 갱신은 라우터 refresh로도 일어나며 `revalidatePath("/today")`는 크로스-페이지/데이터캐시 무효화용으로 유지(무해).
- **AC-6** today 카드에서 저장한 기록의 audit 로그·신고서 파생(`reportRequired`)이 룸에서 저장한 것과 동일하다(같은 액션 경유이므로 자동 충족 — 통합 테스트로 확인).
- **AC-7** 카드 하단에 "출결 관리 전체 →" 링크(`/homeroom/attendance`)가 있어 월별/학생검색/미제출/교외체험 등 상세는 룸으로 연결된다.
- **AC-8** 기존 today 위젯(수업 카드/시간표/급식/캘린더/공지/신고서 요약)이 회귀 없이 그대로 렌더된다(추가 쿼리 2건은 기존 `Promise.all`에 합류, 순차 지연 없음).
- **AC-9 (담임반 서버 강제)** `recordAttendanceAction`·`addAbsenceRangeAction`에 담임반 외 `studentYearId`를 담은 크래프팅 POST를 보내면 **어떤 기록도 생성되지 않는다**(early return). 통합 테스트: 담임반 학생 id로는 성공, 비담임 id로는 무기록. `year`는 레코드 날짜(`date`/`startDate`)에서 파생해 연말/연초 경계 오탐을 방지한다.

---

## 구현 단계 (Implementation Steps)

### 1. 서버액션 — revalidate 확장 + 담임반 서버 가드 — `app/(shell)/homeroom/attendance/actions.ts`
**1a. revalidate 확장:** `recordAttendanceAction`(L70)와 `addAbsenceRangeAction`(L126)의 `revalidatePath("/homeroom/attendance")` 뒤에 `revalidatePath("/today")` 추가.
- (선택) `updateAttendanceAction`/`deleteAttendanceAction`에도 동일 추가 — today 목록 편집 일관성. 단, today 카드가 편집 기능을 노출하지 않으면 필수 아님. **본 계획은 today 카드를 입력+읽기전용 목록으로 한정**하므로 두 액션(record/range)만 필수.

**1b. 담임반 서버 가드(AC-9, R1):** `attendance.ts:449`의 기존 private `homeroomStudentIds(db, ownerId, year)` 헬퍼를 **export**로 승격하고 배럴(`lib/db/queries`)로 노출. 두 액션에서 `studentYearId` 검증 직후:
  - `recordAttendanceAction`: `const year = Number(date.slice(0, 4)); const ids = await homeroomStudentIds(db, ownerId, year); if (!ids.has(studentYearId)) return;` (기존 `date` 파싱 재사용).
  - `addAbsenceRangeAction`: `const year = Number(startDate.slice(0, 4)); ...` 동일 패턴.
  - **year는 레코드 날짜에서 파생**(현재 시각 `new Date().getFullYear()` 아님) — 연말/연초 경계 오탐 방지.
  - 이 가드는 룸에도 안전(룸도 담임반 학생만 이 액션에 투입하므로 정상 흐름 무영향, R7 참조). 룸/today 공용 액션이므로 두 화면 모두 하드닝됨.
  - **참고:** `upsertAttendance`/`addAbsenceRange` 자체는 `studentYears.ownerId`를 검증하지 않으므로(잠재 IDOR), 가드는 액션 계층에서 owner 스코프 roster로 방어한다.

### 2. today 데이터 로딩 — `app/(shell)/today/page.tsx`
- import에 `listHomeroomStudents`, `listAttendanceByDate` 추가(`@/lib/db/queries`).
- 기존 `Promise.all`(L51-81)에 두 쿼리 추가:
  - `listHomeroomStudents(db, ownerId, year)`
  - `listAttendanceByDate(db, ownerId, date)`
- 룸과 동일한 홈룸 필터 적용: `const homeroomIds = new Set(students.map(s => s.id)); const todayAttendance = records.filter(r => homeroomIds.has(r.studentYearId));`

### 3. 신규 카드 컴포넌트 — `app/(shell)/today/today-attendance-card.tsx` (server)
- props: `students: HomeroomStudent[]`, `date: string`, `records: (AttendanceRow & {sid; name})[]`.
- `students.length === 0`이면 `null` 반환(AC-2, 홈룸 없으면 미렌더).
- 상단: 기존 `AttendancePeriodClient`(`students`, `date`) 재사용(재작성 금지).
- 하단: 당일 기록 컴팩트 목록 — 학번·이름 + kind/reason 칩(`ATTENDANCE_KIND_CHIP`/`ATTENDANCE_REASON_CHIP` 재사용) + 비고. 기록 0건이면 "오늘 입력된 출결이 없습니다".
- 하단 링크: `<Link href="/homeroom/attendance">출결 관리 전체 →</Link>`.
- 카드 스타일은 기존 today 섹션(`rounded-lg border border-neutral-200 p-4/p-5`, `md:col-span-2`) 관례 준수.
- **계약 테스트(R6):** today 카드가 홈룸 학생 ≥1일 때 학생 select + 종류/사유 입력을 렌더하는지 단언하는 today-side 렌더 테스트를 추가한다. `AttendancePeriodClient`가 US-B13로 변경돼도 `/today` 카드 계약이 유지되는지 회귀 감지.

### 4. today 그리드에 카드 배치 — `app/(shell)/today/page.tsx`
- 위젯 그리드(L115)에 `<TodayAttendanceCard students={students} date={date} records={todayAttendance} />`를 적절 위치(예: 오늘 수업 카드 다음, `md:col-span-2`)에 삽입.

### 5. 검증
- `tsc --noEmit`, `vitest run`(관련 통합 테스트), `next build`.
- 통합 테스트: today 카드 저장 경로가 룸과 동일 레코드를 만드는지(AC-3/AC-4/AC-6).
- 수동/E2E: 담임반 有/無 두 계정에서 카드 노출·저장·즉시 반영.

---

## 위험 및 완화 (Risks & Mitigations)

| 위험 | 영향 | 완화 |
|---|---|---|
| R1: `recordAttendanceAction`에 `revalidatePath("/today")` 추가가 룸 흐름에 영향 | 낮음 | revalidate는 캐시 무효화만; 룸 동작 불변. 회귀 테스트로 룸 today 뷰 확인. |
| R2: today 카드가 홈룸 학생 없이 렌더되어 빈 select 노출 | 중 | AC-2: `students.length===0`이면 컴포넌트 `null` 반환. 통합 테스트로 홈룸 미보유 계정 검증. |
| R3: 추가 쿼리 2건으로 today 최초 로드 지연 | 낮음 | 기존 `Promise.all`에 합류(순차 아님). 두 쿼리 모두 단순 인덱스 조회. |
| R4: 교시 자동 오기록(Option B 채택 시 지각→조회-only 등) | — | Option A 채택으로 회피(전체 pivot UI 유지, 룸과 동일 파생). Option B는 이 사유로 기각. |
| R5: today 카드 목록이 홈룸 외 owner 기록까지 표시 | 중 | 룸과 동일하게 `homeroomIds` 집합으로 `listAttendanceByDate` 결과 필터(단계 2). |
| R6: `AttendancePeriodClient` 크로스-라우트 결합 — 컴포넌트가 `homeroom/attendance/` 소속이고 US-B13(`PERIOD_COUNT=7` 하드코딩, L19-20 주석)로 변경 예정 → 미래 수정이 `/today`를 조용히 바꿈 | 중 | today-side 렌더/계약 테스트 추가(단계 3): today 카드가 학생 select + kind/reason 입력을 렌더하는지 단언. US-B13 변경 시 회귀 감지. |
| R7: 담임반 서버 가드가 룸 정상 흐름을 막을 위험 | 낮음 | 룸도 담임반 학생만 액션에 투입하므로 무영향. `year`를 레코드 날짜에서 파생해 경계 오탐 방지. 다반 담임은 `listHomeroomStudents`가 전 반 학생을 합쳐 반환하므로 가드가 이를 그대로 상속(의도된 스코프). |

---

## 검증 단계 (Verification Steps)
1. `tsc --noEmit` (프로젝트 표준) — 타입 그린.
2. `vitest run` — 기존 출결/통합 테스트 그린 + 신규:
   - **AC-9 통합 테스트:** 담임반 id로 record/range 성공, 비담임 id로 무기록.
   - **AC-6 통합 테스트:** today 경유 저장이 룸과 동일 레코드/`reportRequired`/audit 생성.
   - **R6 계약 테스트:** today 카드 렌더 단언(학생 select + kind/reason).
3. `next build` — 빌드 그린.
4. **AC-3 즉시 반영 검증(필수, 선택 아님):** E2E(Playwright) 또는 문서화된 수동 확인 — 담임반 계정으로 `/today` → 학생 선택 → 사유 입력 → 저장 → 목록이 **추가 새로고침 없이** 갱신 → `/homeroom/attendance?view=today`에서 동일 기록 확인.
5. 담임반 미보유 계정으로 `/today` → 카드 미노출 확인.

---

## ADR

- **Decision:** `/today` 대시보드에 담임반 출결 빠른 입력 카드를 추가하되, 저장은 기존 `recordAttendanceAction`(+`addAbsenceRangeAction`)을 재사용하고 UI는 기존 `AttendancePeriodClient`를 그대로 렌더한다. 즉시 반영을 위해 두 액션에 `revalidatePath("/today")`를 추가하고, "담임반만" 요구를 신뢰 경계에서 보장하기 위해 두 액션에 **담임반 roster 서버 가드**를 추가한다.
- **Drivers:** 정합성 리스크 최소화 > 사용자 체감 단순성 > 구현/유지비용.
- **Alternatives considered:** (B) today 전용 경량 폼 신규 작성 — 교시 입력 생략 시 periods가 공란이 아니라 *자동 오기록*(지각→조회-only)되어 정합성 손실 + 폼 이중 유지, 기각. (암묵적 C) 룸으로 링크만 제공 — "오늘의 학교에서 바로 기입" 요구 미충족, 기각.
- **Why chosen:** 검증된 저장 경로·검증·audit·신고서 파생을 그대로 재사용해 잘못된 출결 기록 리스크를 0에 수렴시키면서, 대시보드 내 완결(바로 기입/즉시 저장) 요구를 충족. 신규 코드는 얇은 표시 카드 1개 + revalidate 2줄 + 서버 가드 + 쿼리 2건 로딩뿐.
- **Tension 인정:** 정합성 우선은 사용자의 "간단하게" 요구와 실제로 상충한다(late 기본값에서 교시 fieldset 노출). 본 결정은 이를 해소가 아닌 *의식적 절충*으로 채택하며, 컴팩트 카드 배치로 완화한다. 향후 "간결 UI + 정합성"을 모두 원하면 폼 본문을 `compact` prop 공유 컴포넌트로 추출하는 합성안(Architect 제안)이 후속 경로.
- **Consequences:** today 저장 시 `/today`와 `/homeroom/attendance` 양쪽 캐시 무효화. 서버 가드로 두 화면 모두 담임반 외 기록 차단(룸도 하드닝). today 카드는 입력+읽기전용 목록만 제공(편집/삭제/기간·교외체험은 룸) — 룸에서 삭제한 기록은 `/today`가 `force-dynamic`이라 다음 네비게이션/refresh 시 반영(별도 push 없음). 출결 도메인 변경 시 단일 컴포넌트만 유지(단, 크로스-라우트 결합은 R6 계약 테스트로 감시).
- **Follow-ups:** (1) today 카드 인라인 수정 필요 시 `EditableAttendanceTable` + `updateAttendanceAction`/`deleteAttendanceAction`에도 `/today` revalidate + 서버 가드 확장. (2) `compact` prop 공유 컴포넌트 추출(간결+정합성 합성). (3) `upsertAttendance`/`addAbsenceRange` 쿼리 계층 자체에 `studentYears.ownerId` 검증 추가(심층 방어).

---

## 변경 이력 (Changelog)
- Planner 초안(Option A 선정).
- **Consensus 반영(Architect SOUND-WITH-CONCERNS + Critic REVISE→충족):**
  - R1: 담임반 **서버 가드** 추가(단계 1b) + AC-9 신설 + Principle 2·AC-2 서버 강제로 재서술.
  - R2: Option B 기각 사유를 "교시 공란"→"교시 자동 오기록"으로 정정(`absentPeriods` 항상 non-empty), R4 재서술.
  - R3: 크로스-라우트 결합 위험 R6 + today-side 계약 테스트 추가.
  - R4: AC-3(즉시 반영) 검증을 필수로 승격, AC-5 검증 방법 명시(코드리뷰+E2E).
  - R5: 간결-정합성 tension을 ADR·옵션 선정에 명시적으로 인정.
  - 심층 방어 후속(쿼리 계층 ownerId 검증)·`compact` prop 합성안을 Follow-ups에 기록.
